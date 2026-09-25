"""Local HTTP server for the browser picklist app: serves webapp/dist and
persists newly added packages straight into bom.csv/package_info.csv, so every
computer that opens the app (and the Excel/Python pipeline) sees the same data
instead of one browser's localStorage.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import threading
import urllib.parse
import webbrowser
from dataclasses import asdict, replace
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from bom import BomEntry, load_bom_csv, write_bom_csv
from packages import PackageInfo, load_package_info_csv, write_package_info_csv
from mmp import (
    load_betalingen,
    load_correcties,
    load_prijzen,
    parse_betalingen,
    parse_correcties,
    parse_instellingen,
    parse_prijzen,
    write_betalingen,
    write_correcties,
    write_instellingen,
    write_prijzen,
)
from sales import (
    VerkoopOrder,
    load_geannuleerd,
    load_verkoop_csv,
    merge_new_orders,
    verwijder_geannuleerd,
    write_geannuleerd,
    write_verkoop_csv,
)
from tools.build_webapp_data import MMP_PATHS, build_data_js, build_mmp_data_js, build_verkoop_data_js, mmp_data

PROJECT_DIR = Path(__file__).resolve().parent
DIST_DIR = PROJECT_DIR / "webapp" / "dist"
BOM_CSV_PATH = PROJECT_DIR / "bom.csv"
PACKAGE_INFO_CSV_PATH = PROJECT_DIR / "package_info.csv"
DATA_JS_PATH = DIST_DIR / "data.js"
VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"
GEANNULEERD_CSV_PATH = PROJECT_DIR / "verkoop_geannuleerd.csv"
VERKOOP_DATA_JS_PATH = DIST_DIR / "verkoop_data.js"
MMP_DATA_JS_PATH = DIST_DIR / "mmp_data.js"

# The "Back-up" button in the app. Bas and a colleague both run the app from
# the shared K: copy, so bom.csv/package_info.csv there can be newer than
# this git checkout at any moment — the button pulls those two files in
# before committing, never the other way round, so an in-app edit made from
# K: can never get clobbered by an older version from here. Once committed,
# everything *except* those two files gets mirrored back out to K: so a
# colleague launching from there also gets the latest app code.
CANONICAL_REPO_DIR = Path(r"C:\picklist")
SHARED_COPY_DIR = Path(r"K:\Bas Heijnen\PICKLIST CLAUDE")
SHARED_DATA_FILES = [
    "bom.csv",
    "package_info.csv",
    "verkoop_orders.csv",
    "verkoop_geannuleerd.csv",
    "mmp_prijzen.csv",
    "mmp_betalingen.csv",
    "mmp_correcties.csv",
    "mmp_instellingen.csv",
]
BACKUP_EXCLUDE_NAMES = {".git", ".claude", "__pycache__", ".pytest_cache"}

NEW_ITEMS_GROEP = "Nieuwe artikelen:"
POKON_GROEP = "Pokon:"
NEW_ITEMS_BASE_VOLGORDE = 900
KNOWN_GEBIEDEN = {"KOELING", "KAS", "KAMER", "POKON", "DOZEN"}

# Serializes the read-modify-write in do_POST so two concurrent/double-click
# requests can't both read the same "before" state and each append their own
# copy of the new rows.
_write_lock = threading.Lock()


def _insert_into_groep(bom_entries, gebied, groep):
    """Open a gap right after `groep`'s last item within `gebied`, shifting
    every later entry in that gebied up by one volgorde. Returns
    (updated_entries, insertion_volgorde), or (bom_entries, None) unchanged
    if `groep` isn't an existing category for this gebied — the caller then
    falls back to appending under "Nieuwe artikelen:" as before.
    """
    matching_volgordes = [
        entry.volgorde for entry in bom_entries
        if entry.gebied == gebied and entry.groep == groep
    ]
    if not matching_volgordes:
        return bom_entries, None
    insertion_volgorde = max(matching_volgordes) + 1
    shifted = [
        replace(entry, volgorde=entry.volgorde + 1)
        if entry.gebied == gebied and entry.volgorde >= insertion_volgorde
        else entry
        for entry in bom_entries
    ]
    return shifted, insertion_volgorde


def _validate_package_fields(payload):
    """Validate the fields shared by add_package/update_package. Returns
    (pakketnaam, doosnummers, parsed_components, pokon, pokon_aantal).
    Raises ValueError with a Dutch message on any problem. Does not look at
    `payload["pakketnummer"]` — the two callers each decide what that
    identity means (a brand-new one vs. an existing one being replaced).
    """
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")

    pakketnaam = str(payload.get("pakketnaam", "")).strip()
    doosnummers = str(payload.get("doosnummers", "")).strip()
    components = payload.get("components") or []
    pokon = payload.get("pokon")

    if not pakketnaam or not doosnummers or not components:
        raise ValueError("Vul pakketnummer, pakketnaam, doosnummer(s) en minstens één artikelregel in.")

    parsed_components = []
    for component in components:
        if not isinstance(component, dict):
            raise ValueError("Elke artikelregel moet een gebied en een naam hebben.")
        gebied = str(component.get("gebied", "")).strip()
        item = str(component.get("item", "")).strip()
        if not gebied or not item:
            raise ValueError("Elke artikelregel moet een gebied en een naam hebben.")
        if gebied not in KNOWN_GEBIEDEN:
            raise ValueError("Elke artikelregel moet een geldig gebied hebben (KOELING, KAS of KAMER).")
        try:
            aantal = float(component.get("aantal_per_pakket", 0))
        except (TypeError, ValueError):
            raise ValueError("Elke artikelregel moet een geldig aantal hebben.")
        if not aantal > 0:
            raise ValueError("Elke artikelregel moet een geldig aantal hebben.")
        parsed_components.append({
            "gebied": gebied,
            "item": item,
            "soort": str(component.get("soort", "")).strip(),
            "aantal_per_pakket": aantal,
            "groep": str(component.get("groep", "")).strip(),
        })

    if pokon is not None:
        if not isinstance(pokon, dict) or not str(pokon.get("naam", "")).strip():
            raise ValueError("Kies een geldige Pokon of laat het veld leeg.")

    pokon_aantal = 1.0
    if pokon:
        try:
            pokon_aantal = float(pokon.get("aantal", 1))
        except (TypeError, ValueError):
            raise ValueError("Ongeldig Pokon-aantal.")

    return pakketnaam, doosnummers, parsed_components, pokon, pokon_aantal


def _build_entries(pakketnummer, doosnummers, parsed_components, pokon, pokon_aantal, bom_entries):
    """Build the BomEntry rows for `pakketnummer`: each component is either
    inserted into its chosen existing category (shifting later items in that
    gebied to make room) or, if left blank/unknown, appended under "Nieuwe
    artikelen:" at the end. Returns (new_entries, bom_entries) — bom_entries
    may have shifted volgorde values applied by category insertion; combine
    it with new_entries for the full updated BOM.
    """
    new_entries = []
    for index, component in enumerate(parsed_components):
        groep, insertion_volgorde = None, None
        if component["groep"]:
            bom_entries, insertion_volgorde = _insert_into_groep(
                bom_entries, component["gebied"], component["groep"]
            )
            groep = component["groep"]
        if insertion_volgorde is None:
            groep = NEW_ITEMS_GROEP
            insertion_volgorde = NEW_ITEMS_BASE_VOLGORDE + index
        new_entries.append(
            BomEntry(
                pakketnummer=pakketnummer,
                gebied=component["gebied"],
                item=component["item"],
                soort=component["soort"],
                aantal_per_pakket=component["aantal_per_pakket"],
                groep=groep,
                volgorde=insertion_volgorde,
            )
        )
    if pokon:
        new_entries.append(
            BomEntry(
                pakketnummer=pakketnummer,
                gebied="POKON",
                item=str(pokon.get("naam")),
                soort="",
                aantal_per_pakket=pokon_aantal,
                groep=POKON_GROEP,
                volgorde=NEW_ITEMS_BASE_VOLGORDE,
            )
        )
    for index, box in enumerate(part.strip() for part in doosnummers.split("+")):
        if box:
            new_entries.append(
                BomEntry(
                    pakketnummer=pakketnummer,
                    gebied="DOZEN",
                    item=box,
                    soort="",
                    aantal_per_pakket=1.0,
                    groep="",
                    volgorde=NEW_ITEMS_BASE_VOLGORDE + index,
                )
            )
    return new_entries, bom_entries


def add_package(payload, bom_csv_path=BOM_CSV_PATH, package_info_csv_path=PACKAGE_INFO_CSV_PATH):
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    pakketnummer = str(payload.get("pakketnummer", "")).strip()
    if not pakketnummer:
        raise ValueError("Vul pakketnummer, pakketnaam, doosnummer(s) en minstens één artikelregel in.")

    pakketnaam, doosnummers, parsed_components, pokon, pokon_aantal = _validate_package_fields(payload)

    packages = load_package_info_csv(package_info_csv_path)
    bom_entries = load_bom_csv(bom_csv_path)
    if any(entry.pakketnummer == pakketnummer for entry in bom_entries) or any(
            existing.pakketnummer == pakketnummer for existing in packages):
        raise ValueError(f"Pakketnummer {pakketnummer} bestaat al.")

    new_entries, bom_entries = _build_entries(
        pakketnummer, doosnummers, parsed_components, pokon, pokon_aantal, bom_entries
    )
    write_bom_csv(bom_entries + new_entries, bom_csv_path)

    new_package = PackageInfo(
        pakketnummer=pakketnummer,
        pakketnaam=pakketnaam,
        pokon="ja" if pokon else "nee",
        doosnummers=doosnummers,
    )
    write_package_info_csv(packages + [new_package], package_info_csv_path)

    return new_package, new_entries


def update_package(pakketnummer, payload, bom_csv_path=BOM_CSV_PATH, package_info_csv_path=PACKAGE_INFO_CSV_PATH):
    """Replace an existing package's BOM rows and package_info row with a
    freshly validated set built from `payload`, keeping `pakketnummer`
    unchanged (renaming a pakketnummer is not supported — delete and re-add
    if that's ever really needed).
    """
    pakketnummer = str(pakketnummer).strip()
    if not pakketnummer:
        raise ValueError("Ongeldig pakketnummer.")

    pakketnaam, doosnummers, parsed_components, pokon, pokon_aantal = _validate_package_fields(payload)

    packages = load_package_info_csv(package_info_csv_path)
    bom_entries = load_bom_csv(bom_csv_path)
    if not any(existing.pakketnummer == pakketnummer for existing in packages):
        raise ValueError(f"Pakketnummer {pakketnummer} bestaat niet.")

    remaining_bom = [entry for entry in bom_entries if entry.pakketnummer != pakketnummer]
    remaining_packages = [entry for entry in packages if entry.pakketnummer != pakketnummer]

    new_entries, remaining_bom = _build_entries(
        pakketnummer, doosnummers, parsed_components, pokon, pokon_aantal, remaining_bom
    )
    write_bom_csv(remaining_bom + new_entries, bom_csv_path)

    new_package = PackageInfo(
        pakketnummer=pakketnummer,
        pakketnaam=pakketnaam,
        pokon="ja" if pokon else "nee",
        doosnummers=doosnummers,
    )
    write_package_info_csv(remaining_packages + [new_package], package_info_csv_path)

    return new_package, new_entries


def add_verkoop_orders(payload, verkoop_csv_path=VERKOOP_CSV_PATH, geannuleerd_csv_path=GEANNULEERD_CSV_PATH):
    """Voegt de orderregels uit een upload toe en verwerkt de meegestuurde
    geannuleerde ordernummers: die (en hun `-pokon`-regel) verdwijnen uit
    verkoop_orders.csv en worden onthouden in verkoop_geannuleerd.csv, zodat
    een latere (oudere) export ze niet opnieuw toevoegt.
    """
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    datum = str(payload.get("datum", "")).strip()
    rows = payload.get("rows") or []
    nieuw_geannuleerd = {str(nr).strip() for nr in (payload.get("geannuleerd") or []) if str(nr).strip()}
    if not datum or not (rows or nieuw_geannuleerd):
        raise ValueError("Kies een datum en upload minstens één orderregel.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", datum):
        raise ValueError("Datum moet het formaat JJJJ-MM-DD hebben.")

    new_orders = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Elke orderregel moet een ordernummer, kanaal en pakketnummer hebben.")
        ordernummer = str(row.get("ordernummer", "")).strip()
        kanaal = str(row.get("kanaal", "")).strip()
        pakketnummer = str(row.get("pakketnummer", "")).strip()
        if not ordernummer or not kanaal or not pakketnummer:
            raise ValueError("Elke orderregel moet een ordernummer, kanaal en pakketnummer hebben.")
        new_orders.append(VerkoopOrder(ordernummer, datum, kanaal, pakketnummer, 1.0))

    geannuleerd = load_geannuleerd(geannuleerd_csv_path) | nieuw_geannuleerd
    existing = load_verkoop_csv(verkoop_csv_path)
    behouden = verwijder_geannuleerd(existing, geannuleerd)
    verwijderd = len(existing) - len(behouden)
    all_orders, toegevoegd, overgeslagen = merge_new_orders(behouden, verwijder_geannuleerd(new_orders, geannuleerd))
    write_verkoop_csv(all_orders, verkoop_csv_path)
    if nieuw_geannuleerd:
        write_geannuleerd(geannuleerd, geannuleerd_csv_path)
    return all_orders, toegevoegd, overgeslagen, verwijderd


# Per sectie: (inlezen, valideren, wegschrijven, sleutel van een regel). Een
# prijs is uniek per pakketnummer + ingangsdatum ("1.1@2026-10-01", of "1.1@"
# voor de startprijs zonder datum).
_MMP_SECTIES = {
    "prijzen": (load_prijzen, parse_prijzen, write_prijzen, lambda p: f"{p.pakketnummer}@{p.geldig_vanaf}"),
    "betalingen": (load_betalingen, parse_betalingen, write_betalingen, lambda b: b.id),
    "correcties": (load_correcties, parse_correcties, write_correcties, lambda c: c.ordernummer),
}


def save_mmp_sectie(sectie, payload, paths=MMP_PATHS):
    """Wijzigt één sectie van de Maison Privée-gegevens. Prijzen, betalingen
    en correcties worden per regel gewijzigd (`toevoegen`: regels erbij, of
    vervangen bij dezelfde sleutel; `verwijderen`: lijst met sleutels) op
    basis van wat er NU op schijf staat — nooit de hele lijst uit de browser
    overnemen, want een ouder tabblad of een collega met een eigen server op
    K: zou dan intussen toegevoegde betalingen wissen. Valideert eerst alles,
    zodat een fout nooit een half weggeschreven bestand oplevert.
    """
    if sectie != "instellingen" and sectie not in _MMP_SECTIES:
        raise KeyError(sectie)
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    if sectie == "instellingen":
        write_instellingen(parse_instellingen(payload.get("instellingen")), paths["instellingen"])
        return
    load, parse, write, sleutel = _MMP_SECTIES[sectie]
    toevoegen = parse(payload.get("toevoegen") or [])
    verwijderen = payload.get("verwijderen") or []
    if not isinstance(verwijderen, list):
        raise ValueError("Ongeldige aanvraag.")
    weg = {str(waarde).strip() for waarde in verwijderen}
    nieuw = {sleutel(regel): regel for regel in toevoegen}
    rijen = []
    for regel in load(paths[sectie]):
        waarde = sleutel(regel)
        if waarde in weg:
            continue
        # Een bestaande regel met dezelfde sleutel wordt op zijn plek vervangen.
        rijen.append(asdict(nieuw.pop(waarde, regel)))
    rijen.extend(asdict(regel) for regel in nieuw.values())
    write(parse(rijen), paths[sectie])


def _run_git(args):
    # Always targets the canonical checkout, never `PROJECT_DIR` — the
    # server (and this same button) can just as well be running from the
    # K: copy, which deliberately has no .git of its own.
    return subprocess.run(
        ["git", *args], cwd=CANONICAL_REPO_DIR, capture_output=True, text=True
    )


def _merge_verkoop_orders():
    """verkoop_orders.csv can grow on either side — an upload from this
    checkout, or one from a colleague running the app off K: — so unlike
    bom.csv/package_info.csv it can't just be pulled one-way. Both sides
    get unioned by ordernummer and each gets the merged result written
    back, so neither side's uploads are ever lost. Cancellations
    (verkoop_geannuleerd.csv) get unioned the same way and applied to the
    merged orders, so an order cancelled on one side can't come back from
    the other side's older copy.
    """
    c_path = CANONICAL_REPO_DIR / "verkoop_orders.csv"
    k_path = SHARED_COPY_DIR / "verkoop_orders.csv"
    c_geannuleerd_path = CANONICAL_REPO_DIR / "verkoop_geannuleerd.csv"
    k_geannuleerd_path = SHARED_COPY_DIR / "verkoop_geannuleerd.csv"
    c_orders = load_verkoop_csv(c_path)
    k_orders = load_verkoop_csv(k_path)
    geannuleerd = load_geannuleerd(c_geannuleerd_path) | load_geannuleerd(k_geannuleerd_path)
    merged, _, _ = merge_new_orders(c_orders, k_orders)
    merged = verwijder_geannuleerd(merged, geannuleerd)
    write_verkoop_csv(merged, c_path)
    write_verkoop_csv(merged, k_path)
    write_geannuleerd(geannuleerd, c_geannuleerd_path)
    write_geannuleerd(geannuleerd, k_geannuleerd_path)


def _pull_shared_data():
    """Copy bom.csv/package_info.csv FROM the shared K: copy INTO the git
    checkout — the only direction that can't lose a colleague's in-app edit,
    since they run the app from K:, not from this checkout. verkoop_orders.csv
    and verkoop_geannuleerd.csv are handled separately (see
    _merge_verkoop_orders) since, unlike the other files, they can grow
    independently on either side.
    """
    for filename in SHARED_DATA_FILES:
        if filename in ("verkoop_orders.csv", "verkoop_geannuleerd.csv"):
            continue
        source = SHARED_COPY_DIR / filename
        if source.exists():
            shutil.copy2(source, CANONICAL_REPO_DIR / filename)
    build_data_js(
        CANONICAL_REPO_DIR / "bom.csv",
        CANONICAL_REPO_DIR / "package_info.csv",
        CANONICAL_REPO_DIR / "webapp" / "dist" / "data.js",
    )
    try:
        build_mmp_data_js(
            {naam: CANONICAL_REPO_DIR / f"mmp_{naam}.csv" for naam in MMP_PATHS},
            CANONICAL_REPO_DIR / "webapp" / "dist" / "mmp_data.js",
        )
    except Exception as error:
        print(f"WAARSCHUWING: kan Maison Privée-gegevens niet inlezen: {error}")
    _merge_verkoop_orders()
    # A sales-data problem should never block the Back-up flow's core job of
    # committing/pushing/pulling code, so this gets its own try/except
    # separate from the bom.csv/package_info.csv build above.
    try:
        build_verkoop_data_js(
            CANONICAL_REPO_DIR / "verkoop_orders.csv",
            CANONICAL_REPO_DIR / "webapp" / "dist" / "verkoop_data.js",
        )
    except Exception as error:
        print(f"WAARSCHUWING: kan verkoop_orders.csv niet inlezen: {error}")
    try:
        build_verkoop_data_js(
            SHARED_COPY_DIR / "verkoop_orders.csv",
            SHARED_COPY_DIR / "webapp" / "dist" / "verkoop_data.js",
        )
    except Exception as error:
        print(f"WAARSCHUWING: kan verkoop_orders.csv niet inlezen: {error}")


def _push_code_to_shared_copy():
    """Mirror everything except the shared data files onto K:, so launching
    the app from there picks up the latest code too.
    """
    SHARED_COPY_DIR.mkdir(parents=True, exist_ok=True)
    for item in CANONICAL_REPO_DIR.iterdir():
        if item.name in BACKUP_EXCLUDE_NAMES:
            continue
        destination = SHARED_COPY_DIR / item.name
        if item.name in SHARED_DATA_FILES:
            # Nieuwe gedeelde bestanden (bijv. mmp_*.csv bij de eerste
            # uitrol) moeten één keer op K: komen, maar een bestaande K:-
            # versie wint altijd — die kan nieuwere invoer van een collega bevatten.
            if not destination.exists():
                shutil.copy2(item, destination)
            continue
        if item.is_dir():
            shutil.copytree(item, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(item, destination)


def _commit_all_changes(message):
    status = _run_git(["status", "--porcelain"])
    if status.returncode != 0:
        raise RuntimeError(f"git status mislukt: {status.stderr.strip()}")
    if not status.stdout.strip():
        return False
    add = _run_git(["add", "-A"])
    if add.returncode != 0:
        raise RuntimeError(f"git add mislukt: {add.stderr.strip()}")
    commit = _run_git(["commit", "-m", message])
    if commit.returncode != 0:
        raise RuntimeError(f"git commit mislukt: {commit.stderr.strip()}")
    return True


def run_backup():
    """Commit whatever changed locally FIRST — including bom.csv/package_info.csv
    edits made through this checkout's own UI — so pulling in K:'s (possibly
    older) copy below can never silently destroy them; at worst it lands as a
    second commit that needs a manual merge instead of vanishing without a
    trace. Then pull the shared data files in, commit that too if it changed
    anything, push, and mirror the (now up to date) code back out to K:. Runs
    under `_write_lock` so it can't interleave with a package save.
    """
    committed = _commit_all_changes(f"Back-up {datetime.now():%d-%m-%Y %H:%M}")

    k_sync_error = None
    if not SHARED_COPY_DIR.exists():
        k_sync_error = f"{SHARED_COPY_DIR} is niet bereikbaar. Staat de K:-schijf aangekoppeld?"
    else:
        try:
            _pull_shared_data()
            if _commit_all_changes(f"Sync vanaf K: {datetime.now():%d-%m-%Y %H:%M}"):
                committed = True
        except Exception as error:
            k_sync_error = f"Ophalen van K: mislukt: {error}"

    push = _run_git(["push"])
    if push.returncode != 0:
        raise RuntimeError(f"git push mislukt: {push.stderr.strip()}")

    if k_sync_error is None:
        try:
            _push_code_to_shared_copy()
        except Exception as error:
            k_sync_error = f"Wegschrijven naar K: mislukt: {error}"

    return {"committed": committed, "k_synced": k_sync_error is None, "k_sync_error": k_sync_error}


class PicklistRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self):
        # This app's own code changes underneath the same file names
        # (app.js, index.html, ...), so a browser caching them "normally"
        # can keep showing behavior from before the last edit indefinitely.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/backup":
            self._handle_backup()
            return
        if self.path == "/api/verkoop":
            self._handle_verkoop_upload()
            return
        if self.path != "/api/pakketten":
            self._send_json(404, {"error": "Onbekend endpoint."})
            return
        self._handle_pakketten_write(
            lambda payload: add_package(payload, BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH)
        )

    def _handle_backup(self):
        try:
            with _write_lock:
                result = run_backup()
            self._send_json(200, {"ok": True, **result})
        except Exception as error:
            self._send_json(500, {"ok": False, "error": str(error)})

    def do_PUT(self):
        mmp_prefix = "/api/mmp/"
        if self.path.startswith(mmp_prefix):
            self._handle_mmp_write(urllib.parse.unquote(self.path[len(mmp_prefix):]))
            return
        prefix = "/api/pakketten/"
        if not self.path.startswith(prefix) or len(self.path) <= len(prefix):
            self._send_json(404, {"error": "Onbekend endpoint."})
            return
        pakketnummer = urllib.parse.unquote(self.path[len(prefix):])
        self._handle_pakketten_write(
            lambda payload: update_package(pakketnummer, payload, BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH)
        )

    def _handle_pakketten_write(self, operation):
        """Parse the request body as JSON, run `operation(payload)` (either
        add_package or update_package, already bound to its other args), and
        send the resulting package+BOM rows as JSON — or a Dutch error.
        """
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (TypeError, ValueError):
            self._send_json(400, {"error": "Ongeldige aanvraag: kan de gegevens niet lezen."})
            return
        try:
            # Holding the lock across the read-modify-write means two
            # concurrent requests (e.g. a double-clicked save button) can't
            # both read the same "before" state and each append/replace their
            # own copy of the rows.
            with _write_lock:
                package, entries = operation(payload)
                build_data_js(BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH, DATA_JS_PATH)
                response_body = {"package": asdict(package), "bom": [asdict(entry) for entry in entries]}
            self._send_json(200, response_body)
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            # A local single-user tool: surface any unexpected failure (e.g. a
            # locked CSV file) as a readable message in the browser instead of
            # a bare connection reset.
            self._send_json(500, {"error": f"Onverwachte fout bij opslaan: {error}"})

    def _handle_verkoop_upload(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (TypeError, ValueError):
            self._send_json(400, {"error": "Ongeldige aanvraag: kan de gegevens niet lezen."})
            return
        try:
            # Holding the lock across the read-modify-write means two
            # concurrent requests (e.g. a double-clicked upload) can't both
            # read the same "before" state and each append their own copy
            # of the uploaded rows.
            with _write_lock:
                all_orders, toegevoegd, overgeslagen, verwijderd = add_verkoop_orders(
                    payload, VERKOOP_CSV_PATH, GEANNULEERD_CSV_PATH
                )
                build_verkoop_data_js(VERKOOP_CSV_PATH, VERKOOP_DATA_JS_PATH)
            self._send_json(200, {
                "toegevoegd": toegevoegd,
                "overgeslagen": overgeslagen,
                "verwijderd": verwijderd,
                "orders": [asdict(order) for order in all_orders],
            })
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            self._send_json(500, {"error": f"Onverwachte fout bij opslaan: {error}"})

    def _handle_mmp_write(self, sectie):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (TypeError, ValueError):
            self._send_json(400, {"error": "Ongeldige aanvraag: kan de gegevens niet lezen."})
            return
        try:
            with _write_lock:
                save_mmp_sectie(sectie, payload, MMP_PATHS)
                build_mmp_data_js(MMP_PATHS, MMP_DATA_JS_PATH)
                response_body = mmp_data(MMP_PATHS)
            self._send_json(200, response_body)
        except KeyError:
            self._send_json(404, {"error": "Onbekend endpoint."})
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            self._send_json(500, {"error": f"Onverwachte fout bij opslaan: {error}"})

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


def main(port=8765, open_browser=True):
    try:
        build_data_js(BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH, DATA_JS_PATH)
    except Exception as error:
        print(f"FOUT: kan bom.csv/package_info.csv niet inlezen: {error}")
        return 1
    try:
        build_verkoop_data_js(VERKOOP_CSV_PATH, VERKOOP_DATA_JS_PATH)
    except Exception as error:
        print(f"WAARSCHUWING: kan verkoop_orders.csv niet inlezen: {error}")
    try:
        build_mmp_data_js(MMP_PATHS, MMP_DATA_JS_PATH)
    except Exception as error:
        print(f"WAARSCHUWING: kan Maison Privée-gegevens niet inlezen: {error}")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), PicklistRequestHandler)
    except OSError as error:
        print(f"FOUT: kan niet starten op poort {port}: {error}")
        return 1

    url = f"http://127.0.0.1:{port}/"
    print(f"Picklist-app draait op {url} (sluit dit venster om te stoppen)")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    sys.exit(main(port=args.port, open_browser=not args.no_browser))
