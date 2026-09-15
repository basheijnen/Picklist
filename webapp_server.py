"""Local HTTP server for the browser picklist app: serves webapp/dist and
persists newly added packages straight into bom.csv/package_info.csv, so every
computer that opens the app (and the Excel/Python pipeline) sees the same data
instead of one browser's localStorage.
"""

import argparse
import json
import sys
import threading
import webbrowser
from dataclasses import asdict, replace
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from bom import BomEntry, load_bom_csv, write_bom_csv
from packages import PackageInfo, load_package_info_csv, write_package_info_csv
from tools.build_webapp_data import build_data_js

PROJECT_DIR = Path(__file__).resolve().parent
DIST_DIR = PROJECT_DIR / "webapp" / "dist"
BOM_CSV_PATH = PROJECT_DIR / "bom.csv"
PACKAGE_INFO_CSV_PATH = PROJECT_DIR / "package_info.csv"
DATA_JS_PATH = DIST_DIR / "data.js"

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


def add_package(payload, bom_csv_path=BOM_CSV_PATH, package_info_csv_path=PACKAGE_INFO_CSV_PATH):
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")

    pakketnummer = str(payload.get("pakketnummer", "")).strip()
    pakketnaam = str(payload.get("pakketnaam", "")).strip()
    doosnummers = str(payload.get("doosnummers", "")).strip()
    components = payload.get("components") or []
    pokon = payload.get("pokon")

    if not pakketnummer or not pakketnaam or not doosnummers or not components:
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

    packages = load_package_info_csv(package_info_csv_path)
    bom_entries = load_bom_csv(bom_csv_path)
    if any(entry.pakketnummer == pakketnummer for entry in bom_entries) or any(
            existing.pakketnummer == pakketnummer for existing in packages):
        raise ValueError(f"Pakketnummer {pakketnummer} bestaat al.")

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

    write_bom_csv(bom_entries + new_entries, bom_csv_path)

    new_package = PackageInfo(
        pakketnummer=pakketnummer,
        pakketnaam=pakketnaam,
        pokon="ja" if pokon else "nee",
        doosnummers=doosnummers,
    )
    write_package_info_csv(packages + [new_package], package_info_csv_path)

    return new_package, new_entries


class PicklistRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def do_POST(self):
        if self.path != "/api/pakketten":
            self._send_json(404, {"error": "Onbekend endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (TypeError, ValueError):
            self._send_json(400, {"error": "Ongeldige aanvraag: kan de gegevens niet lezen."})
            return
        try:
            # Holding the lock across the read-modify-write means two
            # concurrent POSTs (e.g. a double-clicked save button) can't
            # both read the same "before" state and each append their own
            # copy of the new rows.
            with _write_lock:
                package, entries = add_package(payload, BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH)
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
