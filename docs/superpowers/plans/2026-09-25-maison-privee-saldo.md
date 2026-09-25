# Ma Maison Privée saldo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vooruitbetaling van Ma Maison Privée in de picklist-webapp bijhouden (prijzen, betalingen, correcties, saldo, factuuroverzicht) en Maison Privée-orders zonder dekking automatisch in de wacht zetten bij het inladen van de picklist.

**Architecture:** Vier nieuwe CSV's (`mmp_*.csv`) met een Python-module `mmp.py` voor lezen/schrijven/valideren, opgeslagen via nieuwe `PUT /api/mmp/<sectie>`-endpoints en voor de browser gebundeld in `mmp_data.js` (`window.PICKLIST_MMP`). De saldoberekening is één pure JS-functie in `webapp/dist/mmp_saldo.js` (getest met `node --test`), gebruikt door een nieuwe volledig-scherm-dialog "Ma Maison Privée" en door `handleFile` in `app.js`, die orders zonder dekking via het bestaande in-de-wacht-mechanisme (imports met `active: false`) naar de lijst "Maison Privée – wacht op betaling" verplaatst. Geannuleerde orders worden voortaan overgeslagen en bijgehouden in `verkoop_geannuleerd.csv`.

**Tech Stack:** Python 3 (stdlib http.server, csv, openpyxl), pytest, vanilla JS in de browser, Node (`node --test`, `node:assert`) voor de JS-test.

**Spec:** `docs/superpowers/specs/2026-09-25-maison-privee-saldo-design.md`

## Global Constraints

- Alle tekst in de UI en foutmeldingen in het Nederlands.
- Kanaalnaam in de data is exact `Maison Privee` (zonder accent, zoals `normalizeKanaal` hem geeft); in de UI heet de klant "Ma Maison Privée".
- Standaardinstellingen: `startdatum` = `2026-09-26`, `pokon_toeslag` = `6.01`.
- Datums overal als `JJJJ-MM-DD`-string; vergelijken als string.
- Geldbedragen rekenen in hele centen (`Math.round(x * 100)`), pas bij weergave terug naar euro's.
- Bestandsnamen: `mmp_prijzen.csv`, `mmp_betalingen.csv`, `mmp_correcties.csv`, `mmp_instellingen.csv`, `verkoop_geannuleerd.csv`, `webapp/dist/mmp_data.js` (gitignored), `webapp/dist/mmp_saldo.js`.
- Wachtlijstnaam exact: `Maison Privée – wacht op betaling` (met en-dash).
- Order zonder prijs: status "wacht", reden `prijs ontbreekt voor pakket X`, telt niet mee in "besteld" en blokkeert latere orders niet.
- Een order die niet past zet hem én alle latere orders (met prijs) op "wacht".
- Correcties uit de Excel worden niet overgenomen.
- Volg de stijl van de omringende code (commentaar in het Nederlands/Engels zoals de buurcode, zelfde naamgeving).
- Na elke taak: `python -m pytest -q` groen; na taak 5+ ook `node --test tests/`.
- Commit + push na elke taak (gebruiker wil niet steeds gevraagd worden). Commitberichten eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Afrondingen: bedragen als `29.4 × 3` en betalingen als `88.2` moeten "precies genoeg" geven, niet een cent tekort (test in taak 5).
2. Komma als decimaalteken (`"12,50"`) bij prijs/betaling moet geaccepteerd worden door de server (test in taak 1).
3. Een geannuleerde order mag niet terugkomen via de C:/K:-samenvoeging bij Back-up (test in taak 3).
4. Na de uitrol heeft K: nog geen `mmp_*.csv`; de Back-up moet ze daar één keer neerzetten zonder ze daarna ooit te overschrijven (test in taak 2).
5. Dezelfde order die zowel als `9.1` + `<nr>-pokon` (verkoopdata) als als `9.1p` (wachtlijst) binnenkomt, telt één keer, met toeslag (test in taak 5).

---

### Task 1: `mmp.py` — opslag en validatie

**Files:**
- Create: `mmp.py`
- Test: `tests/test_mmp.py`

**Interfaces:**
- Produces:
  - `MmpPrijs(pakketnummer: str, artikel: str, ean: str, prijs: float)`
  - `MmpBetaling(id: str, datum: str, omschrijving: str, bedrag: float)`
  - `MmpCorrectie(ordernummer: str, reden: str)`
  - `STANDAARD_INSTELLINGEN = {"startdatum": "2026-09-26", "pokon_toeslag": "6.01"}`
  - `load_prijzen(path) -> list[MmpPrijs]`, `write_prijzen(list, path)`
  - `load_betalingen(path) -> list[MmpBetaling]`, `write_betalingen(list, path)`
  - `load_correcties(path) -> list[MmpCorrectie]`, `write_correcties(list, path)`
  - `load_instellingen(path) -> dict[str, str]` (standaardwaarden aangevuld), `write_instellingen(dict, path)`
  - `parse_prijzen(rows) -> list[MmpPrijs]`, `parse_betalingen(rows) -> list[MmpBetaling]`, `parse_correcties(rows) -> list[MmpCorrectie]`, `parse_instellingen(dict) -> dict[str, str]` — alle vier gooien `ValueError` met Nederlandse tekst.
  - Alle `load_*` geven een lege lijst / standaardinstellingen als het bestand niet bestaat.

- [ ] **Step 1: Write the failing tests** in `tests/test_mmp.py`:

```python
import pytest

from mmp import (
    STANDAARD_INSTELLINGEN,
    MmpBetaling,
    MmpCorrectie,
    MmpPrijs,
    load_betalingen,
    load_correcties,
    load_instellingen,
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


def test_prijzen_round_trip(tmp_path):
    path = tmp_path / "mmp_prijzen.csv"
    prijzen = [MmpPrijs("1.1", "Roses x 6", "8717032003863", 29.4)]
    write_prijzen(prijzen, path)
    assert load_prijzen(path) == prijzen


def test_betalingen_round_trip(tmp_path):
    path = tmp_path / "mmp_betalingen.csv"
    betalingen = [MmpBetaling("a1", "2026-09-26", "Vooruitbetaling okt.", 500.0)]
    write_betalingen(betalingen, path)
    assert load_betalingen(path) == betalingen


def test_correcties_round_trip(tmp_path):
    path = tmp_path / "mmp_correcties.csv"
    correcties = [MmpCorrectie("2024217357", "retour")]
    write_correcties(correcties, path)
    assert load_correcties(path) == correcties


def test_instellingen_round_trip_and_defaults(tmp_path):
    path = tmp_path / "mmp_instellingen.csv"
    assert load_instellingen(path) == STANDAARD_INSTELLINGEN
    write_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "7.5"}, path)
    assert load_instellingen(path) == {"startdatum": "2026-10-01", "pokon_toeslag": "7.5"}


def test_missing_files_load_empty(tmp_path):
    assert load_prijzen(tmp_path / "x.csv") == []
    assert load_betalingen(tmp_path / "x.csv") == []
    assert load_correcties(tmp_path / "x.csv") == []


def test_parse_prijzen_accepts_decimal_comma_and_strips():
    [prijs] = parse_prijzen([{"pakketnummer": " 1.1 ", "artikel": "Roses", "ean": "", "prijs": "29,40"}])
    assert prijs == MmpPrijs("1.1", "Roses", "", 29.4)


@pytest.mark.parametrize("rows", [
    [{"pakketnummer": "", "artikel": "x", "ean": "", "prijs": 1}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": "abc"}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": "nan"}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": -1}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": 1},
     {"pakketnummer": "1.1", "artikel": "y", "ean": "", "prijs": 2}],
    "geen lijst",
    ["geen dict"],
])
def test_parse_prijzen_rejects_invalid(rows):
    with pytest.raises(ValueError):
        parse_prijzen(rows)


def test_parse_betalingen_accepts_negative_and_assigns_missing_id():
    [betaling] = parse_betalingen([{"id": "", "datum": "2026-09-26", "omschrijving": "retour", "bedrag": "-12,50"}])
    assert betaling.bedrag == -12.5
    assert betaling.id


@pytest.mark.parametrize("row", [
    {"id": "a", "datum": "26-09-2026", "omschrijving": "x", "bedrag": 1},
    {"id": "a", "datum": "", "omschrijving": "x", "bedrag": 1},
    {"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": "veel"},
])
def test_parse_betalingen_rejects_invalid(row):
    with pytest.raises(ValueError):
        parse_betalingen([row])


def test_parse_correcties_rejects_empty_ordernummer():
    with pytest.raises(ValueError):
        parse_correcties([{"ordernummer": " ", "reden": "retour"}])


def test_parse_instellingen_validates():
    assert parse_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "6,01"}) == {
        "startdatum": "2026-10-01", "pokon_toeslag": "6.01"}
    with pytest.raises(ValueError):
        parse_instellingen({"startdatum": "1-10-2026", "pokon_toeslag": "6.01"})
    with pytest.raises(ValueError):
        parse_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "x"})
```

- [ ] **Step 2: Run** `python -m pytest tests/test_mmp.py -q` — Expected: FAIL (`ModuleNotFoundError: No module named 'mmp'`).

- [ ] **Step 3: Implement `mmp.py`:**

```python
"""Opslag van de Ma Maison Privée-vooruitbetaling: prijzen, betalingen,
correcties en instellingen, elk in een eigen CSV naast bom.csv. De
parse_*-functies valideren wat de browser stuurt voordat er iets wordt
weggeschreven.
"""

import csv
import math
import re
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

DATUM_PATROON = re.compile(r"\d{4}-\d{2}-\d{2}")
STANDAARD_INSTELLINGEN = {"startdatum": "2026-09-26", "pokon_toeslag": "6.01"}


@dataclass(frozen=True)
class MmpPrijs:
    pakketnummer: str
    artikel: str
    ean: str
    prijs: float


@dataclass(frozen=True)
class MmpBetaling:
    id: str
    datum: str
    omschrijving: str
    bedrag: float


@dataclass(frozen=True)
class MmpCorrectie:
    ordernummer: str
    reden: str


PRIJZEN_FIELDNAMES = ["pakketnummer", "artikel", "ean", "prijs"]
BETALINGEN_FIELDNAMES = ["id", "datum", "omschrijving", "bedrag"]
CORRECTIES_FIELDNAMES = ["ordernummer", "reden"]
INSTELLINGEN_FIELDNAMES = ["sleutel", "waarde"]


def _write(rows, fieldnames, path):
    with Path(path).open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read(path):
    path = Path(path)
    if not path.exists():
        return []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        return list(csv.DictReader(csv_file))


def write_prijzen(prijzen, path):
    _write([asdict(p) for p in prijzen], PRIJZEN_FIELDNAMES, path)


def load_prijzen(path):
    return [MmpPrijs(r["pakketnummer"], r["artikel"], r["ean"], float(r["prijs"])) for r in _read(path)]


def write_betalingen(betalingen, path):
    _write([asdict(b) for b in betalingen], BETALINGEN_FIELDNAMES, path)


def load_betalingen(path):
    return [MmpBetaling(r["id"], r["datum"], r["omschrijving"], float(r["bedrag"])) for r in _read(path)]


def write_correcties(correcties, path):
    _write([asdict(c) for c in correcties], CORRECTIES_FIELDNAMES, path)


def load_correcties(path):
    return [MmpCorrectie(r["ordernummer"], r["reden"]) for r in _read(path)]


def write_instellingen(instellingen, path):
    _write([{"sleutel": k, "waarde": v} for k, v in instellingen.items()], INSTELLINGEN_FIELDNAMES, path)


def load_instellingen(path):
    instellingen = dict(STANDAARD_INSTELLINGEN)
    instellingen.update({r["sleutel"]: r["waarde"] for r in _read(path)})
    return instellingen


def _getal(value, melding):
    try:
        getal = float(str(value).strip().replace(",", "."))
    except ValueError:
        raise ValueError(melding) from None
    if not math.isfinite(getal):
        raise ValueError(melding)
    return getal


def _datum(value, melding):
    datum = str(value or "").strip()
    if not DATUM_PATROON.fullmatch(datum):
        raise ValueError(melding)
    return datum


def _rijen(rows):
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise ValueError("Ongeldige aanvraag.")
    return rows


def parse_prijzen(rows):
    prijzen, gezien = [], set()
    for row in _rijen(rows):
        pakketnummer = str(row.get("pakketnummer", "")).strip()
        if not pakketnummer:
            raise ValueError("Elke prijsregel moet een pakketnummer hebben.")
        if pakketnummer in gezien:
            raise ValueError(f"Pakketnummer {pakketnummer} staat dubbel in de prijslijst.")
        gezien.add(pakketnummer)
        prijs = _getal(row.get("prijs", ""), f"Prijs van pakket {pakketnummer} is geen geldig getal.")
        if prijs < 0:
            raise ValueError(f"Prijs van pakket {pakketnummer} mag niet negatief zijn.")
        prijzen.append(MmpPrijs(pakketnummer, str(row.get("artikel", "")).strip(),
                                str(row.get("ean", "")).strip(), prijs))
    return prijzen


def parse_betalingen(rows):
    betalingen = []
    for row in _rijen(rows):
        datum = _datum(row.get("datum"), "Elke betaling moet een datum (JJJJ-MM-DD) hebben.")
        bedrag = _getal(row.get("bedrag", ""), "Elke betaling moet een geldig bedrag hebben.")
        betaling_id = str(row.get("id", "")).strip() or uuid.uuid4().hex[:12]
        betalingen.append(MmpBetaling(betaling_id, datum, str(row.get("omschrijving", "")).strip(), bedrag))
    return betalingen


def parse_correcties(rows):
    correcties = []
    for row in _rijen(rows):
        ordernummer = str(row.get("ordernummer", "")).strip()
        if not ordernummer:
            raise ValueError("Elke correctie moet een ordernummer hebben.")
        correcties.append(MmpCorrectie(ordernummer, str(row.get("reden", "")).strip()))
    return correcties


def parse_instellingen(instellingen):
    if not isinstance(instellingen, dict):
        raise ValueError("Ongeldige aanvraag.")
    startdatum = _datum(instellingen.get("startdatum"), "Startdatum moet het formaat JJJJ-MM-DD hebben.")
    toeslag = _getal(instellingen.get("pokon_toeslag", ""), "Pokon-toeslag moet een geldig bedrag zijn.")
    return {"startdatum": startdatum, "pokon_toeslag": f"{toeslag:g}"}
```

Note: `f"{6.01:g}"` → `"6.01"`, `f"{7.5:g}"` → `"7.5"`.

- [ ] **Step 4: Run** `python -m pytest tests/test_mmp.py -q` — Expected: PASS. Then `python -m pytest -q` — all green.

- [ ] **Step 5: Commit + push**

```bash
git add mmp.py tests/test_mmp.py
git commit -m "feat: opslag en validatie voor Ma Maison Privée-saldo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Server-endpoints, `mmp_data.js` en Back-up-sync

**Files:**
- Modify: `tools/build_webapp_data.py` (nieuwe `build_mmp_data_js`, aanroepen in `main`)
- Modify: `webapp_server.py` (paden, `save_mmp_sectie`, `do_PUT`-routing, `_handle_mmp_write`, `SHARED_DATA_FILES`, `_pull_shared_data`, `_push_code_to_shared_copy`, `main`)
- Modify: `webapp/dist/index.html` (scripttags)
- Modify: `.gitignore` (`webapp/dist/mmp_data.js`)
- Test: `tests/test_build_webapp_data.py`, `tests/test_webapp_server.py`

**Interfaces:**
- Consumes: alles uit `mmp.py` (taak 1).
- Produces:
  - `build_mmp_data_js(paths: dict[str, Path], output_path) -> None` — schrijft `window.PICKLIST_MMP = {"prijzen": [...], "betalingen": [...], "correcties": [...], "instellingen": {...}};`
  - `MMP_PATHS = {"prijzen": ..., "betalingen": ..., "correcties": ..., "instellingen": ...}` in `webapp_server.py`
  - `save_mmp_sectie(sectie: str, payload: dict, paths=MMP_PATHS) -> None` — body `{"rows": [...]}` voor prijzen/betalingen/correcties, `{"instellingen": {...}}` voor instellingen; vervangt de hele sectie. Onbekende sectie → `KeyError`.
  - HTTP: `PUT /api/mmp/<sectie>` → 200 met de volledige nieuwe `PICKLIST_MMP`-inhoud als JSON, 400 met `{"error": ...}` bij validatiefout, 404 bij onbekende sectie.

- [ ] **Step 1: Write the failing tests.**

In `tests/test_build_webapp_data.py` (import `build_mmp_data_js` bovenin erbij):

```python
def test_build_mmp_data_js_writes_all_sections(tmp_path):
    from mmp import MmpBetaling, MmpPrijs, write_betalingen, write_prijzen
    paths = {
        "prijzen": tmp_path / "mmp_prijzen.csv",
        "betalingen": tmp_path / "mmp_betalingen.csv",
        "correcties": tmp_path / "mmp_correcties.csv",
        "instellingen": tmp_path / "mmp_instellingen.csv",
    }
    write_prijzen([MmpPrijs("1.1", "Roses", "", 29.4)], paths["prijzen"])
    write_betalingen([MmpBetaling("a", "2026-09-26", "x", 100.0)], paths["betalingen"])
    output_path = tmp_path / "mmp_data.js"

    build_mmp_data_js(paths, output_path)

    text = output_path.read_text(encoding="utf-8")
    assert text.startswith("window.PICKLIST_MMP = ")
    data = json.loads(text[len("window.PICKLIST_MMP = "):].rstrip().rstrip(";"))
    assert data["prijzen"] == [{"pakketnummer": "1.1", "artikel": "Roses", "ean": "", "prijs": 29.4}]
    assert data["betalingen"][0]["bedrag"] == 100.0
    assert data["correcties"] == []
    assert data["instellingen"] == {"startdatum": "2026-09-26", "pokon_toeslag": "6.01"}
```

(voeg `import json` toe als dat er nog niet staat.)

In `tests/test_webapp_server.py`:

```python
from mmp import load_betalingen, load_instellingen
from webapp_server import save_mmp_sectie


def _mmp_paths(tmp_path):
    return {naam: tmp_path / f"mmp_{naam}.csv" for naam in ("prijzen", "betalingen", "correcties", "instellingen")}


def test_save_mmp_sectie_replaces_betalingen(tmp_path):
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("betalingen", {"rows": [{"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": "100"}]}, paths)
    save_mmp_sectie("betalingen", {"rows": [{"id": "b", "datum": "2026-09-27", "omschrijving": "y", "bedrag": "50"}]}, paths)
    assert [b.id for b in load_betalingen(paths["betalingen"])] == ["b"]


def test_save_mmp_sectie_instellingen(tmp_path):
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("instellingen", {"instellingen": {"startdatum": "2026-10-01", "pokon_toeslag": "6.01"}}, paths)
    assert load_instellingen(paths["instellingen"])["startdatum"] == "2026-10-01"


def test_save_mmp_sectie_invalid_writes_nothing(tmp_path):
    paths = _mmp_paths(tmp_path)
    with pytest.raises(ValueError):
        save_mmp_sectie("betalingen", {"rows": [{"datum": "fout", "bedrag": 1}]}, paths)
    assert not paths["betalingen"].exists()


def test_save_mmp_sectie_unknown_section(tmp_path):
    with pytest.raises(KeyError):
        save_mmp_sectie("onzin", {"rows": []}, _mmp_paths(tmp_path))


def test_push_code_seeds_missing_shared_data_but_never_overwrites(tmp_path, monkeypatch):
    import webapp_server
    repo = tmp_path / "repo"
    shared = tmp_path / "shared"
    repo.mkdir()
    shared.mkdir()
    (repo / "mmp_betalingen.csv").write_text("nieuw", encoding="utf-8")
    (repo / "mmp_prijzen.csv").write_text("repo-versie", encoding="utf-8")
    (shared / "mmp_prijzen.csv").write_text("k-versie", encoding="utf-8")
    monkeypatch.setattr(webapp_server, "CANONICAL_REPO_DIR", repo)
    monkeypatch.setattr(webapp_server, "SHARED_COPY_DIR", shared)

    webapp_server._push_code_to_shared_copy()

    assert (shared / "mmp_betalingen.csv").read_text(encoding="utf-8") == "nieuw"
    assert (shared / "mmp_prijzen.csv").read_text(encoding="utf-8") == "k-versie"
```

Also add an HTTP test modelled on `test_server_updates_existing_package_via_http_put` (read that test first and copy its server start/stop set-up exactly), which monkeypatches `webapp_server.MMP_PATHS` to `_mmp_paths(tmp_path)` and `webapp_server.MMP_DATA_JS_PATH` to `tmp_path / "mmp_data.js"`, then:
- `PUT /api/mmp/betalingen` with `{"rows": [{"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": 100}]}` → status 200, response JSON `["betalingen"][0]["bedrag"] == 100.0`, and `tmp_path / "mmp_data.js"` exists;
- `PUT /api/mmp/betalingen` with `{"rows": [{"datum": "x", "bedrag": 1}]}` → status 400 and `"datum" in body["error"].lower()`;
- `PUT /api/mmp/onzin` → status 404.

- [ ] **Step 2: Run** `python -m pytest tests/test_build_webapp_data.py tests/test_webapp_server.py -q` — Expected: FAIL (ImportError on `build_mmp_data_js` / `save_mmp_sectie`).

- [ ] **Step 3: Implement.**

`tools/build_webapp_data.py` — add import `from mmp import load_betalingen, load_correcties, load_instellingen, load_prijzen` and `from dataclasses import asdict`, constant `MMP_DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "mmp_data.js"` and `MMP_PATHS = {naam: PROJECT_DIR / f"mmp_{naam}.csv" for naam in ("prijzen", "betalingen", "correcties", "instellingen")}`, then:

```python
def mmp_data(paths=MMP_PATHS):
    return {
        "prijzen": [asdict(p) for p in load_prijzen(paths["prijzen"])],
        "betalingen": [asdict(b) for b in load_betalingen(paths["betalingen"])],
        "correcties": [asdict(c) for c in load_correcties(paths["correcties"])],
        "instellingen": load_instellingen(paths["instellingen"]),
    }


def build_mmp_data_js(paths=MMP_PATHS, output_path=MMP_DATA_JS_PATH):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "window.PICKLIST_MMP = "
        + json.dumps(mmp_data(paths), ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
```

and in `main()` call `build_mmp_data_js()` and print `"Maison Privée-gegevens geschreven naar {MMP_DATA_JS_PATH}"`.

`webapp_server.py`:
- imports: `from mmp import parse_betalingen, parse_correcties, parse_instellingen, parse_prijzen, write_betalingen, write_correcties, write_instellingen, write_prijzen` and `from tools.build_webapp_data import MMP_PATHS, build_mmp_data_js, mmp_data` (extend the existing import line), plus `MMP_DATA_JS_PATH = DIST_DIR / "mmp_data.js"`.
- `SHARED_DATA_FILES = ["bom.csv", "package_info.csv", "verkoop_orders.csv", "mmp_prijzen.csv", "mmp_betalingen.csv", "mmp_correcties.csv", "mmp_instellingen.csv"]` (taak 3 voegt `verkoop_geannuleerd.csv` toe).
- new function:

```python
_MMP_SECTIES = {
    "prijzen": (parse_prijzen, write_prijzen),
    "betalingen": (parse_betalingen, write_betalingen),
    "correcties": (parse_correcties, write_correcties),
}


def save_mmp_sectie(sectie, payload, paths=MMP_PATHS):
    """Vervangt één sectie (prijzen/betalingen/correcties/instellingen) van
    de Maison Privée-gegevens in zijn geheel. Valideert eerst alles, zodat
    een fout nooit een half weggeschreven bestand oplevert.
    """
    if sectie != "instellingen" and sectie not in _MMP_SECTIES:
        raise KeyError(sectie)
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    if sectie == "instellingen":
        write_instellingen(parse_instellingen(payload.get("instellingen")), paths["instellingen"])
        return
    parse, write = _MMP_SECTIES[sectie]
    write(parse(payload.get("rows")), paths[sectie])
```

- `do_PUT`: before the pakketten-prefix check:

```python
        mmp_prefix = "/api/mmp/"
        if self.path.startswith(mmp_prefix):
            self._handle_mmp_write(urllib.parse.unquote(self.path[len(mmp_prefix):]))
            return
```

- new handler (same shape as `_handle_verkoop_upload`):

```python
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
```

- `_pull_shared_data`: the existing loop already copies every non-verkoop file in `SHARED_DATA_FILES`; after `build_data_js(...)` add, in its own try/except like the verkoop build:

```python
    try:
        build_mmp_data_js(
            {naam: CANONICAL_REPO_DIR / f"mmp_{naam}.csv" for naam in MMP_PATHS},
            CANONICAL_REPO_DIR / "webapp" / "dist" / "mmp_data.js",
        )
    except Exception as error:
        print(f"WAARSCHUWING: kan Maison Privée-gegevens niet inlezen: {error}")
```

- `_push_code_to_shared_copy`: shared data files are currently skipped entirely. Change the loop so a shared data file is copied only when K: doesn't have it yet (first rollout of a new file), never overwritten:

```python
        if item.name in SHARED_DATA_FILES:
            # Nieuwe gedeelde bestanden (bijv. mmp_*.csv bij de eerste
            # uitrol) moeten één keer op K: komen, maar een bestaande K:-
            # versie wint altijd — die kan nieuwere invoer van een collega bevatten.
            if not destination.exists():
                shutil.copy2(item, destination)
            continue
```

  (compute `destination` before this check.)
- `main()`: after the verkoop build, `try: build_mmp_data_js(MMP_PATHS, MMP_DATA_JS_PATH) except Exception as error: print(f"WAARSCHUWING: kan Maison Privée-gegevens niet inlezen: {error}")`.

`webapp/dist/index.html` — scripttags worden:

```html
  <script src="data.js"></script>
  <script src="verkoop_data.js"></script>
  <script src="mmp_data.js"></script>
  <script src="mmp_saldo.js"></script>
  <script src="app.js"></script>
```

(`mmp_saldo.js` bestaat pas na taak 5; een ontbrekend script geeft alleen een 404 in de console en breekt niets.)

`.gitignore` — add `webapp/dist/mmp_data.js`.

- [ ] **Step 4: Run** `python -m pytest -q` — Expected: all PASS.

- [ ] **Step 5: Commit + push** (`feat: opslaan en syncen van Maison Privée-gegevens`).

---

### Task 3: Geannuleerde orders overslaan en onthouden

**Files:**
- Modify: `sales.py`
- Modify: `webapp_server.py` (`add_verkoop_orders`, `_merge_verkoop_orders`, `_pull_shared_data`, `SHARED_DATA_FILES`, `GEANNULEERD_CSV_PATH`, `_handle_verkoop_upload`)
- Modify: `tools/build_webapp_data.py` (`build_verkoop_data_js` filtert geannuleerde)
- Test: `tests/test_sales.py`, `tests/test_webapp_server.py`

**Interfaces:**
- Produces:
  - `sales.load_geannuleerd(path) -> set[str]`, `sales.write_geannuleerd(set, path)` (CSV met kolom `ordernummer`, gesorteerd weggeschreven; ontbrekend bestand → lege set)
  - `sales.verwijder_geannuleerd(orders, geannuleerd: set) -> list[VerkoopOrder]` — verwijdert orders met ordernummer in de set én `<nr>-pokon` van zo'n order.
  - `add_verkoop_orders(payload, verkoop_csv_path=VERKOOP_CSV_PATH, geannuleerd_csv_path=GEANNULEERD_CSV_PATH)` accepteert optioneel `payload["geannuleerd"]: list[str]`; `rows` mag leeg zijn als `geannuleerd` niet leeg is. Geeft nu `(all_orders, toegevoegd, overgeslagen, verwijderd)` terug.
  - `build_verkoop_data_js(verkoop_csv_path, output_path, geannuleerd_csv_path=None)` — filtert als het pad gegeven is.
  - HTTP-response van `/api/verkoop` krijgt extra veld `"verwijderd"`.

- [ ] **Step 1: Write the failing tests.**

`tests/test_sales.py`:

```python
from sales import VerkoopOrder, load_geannuleerd, verwijder_geannuleerd, write_geannuleerd


def test_geannuleerd_round_trip_and_missing(tmp_path):
    path = tmp_path / "verkoop_geannuleerd.csv"
    assert load_geannuleerd(path) == set()
    write_geannuleerd({"2", "1"}, path)
    assert load_geannuleerd(path) == {"1", "2"}


def test_verwijder_geannuleerd_also_drops_pokon_row():
    orders = [
        VerkoopOrder("1", "2026-09-26", "Maison Privee", "9.1", 1.0),
        VerkoopOrder("1-pokon", "2026-09-26", "Maison Privee", "Pokon", 1.0),
        VerkoopOrder("2", "2026-09-26", "Maison Privee", "9.2", 1.0),
    ]
    assert verwijder_geannuleerd(orders, {"1"}) == [orders[2]]
```

`tests/test_webapp_server.py` — update the two existing `add_verkoop_orders` tests to unpack four values (`all_orders, toegevoegd, overgeslagen, _verwijderd = ...`) and pass `tmp_path / "verkoop_geannuleerd.csv"` as third arg. Add:

```python
def test_add_verkoop_orders_removes_and_remembers_cancelled(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    geannuleerd_path = tmp_path / "verkoop_geannuleerd.csv"
    write_verkoop_csv([
        VerkoopOrder("1", "2026-09-26", "Maison Privee", "9.1", 1.0),
        VerkoopOrder("1-pokon", "2026-09-26", "Maison Privee", "Pokon", 1.0),
    ], verkoop_csv_path)

    all_orders, toegevoegd, _, verwijderd = add_verkoop_orders(
        {"datum": "2026-09-27", "rows": [], "geannuleerd": ["1"]}, verkoop_csv_path, geannuleerd_path)

    assert all_orders == [] and toegevoegd == 0 and verwijderd == 2
    assert load_geannuleerd(geannuleerd_path) == {"1"}
    # later nog eens aangeboden (oude export) → blijft weg
    all_orders, toegevoegd, _, _ = add_verkoop_orders(
        {"datum": "2026-09-28", "rows": [{"ordernummer": "1", "kanaal": "Maison Privee", "pakketnummer": "9.1"}]},
        verkoop_csv_path, geannuleerd_path)
    assert all_orders == [] and toegevoegd == 0


def test_merge_verkoop_orders_does_not_resurrect_cancelled(tmp_path, monkeypatch):
    import webapp_server
    repo, shared = tmp_path / "repo", tmp_path / "shared"
    repo.mkdir(); shared.mkdir()
    order = VerkoopOrder("1", "2026-09-26", "Maison Privee", "9.1", 1.0)
    write_verkoop_csv([], repo / "verkoop_orders.csv")
    write_geannuleerd({"1"}, repo / "verkoop_geannuleerd.csv")
    write_verkoop_csv([order], shared / "verkoop_orders.csv")
    monkeypatch.setattr(webapp_server, "CANONICAL_REPO_DIR", repo)
    monkeypatch.setattr(webapp_server, "SHARED_COPY_DIR", shared)

    webapp_server._merge_verkoop_orders()

    assert load_verkoop_csv(repo / "verkoop_orders.csv") == []
    assert load_verkoop_csv(shared / "verkoop_orders.csv") == []
    assert load_geannuleerd(shared / "verkoop_geannuleerd.csv") == {"1"}
```

(import `load_geannuleerd, write_geannuleerd` from `sales` at the top.) Keep the existing parametrized "rejects invalid payloads" test — `{"datum": "2026-09-17", "rows": []}` must still raise.

- [ ] **Step 2: Run** `python -m pytest tests/test_sales.py tests/test_webapp_server.py -q` — Expected: FAIL (ImportError).

- [ ] **Step 3: Implement.**

`sales.py`:

```python
def write_geannuleerd(ordernummers, path):
    with Path(path).open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["ordernummer"])
        writer.writerows([nr] for nr in sorted(ordernummers))


def load_geannuleerd(path):
    path = Path(path)
    if not path.exists():
        return set()
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        return {row["ordernummer"] for row in csv.DictReader(csv_file) if row["ordernummer"]}


def verwijder_geannuleerd(orders, geannuleerd):
    """Laat orders weg die geannuleerd zijn, inclusief de losse
    `<nr>-pokon`-regel die parseVerkoopExport voor een Pokon-variant maakt.
    """
    return [
        order for order in orders
        if order.ordernummer not in geannuleerd
        and order.ordernummer.removesuffix("-pokon") not in geannuleerd
    ]
```

`webapp_server.py`:
- `GEANNULEERD_CSV_PATH = PROJECT_DIR / "verkoop_geannuleerd.csv"`; add `"verkoop_geannuleerd.csv"` to `SHARED_DATA_FILES`; in `_pull_shared_data`'s loop skip it too (`if filename in ("verkoop_orders.csv", "verkoop_geannuleerd.csv"): continue`) and update its docstring.
- `add_verkoop_orders`:

```python
def add_verkoop_orders(payload, verkoop_csv_path=VERKOOP_CSV_PATH, geannuleerd_csv_path=GEANNULEERD_CSV_PATH):
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    datum = str(payload.get("datum", "")).strip()
    rows = payload.get("rows") or []
    nieuw_geannuleerd = {str(nr).strip() for nr in (payload.get("geannuleerd") or []) if str(nr).strip()}
    if not datum or not (rows or nieuw_geannuleerd):
        raise ValueError("Kies een datum en upload minstens één orderregel.")
    # ... bestaande datum-check en opbouw van new_orders ongewijzigd ...

    geannuleerd = load_geannuleerd(geannuleerd_csv_path) | nieuw_geannuleerd
    existing = load_verkoop_csv(verkoop_csv_path)
    behouden = verwijder_geannuleerd(existing, geannuleerd)
    verwijderd = len(existing) - len(behouden)
    all_orders, toegevoegd, overgeslagen = merge_new_orders(behouden, verwijder_geannuleerd(new_orders, geannuleerd))
    write_verkoop_csv(all_orders, verkoop_csv_path)
    if nieuw_geannuleerd:
        write_geannuleerd(geannuleerd, geannuleerd_csv_path)
    return all_orders, toegevoegd, overgeslagen, verwijderd
```

- `_handle_verkoop_upload`: unpack the 4-tuple, pass `GEANNULEERD_CSV_PATH`, add `"verwijderd": verwijderd` to the JSON, and call `build_verkoop_data_js(VERKOOP_CSV_PATH, VERKOOP_DATA_JS_PATH, GEANNULEERD_CSV_PATH)`.
- `_merge_verkoop_orders`:

```python
    c_geannuleerd_path = CANONICAL_REPO_DIR / "verkoop_geannuleerd.csv"
    k_geannuleerd_path = SHARED_COPY_DIR / "verkoop_geannuleerd.csv"
    geannuleerd = load_geannuleerd(c_geannuleerd_path) | load_geannuleerd(k_geannuleerd_path)
    merged, _, _ = merge_new_orders(c_orders, k_orders)
    merged = verwijder_geannuleerd(merged, geannuleerd)
    write_verkoop_csv(merged, c_path)
    write_verkoop_csv(merged, k_path)
    write_geannuleerd(geannuleerd, c_geannuleerd_path)
    write_geannuleerd(geannuleerd, k_geannuleerd_path)
```

  and update the docstring to mention cancellations are unioned too.
- `main()`: pass `GEANNULEERD_CSV_PATH` to `build_verkoop_data_js`.

`tools/build_webapp_data.py` — `build_verkoop_data_js(verkoop_csv_path=..., output_path=..., geannuleerd_csv_path=None)`: load orders, and if `geannuleerd_csv_path` is given, `orders = verwijder_geannuleerd(orders, load_geannuleerd(geannuleerd_csv_path))` before serialising. Default in `main()`: `PROJECT_DIR / "verkoop_geannuleerd.csv"`.

- [ ] **Step 4: Run** `python -m pytest -q` — Expected: all PASS.

- [ ] **Step 5: Commit + push** (`feat: geannuleerde orders uit verkoopdata houden`).

---

### Task 4: Migratiescript prijslijst

**Files:**
- Create: `tools/migrate_mmp_prijzen.py`
- Create (data, via het script): `mmp_prijzen.csv`
- Test: `tests/test_migrate_mmp_prijzen.py`

**Interfaces:**
- Consumes: `MmpPrijs`, `write_prijzen` (taak 1).
- Produces: `lees_prijzen_uit_excel(xlsx_path) -> list[MmpPrijs]`; CLI `python tools/migrate_mmp_prijzen.py [xlsx_path]` schrijft `mmp_prijzen.csv` in de projectmap.

- [ ] **Step 1: Write the failing test** `tests/test_migrate_mmp_prijzen.py`:

```python
import openpyxl

from mmp import MmpPrijs
from tools.migrate_mmp_prijzen import lees_prijzen_uit_excel


def test_lees_prijzen_uit_excel(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Prijzen"
    ws.append(["Pakketnummer", "Artikel", "EAN", "Verkoopprijs", "Aantal in periode"])
    ws.append(["1.1", "Roses x 6", 8717032003863, 29.4, "=1+1"])
    ws.append([1.2, "Roses Polyantha ", None, 24.71, None])
    ws.append([None, None, None, None, None])
    path = tmp_path / "tool.xlsx"
    wb.save(path)

    assert lees_prijzen_uit_excel(path) == [
        MmpPrijs("1.1", "Roses x 6", "8717032003863", 29.4),
        MmpPrijs("1.2", "Roses Polyantha", "", 24.71),
    ]
```

- [ ] **Step 2: Run** `python -m pytest tests/test_migrate_mmp_prijzen.py -q` — Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement** `tools/migrate_mmp_prijzen.py`:

```python
"""Eenmalig: neemt tabblad Prijzen uit de Excel-factuurtool van Ma Maison
Privée over in mmp_prijzen.csv. Betalingen (leeg) en correcties (vallen al
vóór de startdatum) worden bewust niet overgenomen.
"""

import sys
from pathlib import Path

import openpyxl

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from mmp import MmpPrijs, write_prijzen

EXCEL_PATH = Path(r"K:\E-Commerce\Klanten\Ma Maison Privée\2026-2027\Facturen\Factuurtool Ma Maison Privée.xlsx")
PRIJZEN_CSV_PATH = PROJECT_DIR / "mmp_prijzen.csv"


def _tekst(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def lees_prijzen_uit_excel(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    prijzen = []
    for pakketnummer, artikel, ean, prijs, *_ in wb["Prijzen"].iter_rows(min_row=2, values_only=True):
        if pakketnummer is None or prijs is None:
            continue
        # Een pakketnummer als 1.2 kan als getal in Excel staan; str() geeft dan "1.2".
        nummer = str(pakketnummer).strip() if not isinstance(pakketnummer, str) else pakketnummer.strip()
        prijzen.append(MmpPrijs(nummer, _tekst(artikel), _tekst(ean), float(prijs)))
    return prijzen


def main(xlsx_path=EXCEL_PATH):
    prijzen = lees_prijzen_uit_excel(xlsx_path)
    write_prijzen(prijzen, PRIJZEN_CSV_PATH)
    print(f"{len(prijzen)} prijzen geschreven naar {PRIJZEN_CSV_PATH}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else EXCEL_PATH)
```

Watch out: a pakketnummer like `1.10` stored as number in Excel would become `"1.1"`. After running for real (step 5), check with: `python -c "from mmp import load_prijzen; ps=load_prijzen('mmp_prijzen.csv'); print(len(ps), len({p.pakketnummer for p in ps}))"` — both must be 308. If not, the Excel has numeric pakketnummers that collide; then read those cells' `number_format`/raw text and fix before continuing.

- [ ] **Step 4: Run** `python -m pytest tests/test_migrate_mmp_prijzen.py -q` — Expected: PASS.

- [ ] **Step 5: Run the migration for real:** `python tools/migrate_mmp_prijzen.py` — Expected: `308 prijzen geschreven naar ...`. Run the uniqueness check above. Also check every Maison Privée pakketnummer in `verkoop_orders.csv` has a price: `python -c "import csv; from mmp import load_prijzen; p={x.pakketnummer for x in load_prijzen('mmp_prijzen.csv')}; print(sorted({r['pakketnummer'] for r in csv.DictReader(open('verkoop_orders.csv',encoding='utf-8')) if r['kanaal']=='Maison Privee'} - p - {'Pokon'}))"` — Expected: `[]`.

- [ ] **Step 6: Commit + push** `tools/migrate_mmp_prijzen.py`, `tests/test_migrate_mmp_prijzen.py`, `mmp_prijzen.csv` (`feat: prijslijst Ma Maison Privée overgenomen uit Excel`).

---

### Task 5: `mmp_saldo.js` — de saldoberekening

**Files:**
- Create: `webapp/dist/mmp_saldo.js`
- Test: `tests/mmp_saldo.test.js`

**Interfaces:**
- Produces (in de browser als globals op `window`, in Node via `module.exports`):
  - `MMP_KANAAL = "Maison Privee"`
  - `mmpParseDatum(tekst: string, fallback: string) -> string` — `"2026-09-25 14:03"` → `"2026-09-25"`, `"25-09-2026"` of `"25/9/2026"` → `"2026-09-25"`, anders `fallback`.
  - `mmpVerzamelOrders(bronnen: Array<Array<{ordernummer, datum, kanaal, pakketnummer, aantal?}>>) -> Array<{ordernummer, datum, pakketnummer, aantal}>` — alleen kanaal `Maison Privee`, eerste voorkomen van een ordernummer wint.
  - `berekenMaisonPriveeSaldo({ orders, prijzen, betalingen, correcties, instellingen }) -> { ontvangen, besteld, saldo, tekort, wachtend, ontbrekendePrijzen: string[], orders: Array<{ordernummer, datum, pakketnummer, pokon: boolean, aantal, bedrag: number|null, status: "ok"|"wacht", reden: string}> }` — alle bedragen in euro's (getal met max. 2 decimalen).
  - `mmpFactuurOverzicht(saldo, van, tot, pokonToeslag) -> { regels: Array<{pakketnummer, aantal, prijs, totaal}>, totaal, aantal, zonderPrijs }`

- [ ] **Step 1: Write the failing test** `tests/mmp_saldo.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mmpParseDatum, mmpVerzamelOrders, berekenMaisonPriveeSaldo, mmpFactuurOverzicht,
} = require("../webapp/dist/mmp_saldo.js");

const instellingen = { startdatum: "2026-09-26", pokon_toeslag: "6.01" };
const prijzen = [
  { pakketnummer: "1.1", prijs: 29.4 },
  { pakketnummer: "9.1", prijs: 10 },
];
const order = (ordernummer, datum, pakketnummer, aantal = 1) => ({ ordernummer, datum, pakketnummer, aantal });
const bereken = (orders, betaald, extra = {}) => berekenMaisonPriveeSaldo({
  orders, prijzen, betalingen: betaald.map((bedrag, i) => ({ id: String(i), datum: "2026-09-26", bedrag })),
  correcties: [], instellingen, ...extra,
});

test("precies genoeg saldo is OK (geen afrondingsfout)", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-26", "1.1"), order("3", "2026-09-26", "1.1")], [88.2]);
  assert.deepEqual(r.orders.map((o) => o.status), ["ok", "ok", "ok"]);
  assert.equal(r.saldo, 0);
  assert.equal(r.besteld, 88.2);
});

test("een cent te weinig laat de laatste order wachten", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-27", "1.1")], [58.79]);
  assert.deepEqual(r.orders.map((o) => o.status), ["ok", "wacht"]);
  assert.equal(r.orders[1].reden, "te weinig saldo");
  assert.equal(r.wachtend, 1);
  assert.equal(r.tekort, 0.01);
});

test("kleine order na een order die niet past wacht ook", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-27", "9.1")], [20]);
  assert.deepEqual(r.orders.map((o) => o.status), ["wacht", "wacht"]);
});

test("sorteert op datum en dan op ordernummer", () => {
  const r = bereken([order("20", "2026-09-27", "9.1"), order("3", "2026-09-27", "9.1"), order("9", "2026-09-26", "9.1")], [20]);
  assert.deepEqual(r.orders.map((o) => [o.ordernummer, o.status]), [["9", "ok"], ["3", "ok"], ["20", "wacht"]]);
});

test("ontbrekende prijs wacht, telt niet mee en blokkeert niet", () => {
  const r = bereken([order("1", "2026-09-26", "77.7"), order("2", "2026-09-27", "9.1")], [10]);
  assert.deepEqual(r.orders.map((o) => o.status), ["wacht", "ok"]);
  assert.equal(r.orders[0].reden, "prijs ontbreekt voor pakket 77.7");
  assert.equal(r.orders[0].bedrag, null);
  assert.deepEqual(r.ontbrekendePrijzen, ["77.7"]);
  assert.equal(r.besteld, 10);
  assert.equal(r.wachtend, 1);
});

test("correctie en order voor startdatum tellen niet mee", () => {
  const r = bereken([order("1", "2026-09-25", "9.1"), order("2", "2026-09-26", "9.1"), order("3", "2026-09-26", "9.1")], [10],
    { correcties: [{ ordernummer: "2", reden: "retour" }] });
  assert.deepEqual(r.orders.map((o) => o.ordernummer), ["3"]);
  assert.equal(r.saldo, 0);
});

test("pokon-variant krijgt toeslag, in beide notaties, en telt één keer", () => {
  const orders = mmpVerzamelOrders([
    [{ ordernummer: "5", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1", aantal: 1 },
     { ordernummer: "5-pokon", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "Pokon", aantal: 1 }],
    [{ ordernummer: "5", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1p" },
     { ordernummer: "6", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1p" }],
  ]);
  const r = bereken(orders, [100]);
  assert.deepEqual(r.orders.map((o) => [o.ordernummer, o.pakketnummer, o.pokon, o.bedrag]),
    [["5", "9.1", true, 16.01], ["6", "9.1", true, 16.01]]);
  assert.equal(r.besteld, 32.02);
});

test("mmpVerzamelOrders: alleen Maison Privee, eerste bron wint", () => {
  const orders = mmpVerzamelOrders([
    [{ ordernummer: "1", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1", aantal: 1 }],
    [{ ordernummer: "1", datum: "2026-09-30", kanaal: "Maison Privee", pakketnummer: "9.1" },
     { ordernummer: "2", datum: "2026-09-30", kanaal: "Bol.com", pakketnummer: "9.1" }],
  ]);
  assert.deepEqual(orders, [{ ordernummer: "1", datum: "2026-09-26", pakketnummer: "9.1", aantal: 1 }]);
});

test("negatieve betaling verlaagt ontvangen", () => {
  const r = bereken([order("1", "2026-09-26", "9.1")], [20, -15]);
  assert.equal(r.ontvangen, 5);
  assert.equal(r.orders[0].status, "wacht");
});

test("mmpParseDatum", () => {
  assert.equal(mmpParseDatum("2026-09-25 14:03:00", "x"), "2026-09-25");
  assert.equal(mmpParseDatum("25-09-2026 14:03", "x"), "2026-09-25");
  assert.equal(mmpParseDatum("5/9/2026", "x"), "2026-09-05");
  assert.equal(mmpParseDatum("", "2026-01-01"), "2026-01-01");
  assert.equal(mmpParseDatum("onzin", "2026-01-01"), "2026-01-01");
});

test("factuuroverzicht per pakket binnen periode, met pokon-toeslag als eigen regel", () => {
  const orders = mmpVerzamelOrders([[
    { ordernummer: "1", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1" },
    { ordernummer: "2", datum: "2026-09-27", kanaal: "Maison Privee", pakketnummer: "9.1p" },
    { ordernummer: "3", datum: "2026-10-05", kanaal: "Maison Privee", pakketnummer: "1.1" },
    { ordernummer: "4", datum: "2026-09-27", kanaal: "Maison Privee", pakketnummer: "77.7" },
  ]]);
  const f = mmpFactuurOverzicht(bereken(orders, []), "2026-09-26", "2026-09-30", 6.01);
  assert.deepEqual(f.regels, [
    { pakketnummer: "9.1", aantal: 2, prijs: 10, totaal: 20 },
    { pakketnummer: "Pokon-toeslag", aantal: 1, prijs: 6.01, totaal: 6.01 },
  ]);
  assert.equal(f.totaal, 26.01);
  assert.equal(f.aantal, 2);
  assert.equal(f.zonderPrijs, 1);
});
```

- [ ] **Step 2: Run** `node --test tests/` — Expected: FAIL (`Cannot find module '../webapp/dist/mmp_saldo.js'`).

- [ ] **Step 3: Implement** `webapp/dist/mmp_saldo.js`:

```js
// Saldoberekening voor de vooruitbetaling van Ma Maison Privée. Pure
// functies zonder DOM, zodat ze met `node --test` te testen zijn; in de
// browser komen ze als globals op window (dit script laadt vóór app.js).
(function (root) {
  const MMP_KANAAL = "Maison Privee";

  function naarCenten(bedrag) { return Math.round(Number(bedrag) * 100); }
  function naarEuro(centen) { return centen / 100; }

  function mmpParseDatum(tekst, fallback) {
    const waarde = String(tekst || "").trim();
    let m = waarde.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = waarde.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return fallback;
  }

  // Voegt orders uit meerdere bronnen (verkoopdata, ingeladen lijsten,
  // wachtlijst) samen op ordernummer; de eerste bron wint.
  function mmpVerzamelOrders(bronnen) {
    const gezien = new Map();
    bronnen.forEach((bron) => (bron || []).forEach((order) => {
      if (order.kanaal !== MMP_KANAAL || gezien.has(order.ordernummer)) return;
      gezien.set(order.ordernummer, {
        ordernummer: order.ordernummer, datum: order.datum,
        pakketnummer: order.pakketnummer, aantal: Number(order.aantal) || 1,
      });
    }));
    return [...gezien.values()];
  }

  // Zet de twee notaties van een Pokon-variant om naar één order per
  // ordernummer: "9.1p" en ("9.1" + een "<nr>-pokon"-regel) → {pakketnummer: "9.1", pokon: true}.
  function normaliseerOrders(orders) {
    const perNummer = new Map();
    const pokonNummers = new Set();
    orders.forEach((order) => {
      if (order.pakketnummer === "Pokon" && order.ordernummer.endsWith("-pokon")) {
        pokonNummers.add(order.ordernummer.slice(0, -"-pokon".length));
        return;
      }
      const variant = String(order.pakketnummer).match(/^(.+?)[pP]$/);
      perNummer.set(order.ordernummer, {
        ordernummer: order.ordernummer, datum: order.datum,
        pakketnummer: variant ? variant[1] : order.pakketnummer,
        pokon: Boolean(variant), aantal: Number(order.aantal) || 1,
      });
    });
    pokonNummers.forEach((nr) => { if (perNummer.has(nr)) perNummer.get(nr).pokon = true; });
    return [...perNummer.values()];
  }

  function berekenMaisonPriveeSaldo({ orders, prijzen, betalingen, correcties, instellingen }) {
    const startdatum = instellingen.startdatum;
    const toeslagCenten = naarCenten(instellingen.pokon_toeslag || 0);
    const prijsCenten = new Map(prijzen.map((p) => [p.pakketnummer, naarCenten(p.prijs)]));
    const uitgesloten = new Set(correcties.map((c) => c.ordernummer));
    const ontvangenCenten = betalingen.reduce((som, b) => som + naarCenten(b.bedrag), 0);

    const meetellend = normaliseerOrders(orders)
      .filter((o) => o.datum >= startdatum && !uitgesloten.has(o.ordernummer))
      .sort((a, b) => a.datum.localeCompare(b.datum)
        || a.ordernummer.localeCompare(b.ordernummer, "nl", { numeric: true }));

    let besteldCenten = 0;
    let okCenten = 0;
    let geblokkeerd = false;
    const ontbrekend = new Set();
    const resultaat = meetellend.map((o) => {
      if (!prijsCenten.has(o.pakketnummer)) {
        ontbrekend.add(o.pakketnummer);
        return { ...o, bedrag: null, status: "wacht", reden: `prijs ontbreekt voor pakket ${o.pakketnummer}` };
      }
      const bedragCenten = (prijsCenten.get(o.pakketnummer) + (o.pokon ? toeslagCenten : 0)) * o.aantal;
      besteldCenten += bedragCenten;
      if (!geblokkeerd && okCenten + bedragCenten <= ontvangenCenten) {
        okCenten += bedragCenten;
        return { ...o, bedrag: naarEuro(bedragCenten), status: "ok", reden: "" };
      }
      geblokkeerd = true;
      return { ...o, bedrag: naarEuro(bedragCenten), status: "wacht", reden: "te weinig saldo" };
    });

    return {
      ontvangen: naarEuro(ontvangenCenten),
      besteld: naarEuro(besteldCenten),
      saldo: naarEuro(ontvangenCenten - besteldCenten),
      tekort: naarEuro(Math.max(0, besteldCenten - ontvangenCenten)),
      wachtend: resultaat.filter((o) => o.status === "wacht").length,
      ontbrekendePrijzen: [...ontbrekend].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })),
      orders: resultaat,
    };
  }

  function mmpFactuurOverzicht(saldo, van, tot, pokonToeslag) {
    const inPeriode = saldo.orders.filter((o) => o.datum >= van && o.datum <= tot);
    const perPakket = new Map();
    let pokonAantal = 0;
    let zonderPrijs = 0;
    inPeriode.forEach((o) => {
      if (o.bedrag === null) { zonderPrijs += 1; return; }
      const prijsCenten = Math.round(o.bedrag * 100 / o.aantal) - (o.pokon ? naarCenten(pokonToeslag) : 0);
      const regel = perPakket.get(o.pakketnummer) || { pakketnummer: o.pakketnummer, aantal: 0, prijsCenten };
      regel.aantal += o.aantal;
      perPakket.set(o.pakketnummer, regel);
      if (o.pokon) pokonAantal += o.aantal;
    });
    const regels = [...perPakket.values()]
      .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true }))
      .map((r) => ({ pakketnummer: r.pakketnummer, aantal: r.aantal, prijs: naarEuro(r.prijsCenten), totaal: naarEuro(r.prijsCenten * r.aantal) }));
    if (pokonAantal) {
      regels.push({ pakketnummer: "Pokon-toeslag", aantal: pokonAantal, prijs: Number(pokonToeslag), totaal: naarEuro(naarCenten(pokonToeslag) * pokonAantal) });
    }
    const totaalCenten = regels.reduce((som, r) => som + naarCenten(r.totaal), 0);
    const aantal = [...perPakket.values()].reduce((som, r) => som + r.aantal, 0);
    return { regels, totaal: naarEuro(totaalCenten), aantal, zonderPrijs };
  }

  const api = { MMP_KANAAL, mmpParseDatum, mmpVerzamelOrders, berekenMaisonPriveeSaldo, mmpFactuurOverzicht };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
```

- [ ] **Step 4: Run** `node --test tests/` — Expected: all PASS. Also `python -m pytest -q` still green.

- [ ] **Step 5: Commit + push** (`feat: saldoberekening Ma Maison Privée`).

---

### Task 6: CSV-inlezen — status, orderdatum en geannuleerde orders

**Files:**
- Modify: `webapp/dist/app.js` (`parseVerkoopExport` ~r.1798, `readOrders` ~r.2389, `readOrderNames` ~r.2406, `handleFile` ~r.3224, `saveImportState`/`loadImportState` ~r.189-230, `verstuurNaarVerkoop` ~r.1915)

**Interfaces:**
- Consumes: `mmpParseDatum` (taak 5), `todayIso()` (bestaand).
- Produces:
  - `isGeannuleerdeRij(header: string[], row: string[]) -> boolean`
  - `leesGeannuleerdeOrdernummers(text) -> string[]`
  - `parseVerkoopExport(text)` geeft orders nu met extra veld `datum` (uit `Order date`, anders vandaag) en slaat geannuleerde rijen over.
  - Import-object krijgt velden `verkoopGeannuleerd: string[]` en `mmpOrders: Array<{ordernummer, datum, kanaal, pakketnummer, aantal}>` (beide opgeslagen in localStorage).

- [ ] **Step 1: Add helpers** vlak boven `parseVerkoopExport`:

```js
// Rijen met Status "Cancelled" zijn geannuleerd en tellen nergens mee (niet
// op de picklijst, niet in Verkopen, niet in het Maison Privée-saldo).
// Oudere exports zonder Status-kolom tellen gewoon allemaal mee.
function isGeannuleerdeRij(header, row) {
  const statusIndex = header.indexOf("Status");
  return statusIndex >= 0 && (row[statusIndex] || "").trim().toLowerCase() === "cancelled";
}

function leesGeannuleerdeOrdernummers(text) {
  const rows = parseDelimited(text);
  if (!rows.length) return [];
  const header = rows[0].map((value) => value.trim());
  const ordernummerIndex = header.indexOf("Ordernr. intern");
  if (ordernummerIndex < 0) return [];
  return rows.slice(1)
    .filter((row) => isGeannuleerdeRij(header, row))
    .map((row) => (row[ordernummerIndex] || "").trim())
    .filter(Boolean);
}
```

- [ ] **Step 2: Change `parseVerkoopExport`:** add `datum: header.indexOf("Order date")` to `kolomIndex`; at the top of the row loop `if (isGeannuleerdeRij(header, row)) return;`; compute `const datum = mmpParseDatum(kolomIndex.datum >= 0 ? row[kolomIndex.datum] : "", todayIso());` and include `datum` in both pushed objects (`{ ordernummer, kanaal, pakketnummer: basis, datum }` and the `-pokon` one).

- [ ] **Step 3: Change `readOrders` and `readOrderNames`:** both skip cancelled rows. In `readOrders` the header isn't trimmed yet — add `const header = rows[0].map((value) => value.trim());` and in the loop `if (isGeannuleerdeRij(header, row)) return;`. In `readOrderNames` add the same check at the top of the loop.

- [ ] **Step 4: Change `handleFile`:** after the `verkoopOrders` try-line add `const verkoopGeannuleerd = leesGeannuleerdeOrdernummers(text);` and put `verkoopGeannuleerd` in the pushed import object. In `saveImportState` add `verkoopGeannuleerd: imp.verkoopGeannuleerd || [], mmpOrders: imp.mmpOrders || [],`; in `loadImportState` add `verkoopGeannuleerd: Array.isArray(imp.verkoopGeannuleerd) ? imp.verkoopGeannuleerd : [], mmpOrders: Array.isArray(imp.mmpOrders) ? imp.mmpOrders : [],`.

- [ ] **Step 5: Change `verstuurNaarVerkoop`:** the guard becomes `if (!imp.verkoopOrders || (!imp.verkoopOrders.length && !(imp.verkoopGeannuleerd || []).length)) return;` and the body `JSON.stringify({ datum, rows: imp.verkoopOrders, geannuleerd: imp.verkoopGeannuleerd || [] })`. Extend the message: `if (result.verwijderd) text += \` ${result.verwijderd} geannuleerde orderregel(s) verwijderd.\`;` (before the onbekend-check).

- [ ] **Step 6: Verify handmatig.** Create in the scratchpad a CSV `test_export.csv` (`;`-separated, UTF-8) with header `Ordernr. intern;Order date;Name;Package Number;Client;Shop;Status` and rows:
  - `9001;2026-09-26 10:00;Jan;9.1;Maison Privee;;Shipped`
  - `9002;2026-09-26 11:00;Piet;9.1;Maison Privee;;Cancelled`
  - `9003;25-09-2026;Kees;1.1;Bol.com;;`

  (Check first with `grep -n "function normalizeKanaal" -A16 webapp/dist/app.js` which Client value produces `Maison Privee`, and adjust the rows.) Start `python webapp_server.py`, load the CSV, and check: the picklist counts 2 orders (not 3), and in the DevTools console `imports.at(-1).verkoopOrders` shows 9001 with `datum: "2026-09-26"` and no 9002, and `imports.at(-1).verkoopGeannuleerd` is `["9002"]`. `node --test tests/` and `python -m pytest -q` still green.

- [ ] **Step 7: Commit + push** (`feat: geannuleerde orders overslaan en orderdatum inlezen`).

---

### Task 7: Pagina "Ma Maison Privée"

**Files:**
- Modify: `webapp/dist/index.html` (headerknop + `<dialog id="mmpDialog">`)
- Modify: `webapp/dist/app.js` (nieuw blok MMP-functies + event listeners)
- Modify: `webapp/dist/styles.css`

**Interfaces:**
- Consumes: `berekenMaisonPriveeSaldo`, `mmpVerzamelOrders`, `mmpFactuurOverzicht`, `MMP_KANAAL` (taak 5); `window.PICKLIST_MMP`, `PUT /api/mmp/<sectie>` (taak 2); `imports` met `verkoopOrders`/`mmpOrders` (taak 6); bestaande `escapeHtml`, `confirmDialog`, `todayIso`, `displayNumber`, `setMessage`.
- Produces (gebruikt door taak 8):
  - `MMP_WACHT_NAAM = "Maison Privée – wacht op betaling"`
  - `mmpAlleOrders() -> orders` (verkoopdata + alle `imp.verkoopOrders` + alle `imp.mmpOrders`)
  - `mmpBereken() -> saldo-resultaat`
  - `formatEuro(bedrag) -> string` (bijv. `"€ 1.234,50"`)
  - `mmpSaldoMelding(saldo) -> string` (lege string als er niets wacht)

- [ ] **Step 1: HTML.** In the header, after `#openVerkoopButton`:

```html
      <button id="openMmpButton" class="button button-secondary" type="button">
        Maison Privée
      </button>
```

After the closing `</dialog>` of `#verkoopDialog`:

```html
  <dialog id="mmpDialog" class="package-dialog verkoop-dialog mmp-dialog">
    <div class="dialog-header">
      <div>
        <span class="eyebrow">Vooruitbetaling</span>
        <h2>Ma Maison Privée</h2>
      </div>
      <button id="closeMmpDialog" class="button button-terug" type="button">← Terug naar picklisten</button>
    </div>
    <div class="verkoop-dialog-body">
      <p id="mmpMessage" class="message" role="status" aria-live="polite"></p>
      <div id="mmpTiles" class="verkoop-tiles"></div>
      <div id="mmpWaarschuwingen"></div>

      <section class="mmp-sectie">
        <h3>Wacht op betaling</h3>
        <div id="mmpWachtend"></div>
      </section>

      <section class="mmp-sectie">
        <h3>Betalingen</h3>
        <form id="mmpBetalingForm" class="mmp-form">
          <label>Datum <input name="datum" type="date" required></label>
          <label>Omschrijving <input name="omschrijving" type="text" placeholder="Vooruitbetaling okt."></label>
          <label>Bedrag (€) <input name="bedrag" type="text" inputmode="decimal" required placeholder="500,00"></label>
          <button class="button" type="submit">Toevoegen</button>
        </form>
        <table class="verkoop-table"><thead><tr><th>Datum</th><th>Omschrijving</th><th class="verkoop-col-aantal">Bedrag</th><th></th></tr></thead>
          <tbody id="mmpBetalingenBody"></tbody></table>
      </section>

      <section class="mmp-sectie">
        <h3>Factuuroverzicht</h3>
        <div class="verkoop-datum-bereik">
          <label>Van <input id="mmpFactuurVan" type="date"></label>
          <label>Tot <input id="mmpFactuurTot" type="date"></label>
          <button id="mmpFactuurPrint" class="button button-quiet" type="button">Afdrukken</button>
        </div>
        <div id="mmpFactuur"></div>
      </section>

      <section class="mmp-sectie">
        <h3>Prijzen</h3>
        <form id="mmpPrijsForm" class="mmp-form">
          <label>Pakketnummer <input name="pakketnummer" type="text" required></label>
          <label>Artikel <input name="artikel" type="text"></label>
          <label>EAN <input name="ean" type="text"></label>
          <label>Prijs (€) <input name="prijs" type="text" inputmode="decimal" required></label>
          <button class="button" type="submit">Opslaan</button>
        </form>
        <input id="mmpPrijsZoek" type="search" placeholder="Zoek pakketnummer of artikel…">
        <table class="verkoop-table"><thead><tr><th>Pakketnummer</th><th>Artikel</th><th>EAN</th><th class="verkoop-col-aantal">Prijs</th><th></th></tr></thead>
          <tbody id="mmpPrijzenBody"></tbody></table>
      </section>

      <section class="mmp-sectie">
        <h3>Correcties</h3>
        <p class="mmp-uitleg">Orders die niet mogen meetellen voor saldo en factuur (bijv. een retour).</p>
        <form id="mmpCorrectieForm" class="mmp-form">
          <label>Ordernr. intern <input name="ordernummer" type="text" required></label>
          <label>Reden <input name="reden" type="text"></label>
          <button class="button" type="submit">Toevoegen</button>
        </form>
        <table class="verkoop-table"><thead><tr><th>Ordernummer</th><th>Reden</th><th></th></tr></thead>
          <tbody id="mmpCorrectiesBody"></tbody></table>
      </section>

      <section class="mmp-sectie">
        <h3>Instellingen</h3>
        <form id="mmpInstellingenForm" class="mmp-form">
          <label>Orders tellen mee vanaf <input name="startdatum" type="date" required></label>
          <label>Pokon-toeslag (€) <input name="pokon_toeslag" type="text" inputmode="decimal" required></label>
          <button class="button" type="submit">Opslaan</button>
        </form>
      </section>
    </div>
  </dialog>
```

- [ ] **Step 2: CSS** (append to `styles.css`):

```css
.mmp-dialog .verkoop-dialog-body { overflow-y: auto; max-height: calc(100vh - 110px); }
.mmp-sectie { border: 1px solid var(--line); border-radius: 12px; background: white; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.mmp-sectie h3 { margin: 0; font-size: 1rem; }
.mmp-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.mmp-form label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; }
.mmp-uitleg { margin: 0; font-size: .85rem; opacity: .75; }
.mmp-waarschuwing { padding: 10px 14px; border-radius: 10px; background: #fdf1dc; border: 1px solid #e6b85c; margin-bottom: 6px; }
.mmp-negatief { color: #b3261e; }
.mmp-tekst-knop { border: 0; background: none; color: #b3261e; cursor: pointer; font-size: 1rem; }
.mmp-rij-geen-prijs td { background: #fdf1dc; }
```

- [ ] **Step 3: JS — gedeelde functies.** Add a new block in `app.js` right after `verkoopPakketnaam` (~r.1959):

```js
// ---- Ma Maison Privée: vooruitbetaling ----
const MMP_WACHT_NAAM = "Maison Privée – wacht op betaling";
const mmpDialog = document.querySelector("#mmpDialog");
let mmpPrijsZoekterm = "";

function mmpData() {
  const data = window.PICKLIST_MMP || {};
  return {
    prijzen: data.prijzen || [], betalingen: data.betalingen || [], correcties: data.correcties || [],
    instellingen: data.instellingen || { startdatum: "2026-09-26", pokon_toeslag: "6.01" },
  };
}

function mmpAlleOrders() {
  const bronnen = [window.PICKLIST_VERKOOP || []];
  imports.forEach((imp) => { bronnen.push(imp.verkoopOrders || []); bronnen.push(imp.mmpOrders || []); });
  return mmpVerzamelOrders(bronnen);
}

function mmpBereken() {
  return berekenMaisonPriveeSaldo({ orders: mmpAlleOrders(), ...mmpData() });
}

function formatEuro(bedrag) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);
}

function mmpSaldoMelding(saldo) {
  const delen = [];
  const teWeinig = saldo.orders.filter((o) => o.reden === "te weinig saldo").length;
  if (teWeinig) delen.push(`${teWeinig} order(s) wachten op betaling, tekort ${formatEuro(saldo.tekort)}`);
  if (saldo.ontbrekendePrijzen.length) delen.push(`prijs ontbreekt voor pakket ${saldo.ontbrekendePrijzen.join(", ")}`);
  return delen.length ? `Maison Privée: ${delen.join("; ")}.` : "";
}

async function mmpOpslaan(sectie, body) {
  const response = await fetch(`/api/mmp/${sectie}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Opslaan mislukt.");
  window.PICKLIST_MMP = result;
}

async function mmpBewaar(sectie, body) {
  const melding = document.querySelector("#mmpMessage");
  melding.textContent = "";
  try {
    await mmpOpslaan(sectie, body);
    renderMmpDialog();
    return true;
  } catch (error) {
    melding.textContent = `Kan niet opslaan: ${error.message}`;
    return false;
  }
}
```

- [ ] **Step 4: JS — renderen.**

```js
function renderMmpDialog() {
  const data = mmpData();
  const saldo = mmpBereken();
  const tegels = [
    ["Ontvangen", formatEuro(saldo.ontvangen)],
    ["Besteld", formatEuro(saldo.besteld)],
    ["Saldo nu", formatEuro(saldo.saldo)],
    ["Wacht op betaling", `${saldo.wachtend} order(s)`],
    ["Tekort", formatEuro(saldo.tekort)],
  ];
  document.querySelector("#mmpTiles").innerHTML = tegels.map(([label, waarde]) =>
    `<div class="verkoop-tile"><span class="verkoop-tile-label">${label}</span><span class="verkoop-tile-value${label === "Saldo nu" && saldo.saldo < 0 ? " mmp-negatief" : ""}">${waarde}</span></div>`).join("");

  document.querySelector("#mmpWaarschuwingen").innerHTML = saldo.ontbrekendePrijzen.length
    ? `<div class="mmp-waarschuwing">Prijs ontbreekt voor pakket ${saldo.ontbrekendePrijzen.map(escapeHtml).join(", ")} — die orders wachten tot je een prijs invult (zie Prijzen).</div>`
    : "";

  const wachtend = saldo.orders.filter((o) => o.status === "wacht");
  document.querySelector("#mmpWachtend").innerHTML = wachtend.length
    ? `<table class="verkoop-table"><thead><tr><th>Datum</th><th>Ordernummer</th><th>Pakket</th><th class="verkoop-col-aantal">Bedrag</th><th>Reden</th></tr></thead><tbody>${
      wachtend.map((o) => `<tr><td>${escapeHtml(o.datum)}</td><td>${escapeHtml(o.ordernummer)}</td><td>${escapeHtml(o.pakketnummer)}${o.pokon ? " + Pokon" : ""}</td><td class="verkoop-col-aantal">${o.bedrag === null ? "—" : formatEuro(o.bedrag)}</td><td>${escapeHtml(o.reden)}</td></tr>`).join("")
    }</tbody></table>`
    : "<p class=\"mmp-uitleg\">Er wacht niets — alle orders zijn gedekt.</p>";

  document.querySelector("#mmpBetalingenBody").innerHTML = [...data.betalingen]
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .map((b) => `<tr><td>${escapeHtml(b.datum)}</td><td>${escapeHtml(b.omschrijving)}</td><td class="verkoop-col-aantal">${formatEuro(b.bedrag)}</td><td><button type="button" class="mmp-tekst-knop" data-betaling-id="${escapeHtml(b.id)}" aria-label="Betaling verwijderen">×</button></td></tr>`)
    .join("") || `<tr><td colspan="4">Nog geen betalingen.</td></tr>`;

  const zoek = mmpPrijsZoekterm.trim().toLowerCase();
  const ontbrekend = saldo.ontbrekendePrijzen.map((p) => ({ pakketnummer: p, artikel: "", ean: "", prijs: null }));
  const prijsRijen = [...ontbrekend, ...[...data.prijzen]
    .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true }))]
    .filter((p) => !zoek || p.pakketnummer.toLowerCase().includes(zoek) || p.artikel.toLowerCase().includes(zoek));
  document.querySelector("#mmpPrijzenBody").innerHTML = prijsRijen.map((p) => p.prijs === null
    ? `<tr class="mmp-rij-geen-prijs"><td>${escapeHtml(p.pakketnummer)}</td><td colspan="2">besteld, maar nog geen prijs</td><td class="verkoop-col-aantal">—</td><td></td></tr>`
    : `<tr><td>${escapeHtml(p.pakketnummer)}</td><td>${escapeHtml(p.artikel)}</td><td>${escapeHtml(p.ean)}</td><td class="verkoop-col-aantal">${formatEuro(p.prijs)}</td><td><button type="button" class="mmp-tekst-knop" data-prijs-pakket="${escapeHtml(p.pakketnummer)}" aria-label="Prijs verwijderen">×</button></td></tr>`).join("");

  document.querySelector("#mmpCorrectiesBody").innerHTML = data.correcties
    .map((c) => `<tr><td>${escapeHtml(c.ordernummer)}</td><td>${escapeHtml(c.reden)}</td><td><button type="button" class="mmp-tekst-knop" data-correctie="${escapeHtml(c.ordernummer)}" aria-label="Correctie verwijderen">×</button></td></tr>`)
    .join("") || `<tr><td colspan="3">Geen correcties.</td></tr>`;

  const instellingenForm = document.querySelector("#mmpInstellingenForm");
  instellingenForm.startdatum.value = data.instellingen.startdatum;
  instellingenForm.pokon_toeslag.value = String(data.instellingen.pokon_toeslag).replace(".", ",");

  renderMmpFactuur(saldo);
}

function renderMmpFactuur(saldo = mmpBereken()) {
  const van = document.querySelector("#mmpFactuurVan").value;
  const tot = document.querySelector("#mmpFactuurTot").value;
  const el = document.querySelector("#mmpFactuur");
  if (!van || !tot) { el.innerHTML = ""; return; }
  const pakketnaam = new Map(mmpData().prijzen.map((p) => [p.pakketnummer, p.artikel]));
  const factuur = mmpFactuurOverzicht(saldo, van, tot, Number(mmpData().instellingen.pokon_toeslag));
  el.innerHTML = `<table class="verkoop-table"><thead><tr><th>Pakketnummer</th><th>Artikel</th><th class="verkoop-col-aantal">Aantal</th><th class="verkoop-col-aantal">Prijs</th><th class="verkoop-col-aantal">Totaal</th></tr></thead><tbody>${
    factuur.regels.map((r) => `<tr><td>${escapeHtml(r.pakketnummer)}</td><td>${escapeHtml(pakketnaam.get(r.pakketnummer) || "")}</td><td class="verkoop-col-aantal">${displayNumber(r.aantal)}</td><td class="verkoop-col-aantal">${formatEuro(r.prijs)}</td><td class="verkoop-col-aantal">${formatEuro(r.totaal)}</td></tr>`).join("")
  }</tbody><tfoot><tr><td colspan="2">Totaal (${displayNumber(factuur.aantal)} pakketten)</td><td></td><td></td><td class="verkoop-col-aantal">${formatEuro(factuur.totaal)}</td></tr></tfoot></table>${
    factuur.zonderPrijs ? `<div class="mmp-waarschuwing">${factuur.zonderPrijs} order(s) in deze periode hebben nog geen prijs en staan niet in dit overzicht.</div>` : ""}`;
}
```

- [ ] **Step 5: JS — events.** Next to the other top-level listeners (after the `#closeVerkoopDialog` listener, ~r.3328):

```js
document.querySelector("#openMmpButton").addEventListener("click", () => {
  const vandaag = todayIso();
  document.querySelector("#mmpBetalingForm").datum.value = vandaag;
  document.querySelector("#mmpFactuurVan").value = mmpData().instellingen.startdatum;
  document.querySelector("#mmpFactuurTot").value = vandaag;
  document.querySelector("#mmpMessage").textContent = "";
  renderMmpDialog();
  mmpDialog.showModal();
});
document.querySelector("#closeMmpDialog").addEventListener("click", () => mmpDialog.close());
document.querySelector("#mmpFactuurVan").addEventListener("change", () => renderMmpFactuur());
document.querySelector("#mmpFactuurTot").addEventListener("change", () => renderMmpFactuur());
document.querySelector("#mmpPrijsZoek").addEventListener("input", (event) => { mmpPrijsZoekterm = event.target.value; renderMmpDialog(); });

document.querySelector("#mmpBetalingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const nieuw = { id: makeImportId(), datum: form.datum.value, omschrijving: form.omschrijving.value, bedrag: form.bedrag.value };
  if (await mmpBewaar("betalingen", { rows: [...mmpData().betalingen, nieuw] })) {
    form.omschrijving.value = ""; form.bedrag.value = "";
  }
});
document.querySelector("#mmpPrijsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const pakketnummer = form.pakketnummer.value.trim();
  const nieuw = { pakketnummer, artikel: form.artikel.value, ean: form.ean.value, prijs: form.prijs.value };
  const rows = [...mmpData().prijzen.filter((p) => p.pakketnummer !== pakketnummer), nieuw];
  if (await mmpBewaar("prijzen", { rows })) form.reset();
});
document.querySelector("#mmpCorrectieForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const nieuw = { ordernummer: form.ordernummer.value, reden: form.reden.value };
  if (await mmpBewaar("correcties", { rows: [...mmpData().correcties, nieuw] })) form.reset();
});
document.querySelector("#mmpInstellingenForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  await mmpBewaar("instellingen", { instellingen: { startdatum: form.startdatum.value, pokon_toeslag: form.pokon_toeslag.value } });
});
mmpDialog.addEventListener("click", async (event) => {
  const knop = event.target.closest("button");
  if (!knop) return;
  const data = mmpData();
  if (knop.dataset.betalingId && await confirmDialog("Deze betaling verwijderen?")) {
    await mmpBewaar("betalingen", { rows: data.betalingen.filter((b) => b.id !== knop.dataset.betalingId) });
  } else if (knop.dataset.prijsPakket && await confirmDialog(`Prijs van pakket ${knop.dataset.prijsPakket} verwijderen?`)) {
    await mmpBewaar("prijzen", { rows: data.prijzen.filter((p) => p.pakketnummer !== knop.dataset.prijsPakket) });
  } else if (knop.dataset.correctie && await confirmDialog("Deze correctie verwijderen?")) {
    await mmpBewaar("correcties", { rows: data.correcties.filter((c) => c.ordernummer !== knop.dataset.correctie) });
  }
});
// Klik op een prijsregel vult het formulier, zodat je hem kunt aanpassen.
document.querySelector("#mmpPrijzenBody").addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  const rij = event.target.closest("tr");
  if (!rij) return;
  const pakketnummer = rij.cells[0].textContent;
  const prijs = mmpData().prijzen.find((p) => p.pakketnummer === pakketnummer);
  const form = document.querySelector("#mmpPrijsForm");
  form.pakketnummer.value = pakketnummer;
  form.artikel.value = prijs ? prijs.artikel : "";
  form.ean.value = prijs ? prijs.ean : "";
  form.prijs.value = prijs ? String(prijs.prijs).replace(".", ",") : "";
  form.prijs.focus();
});
```

Before implementing the print button, read `printKlantOverzicht` (~r.596) to see how this app prints a single panel, and implement `#mmpFactuurPrint` the same way: fill a hidden panel (add `<div id="mmpFactuurPrintPanel" hidden></div>` next to `#klantOverzichtPanel`) with a heading `Factuuroverzicht Ma Maison Privée`, the period (`van` t/m `tot`) and the `#mmpFactuur` table HTML, then print using the exact mechanism `printKlantOverzicht` uses (including its print-CSS class and `afterprint` clean-up).

- [ ] **Step 6: Verify handmatig.** `python tools/build_webapp_data.py`, start `python webapp_server.py`, open "Maison Privée":
  - prijslijst toont 308 regels; zoeken op `1.1` werkt;
  - betaling `100,50` toevoegen → tegel Ontvangen `€ 100,50`, `mmp_betalingen.csv` bevat hem; verwijderen (met bevestiging) werkt;
  - betaling met bedrag `abc` → foutmelding in `#mmpMessage`, niets opgeslagen;
  - prijs aanpassen via klik op regel + Opslaan werkt; correctie toevoegen/verwijderen werkt; instellingen opslaan werkt;
  - factuuroverzicht toont regels voor de verkoopdata sinds 26-09 en afdrukken geeft één pagina met alleen het overzicht.
  - Zet daarna `mmp_betalingen.csv`, `mmp_correcties.csv` en `mmp_instellingen.csv` terug (`git checkout -- <bestand>` of verwijderen als ze nieuw waren) zodat er geen testdata gecommit wordt.
  - `node --test tests/` en `python -m pytest -q` groen.

- [ ] **Step 7: Commit + push** (`feat: pagina Ma Maison Privée met saldo, betalingen, prijzen en factuuroverzicht`).

---

### Task 8: Picklist — automatisch in de wacht en vrijgeven

**Files:**
- Modify: `webapp/dist/app.js` (`handleFile`, `renderImportsList` checkbox-listener, nieuwe functies in het MMP-blok)

**Interfaces:**
- Consumes: `MMP_WACHT_NAAM`, `mmpBereken`, `mmpSaldoMelding` (taak 7); `MMP_KANAAL` (taak 5); bestaande `createHeldImport`, `makeImportId`, `uniqueImportName`, `formatShortDate`, `saveImportState`, `renderAll`, `setMessage`.
- Produces:
  - `houdMmpOrdersVast(imp) -> saldo | null` — verplaatst Maison Privée-orders van `imp` met status "wacht" naar de wachtlijst.
  - `geefMmpOrdersVrij(lijst) -> { vrij: number, saldo }` — verplaatst gedekte orders van de wachtlijst naar een nieuwe actieve lijst.

- [ ] **Step 1: Add to the MMP block in `app.js`:**

```js
function mmpRuwPakketnummer(order) {
  return order.pokon ? `${order.pakketnummer}p` : order.pakketnummer;
}

// Verplaatst 1 stuk van een pakketnummer (plus 1 bijbehorende klantnaam-
// regel van Maison Privée) van de ene lijst naar de andere.
function verplaatsMmpOrder(van, naar, pakketnummer) {
  const huidig = van.orderCounts.get(pakketnummer) || 0;
  if (!huidig) return false;
  if (huidig === 1) van.orderCounts.delete(pakketnummer);
  else van.orderCounts.set(pakketnummer, huidig - 1);
  naar.orderCounts.set(pakketnummer, (naar.orderCounts.get(pakketnummer) || 0) + 1);
  const index = (van.orderNames || []).findIndex((n) => n.pakketnummer === pakketnummer && n.kanaal === MMP_KANAAL);
  if (index >= 0) {
    if (!naar.orderNames) naar.orderNames = [];
    naar.orderNames.push(...van.orderNames.splice(index, 1));
  }
  return true;
}

function houdMmpOrdersVast(imp) {
  const nummers = new Set((imp.verkoopOrders || []).filter((o) => o.kanaal === MMP_KANAAL).map((o) => o.ordernummer));
  if (!nummers.size) return null;
  const saldo = mmpBereken();
  const wachtend = saldo.orders.filter((o) => o.status === "wacht" && nummers.has(o.ordernummer));
  if (!wachtend.length) return saldo;
  const lijst = imports.find((i) => i.name === MMP_WACHT_NAAM) || createHeldImport(MMP_WACHT_NAAM);
  if (!lijst.mmpOrders) lijst.mmpOrders = [];
  wachtend.forEach((o) => {
    const pakketnummer = mmpRuwPakketnummer(o);
    if (verplaatsMmpOrder(imp, lijst, pakketnummer)) {
      lijst.mmpOrders.push({ ordernummer: o.ordernummer, datum: o.datum, kanaal: MMP_KANAAL, pakketnummer, aantal: o.aantal });
    }
  });
  return saldo;
}

function geefMmpOrdersVrij(lijst) {
  const saldo = mmpBereken();
  const gedekt = new Set(saldo.orders.filter((o) => o.status === "ok").map((o) => o.ordernummer));
  const vrij = (lijst.mmpOrders || []).filter((o) => gedekt.has(o.ordernummer));
  if (!vrij.length) return { vrij: 0, saldo };
  const doel = {
    id: makeImportId(),
    name: uniqueImportName(`Maison Privée vrijgegeven ${formatShortDate(new Date())}`),
    active: true, orderCounts: new Map(), orderNames: [], wachtDatums: new Map(),
    // Bewaard zodat het saldo deze orders blijft kennen, ook als de
    // oorspronkelijke lijst later verwijderd wordt.
    mmpOrders: vrij,
  };
  imports.push(doel);
  vrij.forEach((o) => verplaatsMmpOrder(lijst, doel, o.pakketnummer));
  lijst.mmpOrders = lijst.mmpOrders.filter((o) => !gedekt.has(o.ordernummer));
  if (!lijst.orderCounts.size) imports = imports.filter((i) => i !== lijst);
  return { vrij: vrij.length, saldo };
}
```

Check before writing: `imports` is declared with `let` (r.119), so the reassignment in the last line is allowed; `uniqueImportName` and `formatShortDate` exist (~r.2479-2491).

- [ ] **Step 2: Hook into `handleFile`.** Replace the lines after `imports.push({...})`:

```js
    const nieuweLijst = { id: makeImportId(), name, active: true, orderCounts, orderNames, verkoopOrders, verkoopVerstuurd: false, verkoopGeannuleerd };
    imports.push(nieuweLijst);
    const saldo = houdMmpOrdersVast(nieuweLijst);
    saveImportState();
    renderAll();
    const melding = saldo ? mmpSaldoMelding(saldo) : "";
    if (melding) setMessage(`${melding} Zie de lijst "${MMP_WACHT_NAAM}".`);
```

(Keep `verkoopGeannuleerd` from task 6 in the object.)

- [ ] **Step 3: Hook into the "Meetellen"-checkbox** in `renderImportsList` (~r.3053). Replace the listener body with:

```js
    row.querySelector(".import-active-checkbox").addEventListener("change", (event) => {
      closeCountDiffMenu();
      // De Maison Privée-wachtlijst gaat nooit in zijn geheel aan: aanvinken
      // controleert het saldo opnieuw en haalt alleen de nu gedekte orders
      // eruit, naar een nieuwe actieve lijst.
      if (imp.name === MMP_WACHT_NAAM && event.target.checked) {
        const { vrij, saldo } = geefMmpOrdersVrij(imp);
        const rest = mmpSaldoMelding(saldo);
        setMessage(vrij
          ? `Maison Privée: ${vrij} order(s) vrijgegeven.${rest ? ` ${rest}` : ""}`
          : `Maison Privée: nog steeds te weinig saldo, er is niets vrijgegeven.${rest ? ` ${rest}` : ""}`);
        saveImportState();
        renderAll();
        return;
      }
      imp.active = event.target.checked;
      saveImportState();
      renderAll();
    });
```

Also, after a payment is saved on the Maison Privée page, remind the user: in `mmpBewaar`, after `renderMmpDialog()`, when `sectie === "betalingen"` and `imports.some((i) => i.name === MMP_WACHT_NAAM)`, set `#mmpMessage` to `Opgeslagen. Vink de lijst "${MMP_WACHT_NAAM}" aan om orders die nu gedekt zijn vrij te geven.`

- [ ] **Step 4: Verify handmatig (end-to-end).** Use the scratchpad CSV from task 6, extended with Maison Privée rows for `1.1` (29,40) dated 2026-09-26: ordernummers `9101`, `9102`, `9103`. With no payments:
  1. Load the CSV → message "Maison Privée: 3 order(s) wachten op betaling, tekort € 88,20 …"; the list `Maison Privée – wacht op betaling` appears unchecked with 3 orders; the picklist doesn't count them; "Dubbele klanten" still works.
  2. Add a payment of `58,80` on the Maison Privée page → reminder message appears.
  3. Tick the wachtlijst → "2 order(s) vrijgegeven", a new active list "Maison Privée vrijgegeven …" with 2 orders, the wachtlijst keeps 1 order and stays unticked.
  4. Reload the page → state is kept (localStorage), the saldo page shows 1 order waiting.
  5. Delete the payment and restore the mmp CSVs as in task 7 so no test data gets committed; remove the test lists in the app.
  - `node --test tests/` and `python -m pytest -q` green.

- [ ] **Step 5: Commit + push** (`feat: Maison Privée-orders zonder saldo automatisch in de wacht`).

---

### Task 9: Afronden

**Files:**
- Modify: `README.md` (korte sectie "Ma Maison Privée — vooruitbetaling")

- [ ] **Step 1:** Add to `README.md` a section explaining: de knop **Maison Privée**; betalingen invullen; orders zonder saldo gaan automatisch naar "Maison Privée – wacht op betaling"; na een betaling die lijst aanvinken om vrij te geven; prijzen en correcties op dezelfde pagina; factuuroverzicht per periode; gegevens in `mmp_*.csv`, meegenomen door Back-up; tests voor de saldoberekening met `node --test tests/`.
- [ ] **Step 2:** Run `python -m pytest -q` and `node --test tests/` — both green.
- [ ] **Step 3: Commit + push** (`docs: uitleg Ma Maison Privée in README`).
- [ ] **Step 4:** Tell the user: druk één keer op **Back-up**, zodat de `mmp_*.csv`-bestanden en de nieuwe code op K: komen.
