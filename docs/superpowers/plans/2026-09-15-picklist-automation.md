# Picklist Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual copy/paste of daily order counts into the picklist
workbook, and the fragile hardcoded-cell formulas that compute the picklists, with a
small Python tool: extract a maintainable BOM (pakket → item mapping) once, then each
day automatically read `Bron.xlsm`, calculate the picklists, and write a clean
`.xlsx` output.

**Architecture:** A one-time extraction script (`extract_bom.py`) parses the existing
formulas in `E-Commerce PICKLIST - IN PROGRESS.xlsm` into `bom.csv` — a flat table of
`pakketnummer, gebied, item, soort, aantal_per_pakket`. A daily script
(`generate_picklist.py`) finds today's `Bron.xlsm` on the K: drive, reads ordered
quantities per pakketnummer, multiplies them against `bom.csv`, and writes a new
`Picklist.xlsx` in `C:\picklist`. Every module is a small, independently testable
Python file with pure functions; only `generate_picklist.py` touches the filesystem
paths that vary (today's date, the network drive).

**Tech Stack:** Python 3.14 (already installed), `openpyxl` 3.1.5 (already installed)
for reading/writing `.xlsx`/`.xlsm`, `pytest` (to be installed) for tests. No web
framework, no database — this is a local script run by double-clicking a `.bat` file.

**Spec:** `docs/superpowers/specs/2026-09-15-picklist-automation-design.md`

## Global Constraints

- The existing `E-Commerce PICKLIST - IN PROGRESS.xlsm` is read-only source material
  for the one-time BOM extraction — never written to by any script.
- Output is a plain `.xlsx` (no VBA/macros) — printing/PDF is explicitly out of scope
  for this plan (see spec, "Buiten scope (fase 2)").
- Trigger is manual only (double-click), never a scheduled task.
- All user-facing text (sheet headers, console messages, error messages) is in Dutch,
  matching the existing workbook.
- Unknown pakketnummers (present in `Bron.xlsm` with a nonzero count, absent from
  `bom.csv`) must be surfaced clearly, never silently dropped (spec, "Foutafhandeling").
- Output file: `C:\picklist\Picklist.xlsx`, overwritten every run.
- Order source: `K:\E-Commerce\Orderverwerking\2_Orders\{jaar}\{DD-MM-JJJJ}\Bron.xlsm`.

---

## Task 1: Project setup and BOM data model

**Files:**
- Create: `C:\picklist\requirements.txt`
- Create: `C:\picklist\requirements-dev.txt`
- Create: `C:\picklist\bom.py`
- Test: `C:\picklist\tests\test_bom.py`

**Interfaces:**
- Produces: `BomEntry` dataclass (`pakketnummer: str`, `gebied: str`, `item: str`,
  `soort: str`, `aantal_per_pakket: float`); `write_bom_csv(entries, path)`;
  `load_bom_csv(path) -> list[BomEntry]`. Every later task that touches the BOM table
  imports these from `bom.py`.

- [ ] **Step 1: Create requirements files**

`C:\picklist\requirements.txt`:
```
openpyxl==3.1.5
```

`C:\picklist\requirements-dev.txt`:
```
-r requirements.txt
pytest==8.3.3
```

- [ ] **Step 2: Install dev dependencies**

Run: `python -m pip install -r requirements-dev.txt`
Expected: pytest installs successfully (openpyxl is already present and will be
reported as satisfied).

- [ ] **Step 3: Write the failing test for the BOM round trip**

`C:\picklist\tests\test_bom.py`:
```python
from pathlib import Path

from bom import BomEntry, load_bom_csv, write_bom_csv


def test_write_then_load_round_trip(tmp_path):
    entries = [
        BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0),
        BomEntry("1.32", "KOELING", "Parade", "CL Pink", 3.0),
        BomEntry("2.1", "DOZEN", "9", "", 1.0),
    ]
    csv_path = tmp_path / "bom.csv"

    write_bom_csv(entries, csv_path)
    loaded = load_bom_csv(csv_path)

    assert loaded == entries
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python -m pytest tests/test_bom.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bom'` (file doesn't exist
yet).

- [ ] **Step 5: Implement `bom.py`**

`C:\picklist\bom.py`:
```python
import csv
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class BomEntry:
    pakketnummer: str
    gebied: str
    item: str
    soort: str
    aantal_per_pakket: float


FIELDNAMES = ["pakketnummer", "gebied", "item", "soort", "aantal_per_pakket"]


def write_bom_csv(entries, path):
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for entry in entries:
            writer.writerow(asdict(entry))


def load_bom_csv(path):
    path = Path(path)
    entries = []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            entries.append(
                BomEntry(
                    pakketnummer=row["pakketnummer"],
                    gebied=row["gebied"],
                    item=row["item"],
                    soort=row["soort"],
                    aantal_per_pakket=float(row["aantal_per_pakket"]),
                )
            )
    return entries
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python -m pytest tests/test_bom.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add requirements.txt requirements-dev.txt bom.py tests/test_bom.py
git commit -m "feat: add BOM data model with CSV round trip"
```

---

## Task 2: BOM extraction from the existing workbook formulas

**Files:**
- Create: `C:\picklist\extract_bom.py`
- Test: `C:\picklist\tests\test_extract_bom.py`

**Interfaces:**
- Consumes: `BomEntry`, `write_bom_csv` from `bom.py` (Task 1).
- Produces: `parse_formula(formula: str) -> list[tuple[int, float]]`;
  `build_row_to_pakket(invoer_ws, first_row=5) -> dict[int, str]`;
  `extract_area_bom(workbook, sheet_name, gebied, row_to_pakket, first_row=6) -> list[BomEntry]`;
  `extract_dozen_bom(invoer_ws, first_row=5) -> list[BomEntry]`;
  `extract_bom(xlsm_path) -> list[BomEntry]`. Task 9 (real extraction run) calls
  `extract_bom` and `write_bom_csv` together.

This parsing logic was validated against the real workbook and a historical filled
copy before writing this plan: all 307 item-row formulas across the KOELING/KAS/
KAMER/POKON sheets parsed with zero leftovers, and recalculating with the extracted
terms against a historical `Bron`-fed backup (`E-Commerce PICKLIST-BACKUP.xlsm`)
matched the workbook's own cached formula results on 267/267 rows.

- [ ] **Step 1: Write the failing tests for `parse_formula`**

`C:\picklist\tests\test_extract_bom.py`:
```python
import pytest

from extract_bom import parse_formula


def test_parse_formula_multiple_parenthesised_groups():
    formula = (
        "=('1. Invoer pakketaantal'!G27+'1. Invoer pakketaantal'!G28)*1"
        "+('1. Invoer pakketaantal'!G33+'1. Invoer pakketaantal'!G34)*3"
    )

    terms = parse_formula(formula)

    assert terms == [(27, 1.0), (28, 1.0), (33, 3.0), (34, 3.0)]


def test_parse_formula_standalone_terms_across_lines():
    formula = (
        "='1. Invoer pakketaantal'!G58*1\n"
        "+'1. Invoer pakketaantal'!G60*1"
    )

    terms = parse_formula(formula)

    assert terms == [(58, 1.0), (60, 1.0)]


def test_parse_formula_rejects_unsupported_shapes():
    with pytest.raises(ValueError):
        parse_formula("=SUM('1. Invoer pakketaantal'!G1:G5)")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'extract_bom'`

- [ ] **Step 3: Implement `parse_formula`, `build_row_to_pakket`, `extract_area_bom`**

`C:\picklist\extract_bom.py` (first part):
```python
import re
import sys

import openpyxl

from bom import BomEntry, write_bom_csv

INVOER_SHEET = "1. Invoer pakketaantal"
AREA_SHEETS = {
    "2. KOELING PICKLIST": "KOELING",
    "3. KAS PICKLIST": "KAS",
    "4. KAMER PICKLIST": "KAMER",
    "5. POKON PICKLIST": "POKON",
}

_GROUP_RE = re.compile(r"\(([^()]*)\)\*(-?\d+(?:\.\d+)?)")
_STANDALONE_RE = re.compile(r"'1\. Invoer pakketaantal'!G(\d+)\*(-?\d+(?:\.\d+)?)")
_CELLREF_RE = re.compile(r"'1\. Invoer pakketaantal'!G(\d+)")


def parse_formula(formula):
    """Parse a picklist formula that sums (cellref[+cellref...])*multiplier
    terms referencing '1. Invoer pakketaantal'!G<row>, into a list of
    (row, multiplier) pairs. Raises ValueError for any formula shape this
    doesn't recognise, so an unexpected future formula fails loudly instead
    of silently producing a wrong BOM.
    """
    terms = []
    for group_text, multiplier in _GROUP_RE.findall(formula):
        for row_str in _CELLREF_RE.findall(group_text):
            terms.append((int(row_str), float(multiplier)))
    remainder = _GROUP_RE.sub("", formula)

    for row_str, multiplier in _STANDALONE_RE.findall(remainder):
        terms.append((int(row_str), float(multiplier)))
    remainder = _STANDALONE_RE.sub("", remainder)

    if _CELLREF_RE.search(remainder):
        raise ValueError(f"Kan formule niet ontleden: {formula!r}")
    clean_remainder = (
        remainder.strip().lstrip("=").replace("+", "").replace("\n", "").strip()
    )
    if clean_remainder:
        raise ValueError(f"Kan formule niet ontleden: {formula!r}")

    return terms


def build_row_to_pakket(invoer_ws, first_row=5):
    row_to_pakket = {}
    for row in range(first_row, invoer_ws.max_row + 1):
        value = invoer_ws[f"B{row}"].value
        if value is not None:
            row_to_pakket[row] = str(value)
    return row_to_pakket


def extract_area_bom(workbook, sheet_name, gebied, row_to_pakket, first_row=6):
    ws = workbook[sheet_name]
    entries = []
    for row in range(first_row, ws.max_row + 1):
        item = ws[f"A{row}"].value
        soort = ws[f"B{row}"].value
        formula = ws[f"C{row}"].value
        if not isinstance(formula, str) or "Invoer" not in formula:
            continue
        if item is None and soort is None:
            continue
        for pakket_row, multiplier in parse_formula(formula):
            pakketnummer = row_to_pakket.get(pakket_row)
            if pakketnummer is None:
                raise ValueError(
                    f"{sheet_name} rij {row} verwijst naar Invoer-rij {pakket_row}, "
                    "die geen pakketnummer heeft"
                )
            entries.append(
                BomEntry(
                    pakketnummer=pakketnummer,
                    gebied=gebied,
                    item=str(item) if item is not None else "",
                    soort=str(soort) if soort is not None else "",
                    aantal_per_pakket=multiplier,
                )
            )
    return entries
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Write the failing test for `extract_dozen_bom`**

Append to `C:\picklist\tests\test_extract_bom.py`:
```python
import openpyxl as _openpyxl

from extract_bom import extract_dozen_bom


def _make_invoer_ws(rows):
    workbook = _openpyxl.Workbook()
    ws = workbook.active
    ws.title = "1. Invoer pakketaantal"
    for row_index, (pakketnummer, doos) in enumerate(rows, start=5):
        ws[f"B{row_index}"] = pakketnummer
        ws[f"H{row_index}"] = doos
    return ws


def test_extract_dozen_bom_splits_combined_box_values():
    ws = _make_invoer_ws([("1.10p", "14 + 15"), ("1.1", 14)])

    entries = extract_dozen_bom(ws)

    assert entries == [
        BomEntry("1.10p", "DOZEN", "14", "", 1.0),
        BomEntry("1.10p", "DOZEN", "15", "", 1.0),
        BomEntry("1.1", "DOZEN", "14", "", 1.0),
    ]
```

- [ ] **Step 6: Run test to verify it fails**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: FAIL with `ImportError: cannot import name 'extract_dozen_bom'`

- [ ] **Step 7: Implement `extract_dozen_bom` and `extract_bom`**

Append to `C:\picklist\extract_bom.py`:
```python
def extract_dozen_bom(invoer_ws, first_row=5):
    entries = []
    for row in range(first_row, invoer_ws.max_row + 1):
        pakketnummer = invoer_ws[f"B{row}"].value
        doos_value = invoer_ws[f"H{row}"].value
        if pakketnummer is None or doos_value is None:
            continue
        for token in str(doos_value).split("+"):
            box = token.strip()
            if box:
                entries.append(
                    BomEntry(
                        pakketnummer=str(pakketnummer),
                        gebied="DOZEN",
                        item=box,
                        soort="",
                        aantal_per_pakket=1.0,
                    )
                )
    return entries


def extract_bom(xlsm_path):
    workbook = openpyxl.load_workbook(xlsm_path, data_only=False, keep_vba=True)
    invoer_ws = workbook[INVOER_SHEET]
    row_to_pakket = build_row_to_pakket(invoer_ws)

    entries = []
    for sheet_name, gebied in AREA_SHEETS.items():
        entries.extend(extract_area_bom(workbook, sheet_name, gebied, row_to_pakket))
    entries.extend(extract_dozen_bom(invoer_ws))
    return entries


if __name__ == "__main__":
    source_path = sys.argv[1] if len(sys.argv) > 1 else (
        "E-Commerce PICKLIST - IN PROGRESS.xlsm"
    )
    bom_entries = extract_bom(source_path)
    write_bom_csv(bom_entries, "bom.csv")
    print(f"{len(bom_entries)} BOM-regels geschreven naar bom.csv")
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: PASS (4 passed)

- [ ] **Step 9: Commit**

```bash
git add extract_bom.py tests/test_extract_bom.py
git commit -m "feat: extract BOM entries from existing picklist formulas"
```

---

## Task 3: Order import from Bron.xlsm

**Files:**
- Create: `C:\picklist\import_orders.py`
- Test: `C:\picklist\tests\test_import_orders.py`

**Interfaces:**
- Produces: `find_bron_file(base_dir, for_date) -> Path` (raises `FileNotFoundError`
  with a Dutch message if the day's folder/file is missing);
  `read_totaal_alles(bron_path, first_row=7) -> dict[str, float]`. Task 6
  (`generate_picklist.py`) calls both.

- [ ] **Step 1: Write the failing tests**

`C:\picklist\tests\test_import_orders.py`:
```python
from datetime import date

import openpyxl
import pytest

from import_orders import find_bron_file, read_totaal_alles


def test_find_bron_file_builds_dutch_date_path(tmp_path):
    for_date = date(2026, 9, 16)
    day_folder = tmp_path / "2026" / "16-09-2026"
    day_folder.mkdir(parents=True)
    bron_path = day_folder / "Bron.xlsm"
    bron_path.write_bytes(b"")

    result = find_bron_file(tmp_path, for_date)

    assert result == bron_path


def test_find_bron_file_missing_raises_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="16-09-2026"):
        find_bron_file(tmp_path, date(2026, 9, 16))


def test_read_totaal_alles_skips_header_and_totaal_row(tmp_path):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    ws = workbook.create_sheet("Totaal alles")
    ws.append(["TOTAAL VERKOOP PER DAG"])
    ws.append([])
    ws.append([])
    ws.append([])
    ws.append([])
    ws.append(["Pakketnummer", "Aantal"])
    ws.append(["1.1", 0])
    ws.append(["1.1p", 5])
    ws.append(["Totaal", 5])
    path = tmp_path / "Bron.xlsm"
    workbook.save(path)

    aantallen = read_totaal_alles(path)

    assert aantallen == {"1.1": 0, "1.1p": 5}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_import_orders.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'import_orders'`

- [ ] **Step 3: Implement `import_orders.py`**

`C:\picklist\import_orders.py`:
```python
from pathlib import Path

import openpyxl

TOTAAL_ALLES_SHEET = "Totaal alles"


def find_bron_file(base_dir, for_date):
    folder = Path(base_dir) / str(for_date.year) / for_date.strftime("%d-%m-%Y")
    bron_path = folder / "Bron.xlsm"
    if not bron_path.exists():
        raise FileNotFoundError(
            f"Geen Bron.xlsm gevonden voor {for_date.strftime('%d-%m-%Y')} "
            f"(verwacht: {bron_path})"
        )
    return bron_path


def read_totaal_alles(bron_path, first_row=7):
    workbook = openpyxl.load_workbook(bron_path, data_only=True, keep_vba=True)
    ws = workbook[TOTAAL_ALLES_SHEET]
    aantallen = {}
    for row in range(first_row, ws.max_row + 1):
        pakketnummer = ws[f"A{row}"].value
        aantal = ws[f"B{row}"].value
        if pakketnummer is None:
            continue
        pakketnummer = str(pakketnummer).strip()
        if pakketnummer.lower() == "totaal":
            continue
        aantallen[pakketnummer] = aantal if isinstance(aantal, (int, float)) else 0
    return aantallen
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_import_orders.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add import_orders.py tests/test_import_orders.py
git commit -m "feat: import daily order counts from Bron.xlsm"
```

---

## Task 4: Picklist calculation

**Files:**
- Create: `C:\picklist\calculate.py`
- Test: `C:\picklist\tests\test_calculate.py`

**Interfaces:**
- Consumes: `BomEntry` from `bom.py` (Task 1).
- Produces: `calculate_totals(bom_entries, aantallen) -> tuple[dict[str, dict[tuple[str, str], float]], dict[str, float]]`
  — `(totals, unknown)` where `totals[gebied][(item, soort)] = aantal` and `unknown`
  maps pakketnummer → aantal for pakketten ordered but absent from the BOM. Task 6
  calls this with the loaded BOM and imported aantallen.

- [ ] **Step 1: Write the failing tests**

`C:\picklist\tests\test_calculate.py`:
```python
from bom import BomEntry
from calculate import calculate_totals


def test_calculate_totals_applies_multiplier_and_sums_across_pakketten():
    bom_entries = [
        BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0),
        BomEntry("1.32", "KOELING", "Parade", "CL Pink", 3.0),
    ]
    aantallen = {"1.3": 2, "1.32": 4}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert totals["KOELING"][("Parade", "CL Pink")] == 2 * 1.0 + 4 * 3.0
    assert unknown == {}


def test_calculate_totals_ignores_pakketten_with_zero_orders():
    bom_entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)]
    aantallen = {"1.3": 0}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert totals == {}
    assert unknown == {}


def test_calculate_totals_flags_unknown_pakketten_with_nonzero_orders():
    bom_entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)]
    aantallen = {"1.3": 1, "99.9": 7, "99.10": 0}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert unknown == {"99.9": 7}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_calculate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'calculate'`

- [ ] **Step 3: Implement `calculate.py`**

`C:\picklist\calculate.py`:
```python
from collections import defaultdict


def calculate_totals(bom_entries, aantallen):
    totals = defaultdict(lambda: defaultdict(float))
    known_pakketten = {entry.pakketnummer for entry in bom_entries}

    for entry in bom_entries:
        aantal = aantallen.get(entry.pakketnummer, 0)
        if aantal:
            totals[entry.gebied][(entry.item, entry.soort)] += (
                aantal * entry.aantal_per_pakket
            )

    unknown = {
        pakketnummer: aantal
        for pakketnummer, aantal in aantallen.items()
        if aantal and pakketnummer not in known_pakketten
    }

    return {gebied: dict(items) for gebied, items in totals.items()}, unknown
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_calculate.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add calculate.py tests/test_calculate.py
git commit -m "feat: calculate per-gebied picklist totals from BOM and orders"
```

---

## Task 5: Output writer

**Files:**
- Create: `C:\picklist\write_picklist.py`
- Test: `C:\picklist\tests\test_write_picklist.py`

**Interfaces:**
- Produces: `write_picklist(totals, unknown, output_path, for_date)`. Task 6 calls
  this as the final step.

- [ ] **Step 1: Write the failing test**

`C:\picklist\tests\test_write_picklist.py`:
```python
from datetime import date

import openpyxl

from write_picklist import write_picklist


def test_write_picklist_creates_one_sheet_per_gebied_plus_unknown(tmp_path):
    totals = {
        "KOELING": {("Parade", "CL Pink"): 14.0},
        "DOZEN": {("9", ""): 3.0},
    }
    unknown = {"99.9": 7}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, unknown, output_path, date(2026, 9, 16))

    workbook = openpyxl.load_workbook(output_path)
    assert workbook.sheetnames == [
        "KOELING",
        "KAS",
        "KAMER",
        "POKON",
        "DOZEN",
        "Onbekende pakketten",
    ]

    koeling = workbook["KOELING"]
    assert koeling["B2"].value == "16-09-2026"
    assert [cell.value for cell in koeling[5]] == ["Parade", "CL Pink", 14]

    kas = workbook["KAS"]
    assert kas.max_row == 4  # header rows only, no items ordered

    onbekend = workbook["Onbekende pakketten"]
    assert [cell.value for cell in onbekend[2]] == ["99.9", 7]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_write_picklist.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'write_picklist'`

- [ ] **Step 3: Implement `write_picklist.py`**

`C:\picklist\write_picklist.py`:
```python
import openpyxl

GEBIED_ORDER = ["KOELING", "KAS", "KAMER", "POKON", "DOZEN"]


def _display_aantal(aantal):
    return int(aantal) if float(aantal).is_integer() else aantal


def write_picklist(totals, unknown, output_path, for_date):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)

    for gebied in GEBIED_ORDER:
        ws = workbook.create_sheet(gebied)
        ws.append([f"E-COMMERCE {gebied} PICKLIST"])
        ws.append(["Datum:", for_date.strftime("%d-%m-%Y")])
        ws.append([])
        ws.append(["Item", "Soort", "Aantal"])
        rows = sorted(totals.get(gebied, {}).items(), key=lambda kv: (kv[0][0], kv[0][1]))
        for (item, soort), aantal in rows:
            ws.append([item, soort, _display_aantal(aantal)])

    unknown_ws = workbook.create_sheet("Onbekende pakketten")
    unknown_ws.append(["Pakketnummer", "Aantal besteld"])
    for pakketnummer, aantal in sorted(unknown.items()):
        unknown_ws.append([pakketnummer, _display_aantal(aantal)])

    workbook.save(output_path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_write_picklist.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add write_picklist.py tests/test_write_picklist.py
git commit -m "feat: write computed totals to a clean picklist workbook"
```

---

## Task 6: Main CLI wiring it all together

**Files:**
- Create: `C:\picklist\generate_picklist.py`
- Test: `C:\picklist\tests\test_generate_picklist.py`

**Interfaces:**
- Consumes: `load_bom_csv` (Task 1), `find_bron_file`/`read_totaal_alles` (Task 3),
  `calculate_totals` (Task 4), `write_picklist` (Task 5).
- Produces: `main(base_order_dir, bom_csv_path, output_path, today=None) -> int`
  (exit code: 0 success, 1 on a missing `Bron.xlsm`). The `.bat` launcher in Task 8
  calls the module's `if __name__ == "__main__"` block, which calls `main()` with the
  real constants.

- [ ] **Step 1: Write the failing end-to-end test**

`C:\picklist\tests\test_generate_picklist.py`:
```python
from datetime import date

import openpyxl
import pytest

from bom import BomEntry, write_bom_csv
from generate_picklist import main


def _make_bron(path):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    ws = workbook.create_sheet("Totaal alles")
    for _ in range(5):
        ws.append([])
    ws.append(["Pakketnummer", "Aantal"])
    ws.append(["1.3", 2])
    ws.append(["99.9", 7])
    workbook.save(path)


def test_main_writes_picklist_and_reports_unknown(tmp_path, capsys):
    base_order_dir = tmp_path / "orders"
    day_folder = base_order_dir / "2026" / "16-09-2026"
    day_folder.mkdir(parents=True)
    _make_bron(day_folder / "Bron.xlsm")

    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)], bom_csv_path)

    output_path = tmp_path / "Picklist.xlsx"

    exit_code = main(
        base_order_dir=base_order_dir,
        bom_csv_path=bom_csv_path,
        output_path=output_path,
        today=date(2026, 9, 16),
    )

    assert exit_code == 0
    assert output_path.exists()
    workbook = openpyxl.load_workbook(output_path)
    assert workbook["KOELING"]["A5"].value == "Parade"
    assert "99.9" in capsys.readouterr().out


def test_main_returns_error_code_when_bron_missing(tmp_path, capsys):
    base_order_dir = tmp_path / "orders"
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([], bom_csv_path)
    output_path = tmp_path / "Picklist.xlsx"

    exit_code = main(
        base_order_dir=base_order_dir,
        bom_csv_path=bom_csv_path,
        output_path=output_path,
        today=date(2026, 9, 16),
    )

    assert exit_code == 1
    assert not output_path.exists()
    assert "FOUT" in capsys.readouterr().out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_generate_picklist.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'generate_picklist'`

- [ ] **Step 3: Implement `generate_picklist.py`**

`C:\picklist\generate_picklist.py`:
```python
import sys
from datetime import date
from pathlib import Path

from bom import load_bom_csv
from calculate import calculate_totals
from import_orders import find_bron_file, read_totaal_alles
from write_picklist import write_picklist

BASE_ORDER_DIR = Path(r"K:\E-Commerce\Orderverwerking\2_Orders")
BOM_CSV_PATH = Path(__file__).parent / "bom.csv"
OUTPUT_PATH = Path(__file__).parent / "Picklist.xlsx"


def main(base_order_dir=BASE_ORDER_DIR, bom_csv_path=BOM_CSV_PATH,
          output_path=OUTPUT_PATH, today=None):
    today = today or date.today()

    try:
        bron_path = find_bron_file(base_order_dir, today)
        aantallen = read_totaal_alles(bron_path)
    except FileNotFoundError as error:
        print(f"FOUT: {error}")
        return 1

    bom_entries = load_bom_csv(bom_csv_path)
    totals, unknown = calculate_totals(bom_entries, aantallen)
    write_picklist(totals, unknown, output_path, today)

    print(f"Picklist geschreven naar {output_path}")
    if unknown:
        print(
            f"LET OP: {len(unknown)} onbekend pakketnummer/-nummers "
            "(zie sheet 'Onbekende pakketten'):"
        )
        for pakketnummer, aantal in sorted(unknown.items()):
            print(f"  {pakketnummer}: {aantal}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_generate_picklist.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full test suite**

Run: `python -m pytest -v`
Expected: all tests across every task pass.

- [ ] **Step 6: Commit**

```bash
git add generate_picklist.py tests/test_generate_picklist.py
git commit -m "feat: wire BOM, import, calculation and output into a CLI entry point"
```

---

## Task 7: Windows double-click launcher

**Files:**
- Create: `C:\picklist\run_picklist.bat`
- Modify: `C:\picklist\README.md` (create if absent)

**Interfaces:**
- Consumes: `generate_picklist.py`'s `__main__` block (Task 6). No other task depends
  on this one — it is the end-user entry point.

- [ ] **Step 1: Create the launcher**

`C:\picklist\run_picklist.bat`:
```bat
@echo off
cd /d "%~dp0"
python generate_picklist.py
echo.
pause
```

- [ ] **Step 2: Manually verify the launcher**

Run (from an actual Windows shell, double-click or): `run_picklist.bat`
Expected: a console window opens, runs `generate_picklist.py`, prints either a
success line with the output path (and any unknown-pakket warnings) or a `FOUT:`
line, and waits for a keypress before closing — so a warehouse staff member has time
to read the result.

- [ ] **Step 3: Write `README.md`**

`C:\picklist\README.md`:
```markdown
# E-commerce picklist

Genereert dagelijks `Picklist.xlsx` op basis van de bestellingen in `Bron.xlsm`.

## Gebruik

Dubbelklik `run_picklist.bat` nadat de bestellingen van vandaag binnen zijn. Het
resultaat komt in `Picklist.xlsx` in deze map, en bestaande onbekende
pakketnummers (nieuw product, nog niet in `bom.csv`) worden apart getoond in het
consolevenster en op het tabblad "Onbekende pakketten".

## Nieuw product/pakket toevoegen

Voeg een regel toe aan `bom.csv`: `pakketnummer,gebied,item,soort,aantal_per_pakket`.
`gebied` is een van `KOELING`, `KAS`, `KAMER`, `POKON`, `DOZEN`.

## Ontwikkelaars

Tests draaien met `python -m pytest`. Zie
`docs/superpowers/specs/2026-09-15-picklist-automation-design.md` voor het ontwerp.
```

- [ ] **Step 4: Commit**

```bash
git add run_picklist.bat README.md
git commit -m "feat: add double-click launcher and usage README"
```

---

## Task 8: Extract the real BOM and validate against history

This is the task that turns the one-time extraction into the actual `bom.csv` the
tool will run against, and proves it against real historical data before anyone
relies on it.

**Files:**
- Create: `C:\picklist\bom.csv` (generated, not hand-written)
- Create: `C:\picklist\tools\validate_against_history.py`

**Interfaces:**
- Consumes: `extract_bom`/`build_row_to_pakket`/`parse_formula` (Task 2).
- Produces: a committed `bom.csv`, and a reusable validation script for whenever
  `bom.csv` changes.

- [ ] **Step 1: Run the real extraction**

Run: `python extract_bom.py "E-Commerce PICKLIST - IN PROGRESS.xlsm"`
Expected: prints `2098 BOM-regels geschreven naar bom.csv` (or close to it — the
exact count depends on the live file at run time) and creates `bom.csv` in
`C:\picklist`.

- [ ] **Step 2: Write the validation script**

`C:\picklist\tools\validate_against_history.py`:
```python
"""Recompute picklist totals from bom.csv against a historical, already-filled
picklist workbook, and compare against that workbook's own cached formula
results. Run this after any change to bom.csv (e.g. adding a new product) to
confirm the BOM still matches how the spreadsheet actually calculates.

Usage: python tools/validate_against_history.py <historical_xlsm_path>
"""

import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bom import load_bom_csv
from calculate import calculate_totals

AREA_SHEETS = {
    "2. KOELING PICKLIST": "KOELING",
    "3. KAS PICKLIST": "KAS",
    "4. KAMER PICKLIST": "KAMER",
    "5. POKON PICKLIST": "POKON",
}


def read_historical_aantallen(invoer_ws):
    aantallen = {}
    for row in range(5, invoer_ws.max_row + 1):
        pakketnummer = invoer_ws[f"B{row}"].value
        aantal = invoer_ws[f"G{row}"].value
        if pakketnummer is not None:
            aantallen[str(pakketnummer)] = aantal if isinstance(aantal, (int, float)) else 0
    return aantallen


def main(historical_path, bom_csv_path=Path(__file__).resolve().parent.parent / "bom.csv"):
    workbook = openpyxl.load_workbook(historical_path, data_only=True, keep_vba=True)
    aantallen = read_historical_aantallen(workbook["1. Invoer pakketaantal"])
    bom_entries = load_bom_csv(bom_csv_path)
    totals, _unknown = calculate_totals(bom_entries, aantallen)

    checked = matches = mismatches = 0
    for sheet_name, gebied in AREA_SHEETS.items():
        ws = workbook[sheet_name]
        for row in range(6, ws.max_row + 1):
            item = ws[f"A{row}"].value
            soort = ws[f"B{row}"].value
            cached = ws[f"C{row}"].value
            if item is None and soort is None:
                continue
            cached = cached if isinstance(cached, (int, float)) else 0
            predicted = totals.get(gebied, {}).get((str(item), str(soort) if soort else ""), 0)
            checked += 1
            if abs(predicted - cached) > 1e-9:
                mismatches += 1
                print(f"MISMATCH {sheet_name} row {row} ({item}/{soort}): "
                      f"predicted={predicted} cached={cached}")
            else:
                matches += 1

    print(f"checked={checked} matches={matches} mismatches={mismatches}")
    return 0 if mismatches == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
```

- [ ] **Step 3: Run the validation against a historical filled workbook**

Run: `python tools/validate_against_history.py "K:\E-Commerce\Orderverwerking\1_Invoeren\PICKLISTEN\E-Commerce PICKLIST-BACKUP.xlsm"`
Expected: `checked=267 matches=267 mismatches=0` (this exact result was already
confirmed manually while preparing this plan; re-run it here so it's reproducible
from a clean checkout and to catch any drift if the source workbook changes before
this task is executed).

**Known follow-up, not blocking:** this validation script only covers the
KOELING/KAS/KAMER/POKON area sheets. The DOZEN sheet uses text-based box matching
(`SUMIF` on the "Doos:" column) rather than fixed multipliers; spot-checking it
against this same backup file showed 17/20 rows matching, with the remaining
differences traced to that backup's cached values being stale (calculated before
its last edit) rather than a flaw in `extract_dozen_bom`. Before relying on the
DOZEN sheet output for a real day, manually compare `Picklist.xlsx`'s DOZEN totals
against the current `E-Commerce PICKLIST - IN PROGRESS.xlsm` DOZEN sheet once, using
freshly entered (not historical) data.

- [ ] **Step 4: Commit**

```bash
git add bom.csv tools/validate_against_history.py
git commit -m "feat: generate real bom.csv and validate it against historical data"
```

---

## Task 9: Full manual dry run

Not a code task — a checklist to run once, by hand, before trusting the tool for a
real day.

- [ ] Confirm the K: drive is mapped and reachable from the machine that will run
  `run_picklist.bat`.
- [ ] Double-click `run_picklist.bat` on a day with a real `Bron.xlsm` already
  present.
- [ ] Open the resulting `Picklist.xlsx` and manually compare a handful of KOELING/
  KAS/KAMER/POKON rows, and the DOZEN rows specifically (see Task 8's known
  follow-up), against what today's manual copy/paste + the existing `.xlsm` would
  have produced.
- [ ] Confirm any genuinely new pakketnummer for the day shows up on the "Onbekende
  pakketten" sheet, and add it to `bom.csv` using the format in `README.md`.

---

## Amendment (post-final-review): category grouping and DOZEN pallets

The final whole-branch review (after Task 9) found that `write_picklist.py`
flattens each gebied's items into one alphabetical list, dropping two things the
original workbook's picklist sheets have: (1) category header rows (e.g. "Rozen
38CM:", "Mediterrane:") with a subtotal, which group items in the order the picker
walks them, and (2) on the DOZEN sheet specifically, a computed "Aantal pallets"
column (dozen ÷ a fixed divisor per doosnummer) and a "TOTAAL AANTAL PALLETS" row.
The user confirmed both are operationally needed. Tasks 10-11 add them.

This was verified directly against the live production workbook while writing this
amendment: every category header row in the four area sheets (KOELING/KAS/KAMER/
POKON) is a row whose column-C formula is a `=SUM(...)` referencing the rows below
it (e.g. `2. KOELING PICKLIST!C6 = 'Rozen 38CM:' / '=SUM(C7:C18)'`), immediately
followed by that category's item rows, a blank row, then the next header — this
pattern holds across all four sheets. The DOZEN sheet's per-doosnummer pallet
divisors were read directly from `6. DOZEN PICKLIST!B6:B23`
(`=Tabel110[[#This Row],[Aantal dozen:]]/<divisor>`):

```
1→100, 2→54, 3→54, 4→27, 5→34, 6→16, 7→70, 8→60, 9→40, 10→36, 11→21, 12→36,
13→16, 14→72, 15→144, 16→25, KB→24, EUR40→30
```

and the sheet's own doosnummer row order is `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
13, 14, 15, 16, KB, EUR40` — every box token present in the live `H` column data
(`1`-`15`, `EUR40`, `KB`; `16` unused today but present on the sheet) is covered by
this list.

### Task 10: Capture category and original order in the BOM

**Files:**
- Modify: `C:\picklist\bom.py`
- Modify: `C:\picklist\extract_bom.py`
- Modify: `C:\picklist\calculate.py`
- Modify: `C:\picklist\tests\test_extract_bom.py`
- Test: `C:\picklist\tests\test_bom.py`, `C:\picklist\tests\test_calculate.py`

**Interfaces:**
- Consumes: existing `BomEntry`, `extract_area_bom`, `extract_dozen_bom` (Tasks 1-2).
- Produces: `BomEntry` gains two fields with defaults (`groep: str = ""`,
  `volgorde: int = 0`) — existing callers that don't pass them are unaffected.
  `calculate.build_item_order(bom_entries) -> dict[str, dict[tuple[str, str], tuple[str, int]]]`
  (`gebied -> (item, soort) -> (groep, volgorde)`). Task 11 consumes both.

- [ ] **Step 1: Write the failing test for the extended `BomEntry`**

Add to `C:\picklist\tests\test_bom.py`:
```python
def test_write_then_load_round_trip_preserves_groep_and_volgorde(tmp_path):
    entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "Rozen 38CM:", 7)]
    csv_path = tmp_path / "bom.csv"

    write_bom_csv(entries, csv_path)
    loaded = load_bom_csv(csv_path)

    assert loaded == entries
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_bom.py -v`
Expected: FAIL — `TypeError: BomEntry.__init__() takes ... positional arguments`
(the new fields don't exist yet).

- [ ] **Step 3: Extend `bom.py`**

In `C:\picklist\bom.py`, change the `BomEntry` dataclass and `FIELDNAMES`:
```python
@dataclass(frozen=True)
class BomEntry:
    pakketnummer: str
    gebied: str
    item: str
    soort: str
    aantal_per_pakket: float
    groep: str = ""
    volgorde: int = 0


FIELDNAMES = [
    "pakketnummer",
    "gebied",
    "item",
    "soort",
    "aantal_per_pakket",
    "groep",
    "volgorde",
]
```

In `load_bom_csv`, add the two fields when constructing each `BomEntry`:
```python
                    groep=row["groep"],
                    volgorde=int(row["volgorde"]),
```
(insert these two lines inside the existing `BomEntry(...)` call, after
`aantal_per_pakket=float(row["aantal_per_pakket"]),`)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_bom.py -v`
Expected: PASS (2 passed — the original round-trip test still passes using the new
fields' defaults)

- [ ] **Step 5: Update the existing DOZEN extraction test for the new fields**

`extract_dozen_bom` is about to start populating `groep`/`volgorde` for real, which
will break the existing equality assertions in
`tests/test_extract_bom.py::test_extract_dozen_bom_splits_combined_box_values`
(they currently rely on the defaults). Replace that test:
```python
def test_extract_dozen_bom_splits_combined_box_values():
    ws = _make_invoer_ws([("1.10p", "14 + 15"), ("1.1", 14)])

    entries = extract_dozen_bom(ws)

    assert entries == [
        BomEntry("1.10p", "DOZEN", "14", "", 1.0, "", 13),
        BomEntry("1.10p", "DOZEN", "15", "", 1.0, "", 14),
        BomEntry("1.1", "DOZEN", "14", "", 1.0, "", 13),
    ]
```
(`13`/`14` are the box's position in the fixed doosnummer order defined in Step 7
below — box "14" is the 14th entry, 0-indexed position 13; box "15" is position 14)

- [ ] **Step 6: Run test to verify it fails**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: FAIL on `test_extract_dozen_bom_splits_combined_box_values` — actual
entries still have `volgorde=0` (default), not `13`/`14`.

- [ ] **Step 7: Implement category/order capture in `extract_bom.py`**

Replace `extract_area_bom` in `C:\picklist\extract_bom.py`:
```python
def extract_area_bom(workbook, sheet_name, gebied, row_to_pakket, first_row=6):
    ws = workbook[sheet_name]
    entries = []
    current_groep = ""
    for row in range(first_row, ws.max_row + 1):
        item = ws[f"A{row}"].value
        soort = ws[f"B{row}"].value
        formula = ws[f"C{row}"].value
        if isinstance(formula, str) and formula.strip().startswith("=SUM("):
            current_groep = str(item) if item is not None else ""
            continue
        if not isinstance(formula, str) or "Invoer" not in formula:
            continue
        if item is None and soort is None:
            continue
        for pakket_row, multiplier in parse_formula(formula):
            pakketnummer = row_to_pakket.get(pakket_row)
            if pakketnummer is None:
                raise ValueError(
                    f"{sheet_name} rij {row} verwijst naar Invoer-rij {pakket_row}, "
                    "die geen pakketnummer heeft"
                )
            entries.append(
                BomEntry(
                    pakketnummer=pakketnummer,
                    gebied=gebied,
                    item=str(item) if item is not None else "",
                    soort=str(soort) if soort is not None else "",
                    aantal_per_pakket=multiplier,
                    groep=current_groep,
                    volgorde=row,
                )
            )
    return entries
```

Add a fixed doosnummer order and replace `extract_dozen_bom`:
```python
BOX_ORDER = [
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15", "16",
    "KB", "EUR40",
]


def _box_volgorde(box):
    return BOX_ORDER.index(box) if box in BOX_ORDER else len(BOX_ORDER)


def extract_dozen_bom(invoer_ws, first_row=5):
    entries = []
    for row in range(first_row, invoer_ws.max_row + 1):
        pakketnummer = invoer_ws[f"B{row}"].value
        doos_value = invoer_ws[f"H{row}"].value
        if pakketnummer is None or doos_value is None:
            continue
        for token in str(doos_value).split("+"):
            box = token.strip()
            if box:
                entries.append(
                    BomEntry(
                        pakketnummer=str(pakketnummer),
                        gebied="DOZEN",
                        item=box,
                        soort="",
                        aantal_per_pakket=1.0,
                        groep="",
                        volgorde=_box_volgorde(box),
                    )
                )
    return entries
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `python -m pytest tests/test_extract_bom.py -v`
Expected: PASS (4 passed)

- [ ] **Step 9: Write the failing test for `build_item_order`**

Add to `C:\picklist\tests\test_calculate.py`:
```python
from calculate import build_item_order


def test_build_item_order_maps_first_seen_groep_and_volgorde():
    bom_entries = [
        BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "Rozen 38CM:", 7),
        BomEntry("1.32", "KOELING", "Parade", "CL Pink", 3.0, "Rozen 38CM:", 7),
        BomEntry("1.1", "DOZEN", "14", "", 1.0, "", 13),
    ]

    item_order = build_item_order(bom_entries)

    assert item_order["KOELING"][("Parade", "CL Pink")] == ("Rozen 38CM:", 7)
    assert item_order["DOZEN"][("14", "")] == ("", 13)
```

- [ ] **Step 10: Run test to verify it fails**

Run: `python -m pytest tests/test_calculate.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_item_order'`

- [ ] **Step 11: Implement `build_item_order`**

Append to `C:\picklist\calculate.py`:
```python
def build_item_order(bom_entries):
    item_order = {}
    for entry in bom_entries:
        key = (entry.item, entry.soort)
        item_order.setdefault(entry.gebied, {}).setdefault(
            key, (entry.groep, entry.volgorde)
        )
    return item_order
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `python -m pytest tests/test_calculate.py -v`
Expected: PASS (4 passed)

- [ ] **Step 13: Re-run the real extraction and re-validate**

Run: `python extract_bom.py "E-Commerce PICKLIST - IN PROGRESS.xlsm"`
Expected: prints a BOM row count (same order of magnitude as before — this only
adds two columns per row, it doesn't change which rows are extracted).

Run: `python tools/validate_against_history.py "K:\E-Commerce\Orderverwerking\1_Invoeren\PICKLISTEN\E-Commerce PICKLIST-BACKUP.xlsm"`
Expected: the same result as before this amendment (as of this plan being written:
`checked=267 matches=266 mismatches=1`, the one mismatch being the known
"Nandina Domestica Obsessed" naming drift) — `build_item_order`/the new fields
don't change what gets extracted or how totals are computed, only what extra
metadata rides along.

- [ ] **Step 14: Run the full test suite**

Run: `python -m pytest -v`
Expected: all tests pass.

- [ ] **Step 15: Commit**

```bash
git add bom.py extract_bom.py calculate.py tests/test_bom.py tests/test_extract_bom.py tests/test_calculate.py bom.csv
git commit -m "feat: capture category and original sheet order in the BOM"
```

---

### Task 11: Grouped output and DOZEN pallet totals

**Files:**
- Modify: `C:\picklist\write_picklist.py`
- Modify: `C:\picklist\generate_picklist.py`
- Test: `C:\picklist\tests\test_write_picklist.py`
- Modify: `C:\picklist\tests\test_generate_picklist.py`

**Interfaces:**
- Consumes: `build_item_order` (Task 10).
- Produces: `write_picklist(totals, unknown, output_path, for_date, item_order)` —
  the signature gains a required `item_order` parameter. `generate_picklist.main`
  is the only caller and is updated in this task too.

**Global constraint this task must honor:** all user-facing text stays Dutch —
"Aantal pallets", "Aantal dozen", "Totaal" are already Dutch; keep it that way.

- [ ] **Step 1: Write the failing tests**

Replace `C:\picklist\tests\test_write_picklist.py`:
```python
from datetime import date

import openpyxl

from write_picklist import write_picklist


def test_write_picklist_groups_area_items_by_category_with_subtotal(tmp_path):
    totals = {
        "KOELING": {
            ("Parade", "CL Pink"): 4.0,
            ("Golden Rain", "CL Yellow"): 2.0,
            ("Bambino", "Pink"): 1.0,
        },
    }
    item_order = {
        "KOELING": {
            ("Parade", "CL Pink"): ("Rozen 38CM:", 7),
            ("Golden Rain", "CL Yellow"): ("Rozen 38CM:", 9),
            ("Bambino", "Pink"): ("Mini Stamroos 70CM:", 27),
        },
    }
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["KOELING"]
    rows = [[c.value for c in row] for row in ws.iter_rows(min_row=5)]
    assert rows == [
        ["Rozen 38CM:", None, 6],
        ["Parade", "CL Pink", 4],
        ["Golden Rain", "CL Yellow", 2],
        [None, None, None],
        ["Mini Stamroos 70CM:", None, 1],
        ["Bambino", "Pink", 1],
        [None, None, None],
    ]


def test_write_picklist_dozen_sheet_has_pallet_column_and_total(tmp_path):
    totals = {"DOZEN": {("1", ""): 250.0, ("KB", ""): 48.0}}
    item_order = {"DOZEN": {("1", ""): ("", 0), ("KB", ""): ("", 16)}}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["DOZEN"]
    rows = [[c.value for c in row] for row in ws.iter_rows(min_row=4)]
    assert rows == [
        ["Doosnummer", "Aantal pallets", "Aantal dozen"],
        ["1", 2.5, 250],
        ["KB", 2, 48],
        ["Totaal", 4.5, 298],
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_write_picklist.py -v`
Expected: FAIL — `write_picklist() missing 1 required positional argument:
'item_order'`

- [ ] **Step 3: Implement the grouped/pallet writer**

Replace `C:\picklist\write_picklist.py`:
```python
import openpyxl

GEBIED_ORDER = ["KOELING", "KAS", "KAMER", "POKON", "DOZEN"]

BOXES_PER_PALLET = {
    "1": 100, "2": 54, "3": 54, "4": 27, "5": 34, "6": 16, "7": 70, "8": 60,
    "9": 40, "10": 36, "11": 21, "12": 36, "13": 16, "14": 72, "15": 144,
    "16": 25, "KB": 24, "EUR40": 30,
}


def _display_aantal(aantal):
    return int(aantal) if float(aantal).is_integer() else aantal


def _grouped_by_category(totals_for_gebied, item_order_for_gebied):
    entries = []
    for (item, soort), aantal in totals_for_gebied.items():
        groep, volgorde = item_order_for_gebied.get((item, soort), ("", 0))
        entries.append((volgorde, groep, item, soort, aantal))
    entries.sort(key=lambda e: e[0])

    groups = []
    current_groep = None
    for _volgorde, groep, item, soort, aantal in entries:
        if groep != current_groep:
            groups.append({"groep": groep, "items": []})
            current_groep = groep
        groups[-1]["items"].append((item, soort, aantal))
    return groups


def _write_area_sheet(ws, totals_for_gebied, item_order_for_gebied):
    ws.append(["Item", "Soort", "Aantal"])
    for group in _grouped_by_category(totals_for_gebied, item_order_for_gebied):
        subtotal = sum(aantal for _item, _soort, aantal in group["items"])
        if group["groep"]:
            ws.append([group["groep"], None, _display_aantal(subtotal)])
        for item, soort, aantal in group["items"]:
            ws.append([item, soort, _display_aantal(aantal)])
        ws.append([])


def _write_dozen_sheet(ws, totals_for_gebied, item_order_for_gebied):
    ws.append(["Doosnummer", "Aantal pallets", "Aantal dozen"])
    rows = sorted(
        totals_for_gebied.items(),
        key=lambda kv: item_order_for_gebied.get(kv[0], ("", 0))[1],
    )
    total_pallets = 0.0
    total_dozen = 0.0
    for (item, _soort), aantal in rows:
        divisor = BOXES_PER_PALLET.get(item)
        pallets = aantal / divisor if divisor else 0.0
        total_pallets += pallets
        total_dozen += aantal
        ws.append([item, _display_aantal(pallets), _display_aantal(aantal)])
    ws.append(["Totaal", _display_aantal(total_pallets), _display_aantal(total_dozen)])


def write_picklist(totals, unknown, output_path, for_date, item_order):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)

    for gebied in GEBIED_ORDER:
        ws = workbook.create_sheet(gebied)
        ws.append([f"E-COMMERCE {gebied} PICKLIST"])
        ws.append(["Datum:", for_date.strftime("%d-%m-%Y")])
        ws.append([])
        totals_for_gebied = totals.get(gebied, {})
        item_order_for_gebied = item_order.get(gebied, {})
        if gebied == "DOZEN":
            _write_dozen_sheet(ws, totals_for_gebied, item_order_for_gebied)
        else:
            _write_area_sheet(ws, totals_for_gebied, item_order_for_gebied)

    unknown_ws = workbook.create_sheet("Onbekende pakketten")
    unknown_ws.append(["Pakketnummer", "Aantal besteld"])
    for pakketnummer, aantal in sorted(unknown.items()):
        unknown_ws.append([pakketnummer, _display_aantal(aantal)])

    workbook.save(output_path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_write_picklist.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Wire `item_order` through `generate_picklist.py`**

In `C:\picklist\generate_picklist.py`, add the import and call:
```python
from calculate import build_item_order, calculate_totals
```
(replaces the existing `from calculate import calculate_totals` line)

And in `main`, replace:
```python
    bom_entries = load_bom_csv(bom_csv_path)
    totals, unknown = calculate_totals(bom_entries, aantallen)
    write_picklist(totals, unknown, output_path, today)
```
with:
```python
    bom_entries = load_bom_csv(bom_csv_path)
    totals, unknown = calculate_totals(bom_entries, aantallen)
    item_order = build_item_order(bom_entries)
    write_picklist(totals, unknown, output_path, today, item_order)
```

- [ ] **Step 6: Confirm `test_generate_picklist.py` still passes unmodified**

The success-path test asserts `workbook["KOELING"]["A5"].value == "Parade"`. Its
`BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)` doesn't pass `groep`, so it
gets the default `""`. In `_write_area_sheet`, a group with `groep == ""` is
falsy, so the `if group["groep"]:` check skips writing a header row for it — the
item row is written directly. Row 4 is still the `["Item", "Soort", "Aantal"]`
header, so row 5 is still `["Parade", "CL Pink", 2]`. No test changes are needed
for this file; this step is a confirmation run, not a fix:

Run: `python -m pytest tests/test_generate_picklist.py -v`
Expected: PASS (2 passed), unmodified. If it fails, that means the reasoning above
missed something real — stop and report DONE_WITH_CONCERNS with the actual output
rather than editing the test to force a pass.

- [ ] **Step 7: Run the full test suite**

Run: `python -m pytest -v`
Expected: all tests pass.

- [ ] **Step 8: Manually regenerate today's real Picklist.xlsx and spot-check**

Run: `python generate_picklist.py`
Expected: succeeds. Open `C:\picklist\Picklist.xlsx` and confirm: KOELING/KAS/KAMER/
POKON sheets show category header rows in bold-free plain rows with a subtotal in
column C, items nested beneath in original sheet order; DOZEN sheet shows
`Doosnummer | Aantal pallets | Aantal dozen` with numeric-then-KB-then-EUR40 order
and a `Totaal` row.

- [ ] **Step 9: Commit**

```bash
git add write_picklist.py generate_picklist.py tests/test_write_picklist.py tests/test_generate_picklist.py
git commit -m "feat: group area-sheet output by category and add DOZEN pallet totals"
```
