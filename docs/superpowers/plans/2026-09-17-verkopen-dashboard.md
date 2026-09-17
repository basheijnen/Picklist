# Verkopen 2026-2027 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual Excel sales-tracking workbook (`Totaaloverzicht verkochte pakketten 2026-2027.xlsm`) with a "Verkopen 2026-2027" dialog inside the picklist webapp, fed by uploading the same daily order-export CSV that's already used for picking.

**Architecture:** A new `verkoop_orders.csv` (one row per order line, deduped by order number) is the single source of truth, mirrored to `verkoop_data.js` (`window.PICKLIST_VERKOOP`) exactly like `bom.csv`/`package_info.csv` feed `data.js` today. All views (tiles, weekly chart, filterable table) are computed client-side from that flat array — nothing pre-aggregated is stored. A one-time migration script backfills the existing Excel's history into the same CSV.

**Tech Stack:** Python 3 stdlib (`csv`, `http.server`, `openpyxl` for migration), vanilla JS/CSS (no build step, no new dependencies) — matches the existing codebase exactly.

**Spec:** `docs/superpowers/specs/2026-09-17-verkopen-dashboard-design.md`

## Global Constraints

- No new runtime dependencies (Python stdlib + already-installed `openpyxl`; no JS libraries).
- Dutch UI text and error messages throughout, matching existing app copy style.
- `verkoop_orders.csv` must be added to `SHARED_DATA_FILES` in `webapp_server.py` so the existing Back-up button mirrors it to K: like `bom.csv`/`package_info.csv`.
- Follow existing code patterns exactly: dataclass + CSV read/write module (`bom.py`/`packages.py` style) for data access, business-logic functions living in `webapp_server.py` (`add_package` style), `<dialog>`-based secondary views (`managePackagesDialog` style) for the UI.
- This project has no JS test framework — frontend tasks are verified with `node --check` (syntax) plus a manual Node smoke test against real sample data, and a final manual browser walkthrough (per this repo's convention of testing UI changes live).

---

## Task 1: `sales.py` — data model and dedupe logic

**Files:**
- Create: `sales.py`
- Test: `tests/test_sales.py`

**Interfaces:**
- Produces: `VerkoopOrder(ordernummer: str, datum: str, kanaal: str, pakketnummer: str, aantal: float)` (frozen dataclass), `FIELDNAMES`, `load_verkoop_csv(path) -> list[VerkoopOrder]`, `write_verkoop_csv(orders, path) -> None`, `merge_new_orders(existing: list[VerkoopOrder], new_orders: list[VerkoopOrder]) -> tuple[list[VerkoopOrder], int, int]` (returns `(all_orders, toegevoegd, overgeslagen)`, deduped by `ordernummer`).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_sales.py`:

```python
from sales import VerkoopOrder, load_verkoop_csv, merge_new_orders, write_verkoop_csv


def test_write_then_load_roundtrips_orders(tmp_path):
    csv_path = tmp_path / "verkoop_orders.csv"
    orders = [
        VerkoopOrder("123", "2026-09-17", "VakantieVeilingen", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Amazon", "70.12", 1.0),
    ]

    write_verkoop_csv(orders, csv_path)

    assert load_verkoop_csv(csv_path) == orders


def test_load_verkoop_csv_returns_empty_list_when_file_missing(tmp_path):
    assert load_verkoop_csv(tmp_path / "does-not-exist.csv") == []


def test_merge_new_orders_skips_known_ordernummers():
    existing = [VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0)]
    new_orders = [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),  # duplicate
        VerkoopOrder("124", "2026-09-17", "Amazon", "9.1", 1.0),  # new
    ]

    all_orders, toegevoegd, overgeslagen = merge_new_orders(existing, new_orders)

    assert toegevoegd == 1
    assert overgeslagen == 1
    assert all_orders == [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Amazon", "9.1", 1.0),
    ]


def test_merge_new_orders_with_no_existing_orders_adds_everything():
    all_orders, toegevoegd, overgeslagen = merge_new_orders([], [
        VerkoopOrder("1", "2026-09-17", "Bol.com", "9.1", 1.0),
    ])

    assert toegevoegd == 1
    assert overgeslagen == 0
    assert len(all_orders) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_sales.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sales'`

- [ ] **Step 3: Write `sales.py`**

```python
import csv
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class VerkoopOrder:
    ordernummer: str
    datum: str
    kanaal: str
    pakketnummer: str
    aantal: float


FIELDNAMES = ["ordernummer", "datum", "kanaal", "pakketnummer", "aantal"]


def write_verkoop_csv(orders, path):
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for order in orders:
            writer.writerow(asdict(order))


def load_verkoop_csv(path):
    path = Path(path)
    if not path.exists():
        return []
    orders = []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            orders.append(
                VerkoopOrder(
                    ordernummer=row["ordernummer"],
                    datum=row["datum"],
                    kanaal=row["kanaal"],
                    pakketnummer=row["pakketnummer"],
                    aantal=float(row["aantal"]),
                )
            )
    return orders


def merge_new_orders(existing, new_orders):
    """Append `new_orders` to `existing`, skipping any whose `ordernummer`
    is already present (in `existing` or earlier in `new_orders`). Returns
    (all_orders, toegevoegd, overgeslagen); does not touch disk.
    """
    known = {order.ordernummer for order in existing}
    toegevoegd = []
    overgeslagen = 0
    for order in new_orders:
        if order.ordernummer in known:
            overgeslagen += 1
            continue
        known.add(order.ordernummer)
        toegevoegd.append(order)
    return existing + toegevoegd, len(toegevoegd), overgeslagen
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_sales.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add sales.py tests/test_sales.py
git commit -m "$(cat <<'EOF'
feat: add sales.py data model for verkoop_orders.csv

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `build_verkoop_data_js` — bundle sales data for the browser

**Files:**
- Modify: `tools/build_webapp_data.py`
- Test: `tests/test_build_webapp_data.py`

**Interfaces:**
- Consumes: `sales.load_verkoop_csv` (Task 1).
- Produces: `build_verkoop_data_js(verkoop_csv_path=VERKOOP_CSV_PATH, output_path=VERKOOP_DATA_JS_PATH) -> int` (returns row count, writes `window.PICKLIST_VERKOOP = [...]` to the output file).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_build_webapp_data.py`:

```python
from sales import VerkoopOrder, write_verkoop_csv
from tools.build_webapp_data import build_verkoop_data_js


def test_build_verkoop_data_js_writes_orders_as_window_global(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv(
        [VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0)],
        verkoop_csv_path,
    )
    output_path = tmp_path / "verkoop_data.js"

    count = build_verkoop_data_js(verkoop_csv_path, output_path)

    assert count == 1
    text = output_path.read_text(encoding="utf-8")
    orders_json = text.split("window.PICKLIST_VERKOOP = ", 1)[1].rstrip(";\n")
    assert json.loads(orders_json) == [
        {"ordernummer": "123", "datum": "2026-09-17", "kanaal": "Amazon", "pakketnummer": "9.1", "aantal": 1.0}
    ]


def test_build_verkoop_data_js_with_missing_csv_writes_empty_list(tmp_path):
    count = build_verkoop_data_js(tmp_path / "missing.csv", tmp_path / "verkoop_data.js")

    assert count == 0
    text = (tmp_path / "verkoop_data.js").read_text(encoding="utf-8")
    assert text == "window.PICKLIST_VERKOOP = [];\n"
```

(The `json` import is already at the top of this test file's target module; add `import json` to the test file's own imports if it isn't already there.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_build_webapp_data.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_verkoop_data_js'`

- [ ] **Step 3: Add `build_verkoop_data_js` to `tools/build_webapp_data.py`**

Add near the top, alongside the existing imports and path constants:

```python
from sales import load_verkoop_csv

VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"
VERKOOP_DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "verkoop_data.js"
```

Add the function after `build_data_js`:

```python
def build_verkoop_data_js(verkoop_csv_path=VERKOOP_CSV_PATH, output_path=VERKOOP_DATA_JS_PATH):
    orders = [
        {
            "ordernummer": order.ordernummer,
            "datum": order.datum,
            "kanaal": order.kanaal,
            "pakketnummer": order.pakketnummer,
            "aantal": order.aantal,
        }
        for order in load_verkoop_csv(verkoop_csv_path)
    ]
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "window.PICKLIST_VERKOOP = "
        + json.dumps(orders, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    return len(orders)
```

Update `main()` to also report the sales row count:

```python
def main():
    bom_count, package_count = build_data_js()
    verkoop_count = build_verkoop_data_js()
    print(f"{bom_count} BOM-regels en {package_count} pakketten geschreven naar {DATA_JS_PATH}")
    print(f"{verkoop_count} verkooporders geschreven naar {VERKOOP_DATA_JS_PATH}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_build_webapp_data.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/build_webapp_data.py tests/test_build_webapp_data.py
git commit -m "$(cat <<'EOF'
feat: bundle verkoop_orders.csv into window.PICKLIST_VERKOOP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `POST /api/verkoop` endpoint

**Files:**
- Modify: `webapp_server.py`
- Test: `tests/test_webapp_server.py`

**Interfaces:**
- Consumes: `sales.VerkoopOrder`, `sales.load_verkoop_csv`, `sales.write_verkoop_csv`, `sales.merge_new_orders` (Task 1); `tools.build_webapp_data.build_verkoop_data_js` (Task 2).
- Produces: `add_verkoop_orders(payload, verkoop_csv_path=VERKOOP_CSV_PATH) -> tuple[list[VerkoopOrder], int, int]` (same return shape as `merge_new_orders`; raises `ValueError` with a Dutch message on invalid input). HTTP: `POST /api/verkoop` with body `{"datum": "...", "rows": [{"ordernummer": "...", "kanaal": "...", "pakketnummer": "..."}]}`, responds `{"toegevoegd": n, "overgeslagen": n, "orders": [...]}` on success (each order serialized like `asdict(VerkoopOrder(...))`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_webapp_server.py`:

```python
import pytest

from sales import VerkoopOrder, load_verkoop_csv, write_verkoop_csv
from webapp_server import add_verkoop_orders


def test_add_verkoop_orders_appends_and_forces_aantal_to_one(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([], verkoop_csv_path)

    all_orders, toegevoegd, overgeslagen = add_verkoop_orders(
        {
            "datum": "2026-09-17",
            "rows": [
                {"ordernummer": "123", "kanaal": "Amazon", "pakketnummer": "9.1", "aantal": 999},
                {"ordernummer": "124", "kanaal": "Bol.com", "pakketnummer": "70.12"},
            ],
        },
        verkoop_csv_path,
    )

    assert toegevoegd == 2
    assert overgeslagen == 0
    assert all_orders == [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Bol.com", "70.12", 1.0),
    ]
    assert load_verkoop_csv(verkoop_csv_path) == all_orders


def test_add_verkoop_orders_dedupes_against_existing_ordernummers(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([VerkoopOrder("123", "2026-09-16", "Amazon", "9.1", 1.0)], verkoop_csv_path)

    all_orders, toegevoegd, overgeslagen = add_verkoop_orders(
        {"datum": "2026-09-17", "rows": [{"ordernummer": "123", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
        verkoop_csv_path,
    )

    assert toegevoegd == 0
    assert overgeslagen == 1
    assert all_orders == [VerkoopOrder("123", "2026-09-16", "Amazon", "9.1", 1.0)]


@pytest.mark.parametrize("payload", [
    {},
    {"datum": "", "rows": [{"ordernummer": "1", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": []},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "1", "kanaal": "", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "1", "kanaal": "Amazon", "pakketnummer": ""}]},
])
def test_add_verkoop_orders_rejects_invalid_payloads(tmp_path, payload):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([], verkoop_csv_path)

    with pytest.raises(ValueError):
        add_verkoop_orders(payload, verkoop_csv_path)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_webapp_server.py -v -k verkoop`
Expected: FAIL with `ImportError: cannot import name 'add_verkoop_orders'`

- [ ] **Step 3: Implement in `webapp_server.py`**

Add to the imports at the top:

```python
from sales import VerkoopOrder, load_verkoop_csv, merge_new_orders, write_verkoop_csv
from tools.build_webapp_data import build_data_js, build_verkoop_data_js
```

(This replaces the existing `from tools.build_webapp_data import build_data_js` line — just add `build_verkoop_data_js` to it.)

Add path constants next to the existing ones (`BOM_CSV_PATH` etc.):

```python
VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"
VERKOOP_DATA_JS_PATH = DIST_DIR / "verkoop_data.js"
```

Update `SHARED_DATA_FILES` to include the new file:

```python
SHARED_DATA_FILES = ["bom.csv", "package_info.csv", "verkoop_orders.csv"]
```

Add the business-logic function near `add_package`/`update_package`:

```python
def add_verkoop_orders(payload, verkoop_csv_path=VERKOOP_CSV_PATH):
    if not isinstance(payload, dict):
        raise ValueError("Ongeldige aanvraag.")
    datum = str(payload.get("datum", "")).strip()
    rows = payload.get("rows") or []
    if not datum or not rows:
        raise ValueError("Kies een datum en upload minstens één orderregel.")

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

    existing = load_verkoop_csv(verkoop_csv_path)
    all_orders, toegevoegd, overgeslagen = merge_new_orders(existing, new_orders)
    write_verkoop_csv(all_orders, verkoop_csv_path)
    return all_orders, toegevoegd, overgeslagen
```

Route it in `do_POST` (alongside the existing `/api/backup` / `/api/pakketten` handling):

```python
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
```

Add the handler method near `_handle_pakketten_write`:

```python
def _handle_verkoop_upload(self):
    try:
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")
    except (TypeError, ValueError):
        self._send_json(400, {"error": "Ongeldige aanvraag: kan de gegevens niet lezen."})
        return
    try:
        with _write_lock:
            all_orders, toegevoegd, overgeslagen = add_verkoop_orders(payload)
            build_verkoop_data_js(VERKOOP_CSV_PATH, VERKOOP_DATA_JS_PATH)
        self._send_json(200, {
            "toegevoegd": toegevoegd,
            "overgeslagen": overgeslagen,
            "orders": [asdict(order) for order in all_orders],
        })
    except ValueError as error:
        self._send_json(400, {"error": str(error)})
    except Exception as error:
        self._send_json(500, {"error": f"Onverwachte fout bij opslaan: {error}"})
```

Update `_pull_shared_data` to also rebuild `verkoop_data.js` after pulling from K: (it already rebuilds `data.js`):

```python
def _pull_shared_data():
    for filename in SHARED_DATA_FILES:
        source = SHARED_COPY_DIR / filename
        if source.exists():
            shutil.copy2(source, CANONICAL_REPO_DIR / filename)
    build_data_js(
        CANONICAL_REPO_DIR / "bom.csv",
        CANONICAL_REPO_DIR / "package_info.csv",
        CANONICAL_REPO_DIR / "webapp" / "dist" / "data.js",
    )
    build_verkoop_data_js(
        CANONICAL_REPO_DIR / "verkoop_orders.csv",
        CANONICAL_REPO_DIR / "webapp" / "dist" / "verkoop_data.js",
    )
```

Update `main()` so `verkoop_data.js` exists (even if empty) from server startup, right after the existing `build_data_js` call:

```python
def main(port=8765, open_browser=True):
    try:
        build_data_js(BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH, DATA_JS_PATH)
        build_verkoop_data_js(VERKOOP_CSV_PATH, VERKOOP_DATA_JS_PATH)
    except Exception as error:
        print(f"FOUT: kan bom.csv/package_info.csv niet inlezen: {error}")
        return 1
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_webapp_server.py -v -k verkoop`
Expected: PASS (8 passed — 2 + 6 parametrized cases)

Run the full suite to make sure nothing else broke: `pytest -q`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp_server.py tests/test_webapp_server.py
git commit -m "$(cat <<'EOF'
feat: add POST /api/verkoop endpoint for sales-order uploads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: HTML scaffolding — nav button and dialog skeleton

**Files:**
- Modify: `webapp/dist/index.html`

**Interfaces:**
- Produces: DOM elements consumed by Task 6/7/8's JS — `#openVerkoopButton`, `#verkoopDialog`, `#closeVerkoopDialog`, `#verkoopTiles`, `#verkoopChart`, `#verkoopUploadDatum`, `#verkoopUploadInput`, `#verkoopUploadButton`, `#verkoopUploadMessage`, `#verkoopPeriodeFilter`, `#verkoopKanaalFilter`, `#verkoopZoekInput`, `#verkoopTableBody`, `#verkoopTotaalCel`, and sortable `<th data-sort="...">` headers (`pakketnummer`, `naam`, `kanaal`, `aantal`).

- [ ] **Step 1: Add the topbar button**

In `webapp/dist/index.html`, inside `.header-actions` (right after the existing `#backupButton`):

```html
      <button id="openVerkoopButton" class="button button-secondary" type="button">
        Verkopen 2026-2027
      </button>
```

- [ ] **Step 2: Add the `<script src="verkoop_data.js">` tag**

Find `<script src="data.js"></script>` near the end of the file and add the sales bundle right after it:

```html
  <script src="data.js"></script>
  <script src="verkoop_data.js"></script>
```

- [ ] **Step 3: Add the dialog skeleton**

Add this new `<dialog>` right after the existing `</dialog>` that closes `#managePackagesDialog`:

```html
  <dialog id="verkoopDialog" class="package-dialog verkoop-dialog">
    <div class="dialog-header">
      <div><span class="eyebrow">Verkoopadministratie</span><h2>Verkopen 2026-2027</h2></div>
      <button id="closeVerkoopDialog" class="icon-button" type="button" aria-label="Sluiten">×</button>
    </div>
    <div class="verkoop-dialog-body">

      <div class="verkoop-upload-row">
        <label class="verkoop-upload-datum-field">
          Datum
          <input id="verkoopUploadDatum" type="date">
        </label>
        <label id="verkoopUploadButton" class="button button-primary verkoop-upload-button" for="verkoopUploadInput">
          ⬆ Upload naar Verkoop
          <input id="verkoopUploadInput" type="file" accept=".csv,text/csv" hidden>
        </label>
      </div>
      <p id="verkoopUploadMessage" class="dialog-message" role="status" aria-live="polite"></p>

      <div id="verkoopTiles" class="verkoop-tiles"></div>

      <div id="verkoopChart" class="verkoop-chart"></div>

      <div class="verkoop-filters">
        <label>Periode
          <select id="verkoopPeriodeFilter">
            <option value="alles">Alles</option>
            <option value="vandaag">Vandaag</option>
            <option value="week">Deze week</option>
            <option value="maand">Deze maand</option>
          </select>
        </label>
        <label>Kanaal
          <select id="verkoopKanaalFilter">
            <option value="">Alle kanalen</option>
          </select>
        </label>
        <input id="verkoopZoekInput" type="search" placeholder="Zoek pakketnummer of naam…">
      </div>

      <table class="verkoop-table">
        <thead>
          <tr>
            <th data-sort="pakketnummer">Pakketnummer</th>
            <th data-sort="naam">Naam</th>
            <th data-sort="kanaal">Kanaal</th>
            <th data-sort="aantal" class="verkoop-col-aantal">Aantal</th>
          </tr>
        </thead>
        <tbody id="verkoopTableBody"></tbody>
        <tfoot>
          <tr>
            <td colspan="3">Totaal (huidige filter)</td>
            <td id="verkoopTotaalCel" class="verkoop-col-aantal"></td>
          </tr>
        </tfoot>
      </table>

    </div>
  </dialog>
```

- [ ] **Step 4: Verify the HTML is well-formed**

Run: `node -e "require('fs').readFileSync('webapp/dist/index.html', 'utf8')"` (just confirms the file is readable/saved; there's no HTML linter in this project) and visually re-read the diff for unclosed tags.

- [ ] **Step 5: Commit**

```bash
git add webapp/dist/index.html
git commit -m "$(cat <<'EOF'
feat: add Verkopen 2026-2027 dialog skeleton to index.html

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CSS for the Verkopen dialog

**Files:**
- Modify: `webapp/dist/styles.css`

**Interfaces:**
- Consumes: class/id names from Task 4's HTML.
- Produces: visual styling only — no new interfaces for later tasks.

- [ ] **Step 1: Add the styles**

Append to `webapp/dist/styles.css`:

```css
.verkoop-dialog { width: min(1100px, calc(100% - 24px)); }
.verkoop-dialog .dialog-header { padding: 24px 28px 20px; }
.verkoop-dialog-body { padding: 0 28px 28px; display: flex; flex-direction: column; gap: 16px; }

.verkoop-upload-row { display: flex; align-items: end; gap: 12px; }
.verkoop-upload-datum-field { display: flex; flex-direction: column; gap: 4px; font-size: .8rem; font-weight: 700; color: var(--muted); }
.verkoop-upload-datum-field input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.verkoop-upload-button { cursor: pointer; }

.verkoop-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.verkoop-tile { padding: 14px 16px; border: 1px solid var(--line); border-top: 4px solid var(--brand); border-radius: 12px; background: white; }
.verkoop-tile-label { display: block; margin-bottom: 5px; color: var(--muted); font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
.verkoop-tile-value { display: block; color: var(--brand); font-size: 1.3rem; font-weight: 800; }

.verkoop-chart { display: flex; align-items: flex-end; gap: 4px; height: 90px; padding: 8px 4px 0; border-bottom: 1px solid var(--line); }
.verkoop-chart-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
.verkoop-chart-bar-fill { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--brand); }
.verkoop-chart-bar-label { font-size: .62rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

.verkoop-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.verkoop-filters label { display: flex; flex-direction: column; gap: 4px; font-size: .8rem; font-weight: 700; color: var(--muted); }
.verkoop-filters select, .verkoop-filters input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.verkoop-filters input[type="search"] { min-width: 220px; }

.verkoop-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
.verkoop-table th, .verkoop-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.verkoop-table th { cursor: pointer; user-select: none; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
.verkoop-table .verkoop-col-aantal { text-align: right; }
.verkoop-table tfoot td { border-top: 2px solid var(--ink); border-bottom: 0; font-weight: 800; }

@media (max-width: 720px) {
  .verkoop-tiles { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 2: Verify CSS is syntactically valid**

Run: `node -e "require('fs').readFileSync('webapp/dist/styles.css', 'utf8')"` (readability check only — confirm the file saved correctly; there's no CSS linter in this project). Visually confirm every rule has a matching `{`/`}` pair.

- [ ] **Step 3: Commit**

```bash
git add webapp/dist/styles.css
git commit -m "$(cat <<'EOF'
style: add Verkopen 2026-2027 dialog styling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CSV parsing and channel normalization (`app.js`)

**Files:**
- Modify: `webapp/dist/app.js`

**Interfaces:**
- Consumes: `parseDelimited(text, delimiter=";")` (existing function in `app.js`, returns `string[][]` with the header as row 0).
- Produces: `KANAAL_REGIO` (object, lowercase kanaal → `"EUROPA"` or `"BENELUX"`), `regioVoorKanaal(kanaal) -> string` (`"EUROPA"`/`"BENELUX"`/`"Onbekend"`), `normalizeKanaal(client, shop) -> string`, `parseVerkoopExport(text) -> {ordernummer, kanaal, pakketnummer}[]` (throws `Error` with a Dutch message on missing required columns or an empty file).

- [ ] **Step 1: Add the functions to `app.js`**

Add this block right after the existing `parseDelimited` function (before `readOrders`):

```js
const KANAAL_REGIO = {
  "amazon": "BENELUX",
  "bol.com": "BENELUX",
  "groupon nl": "BENELUX",
  "groupon be": "BENELUX",
  "ibood": "BENELUX",
  "mediahuis": "BENELUX",
  "newreturns": "BENELUX",
  "vakantieveilingen": "BENELUX",
  "pvw": "BENELUX",
  "voordeelvanger": "BENELUX",
  "groupon fr": "EUROPA",
  "groupon de": "EUROPA",
  "groupon it": "EUROPA",
  "groupon es": "EUROPA",
  "limango": "EUROPA",
  "maison privee": "EUROPA",
  "westwing": "EUROPA",
  "outspot": "EUROPA",
  "veepee": "EUROPA",
};

function regioVoorKanaal(kanaal) {
  return KANAAL_REGIO[String(kanaal || "").trim().toLowerCase()] || "Onbekend";
}

// Client=Amazon rows carry the marketplace in Shop ("Amazon.de", "Amazon.es",
// ...) but all count toward one "Amazon" total. Client=GroupON rows instead
// carry the *country code* in Shop ("BE", "NL", ...), which picks the
// per-country channel ("Groupon BE"). Every other client is already a
// distinct channel name as-is.
function normalizeKanaal(client, shop) {
  const trimmedClient = String(client || "").trim();
  const lowerClient = trimmedClient.toLowerCase();
  if (lowerClient === "amazon") return "Amazon";
  if (lowerClient === "groupon") {
    const land = String(shop || "").trim().toUpperCase();
    return land ? `Groupon ${land}` : "Groupon";
  }
  return trimmedClient;
}

function parseVerkoopExport(text) {
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error("Het CSV-bestand is leeg.");
  const header = rows[0].map((value) => value.trim());
  const kolomIndex = {
    ordernummer: header.indexOf("Ordernr. intern"),
    pakketnummer: header.indexOf("Package Number"),
    client: header.indexOf("Client"),
    shop: header.indexOf("Shop"),
  };
  if (kolomIndex.ordernummer < 0 || kolomIndex.pakketnummer < 0 || kolomIndex.client < 0) {
    throw new Error('De kolommen "Ordernr. intern", "Package Number" en "Client" zijn verplicht.');
  }
  const orders = [];
  rows.slice(1).forEach((row) => {
    const ordernummer = (row[kolomIndex.ordernummer] || "").trim();
    const pakketnummer = (row[kolomIndex.pakketnummer] || "").trim();
    if (!ordernummer || !pakketnummer) return;
    const client = row[kolomIndex.client] || "";
    const shop = kolomIndex.shop >= 0 ? row[kolomIndex.shop] || "" : "";
    let kanaal = normalizeKanaal(client, shop);
    if (regioVoorKanaal(kanaal) === "Onbekend") kanaal = `Onbekend: ${kanaal || "?"}`;
    orders.push({ ordernummer, kanaal, pakketnummer });
  });
  return orders;
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check webapp/dist/app.js`
Expected: no output (success).

- [ ] **Step 3: Manual smoke test against the real sample export**

The file `C:\Users\bheijnen\Downloads\Export-2026-09-17_0749.csv` (or wherever today's export lives) is real sample data. Run:

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('webapp/dist/app.js', 'utf8');
eval(src.slice(src.indexOf('function parseDelimited'), src.indexOf('function readOrders')));
const text = fs.readFileSync(process.argv[1], 'utf8');
const orders = parseVerkoopExport(text);
console.log('rows:', orders.length);
const perKanaal = {};
orders.forEach((o) => { perKanaal[o.kanaal] = (perKanaal[o.kanaal] || 0) + 1; });
console.log(perKanaal);
" "C:\Users\bheijnen\Downloads\Export-2026-09-17_0749.csv"
```

Expected: `rows: 63`, and the per-kanaal breakdown shows `Amazon: 10`, `Bol.com: 4`, `Limango: 4`, `VakantieVeilingen: 39`, plus individual `Groupon <land>` entries totalling 6 (matching the 6 raw "GroupON" rows split by country) — no `Onbekend: ...` entries. Adjust the file path if today's actual export lives elsewhere.

- [ ] **Step 4: Commit**

```bash
git add webapp/dist/app.js
git commit -m "$(cat <<'EOF'
feat: parse sales export CSV with Amazon/GroupON channel normalization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Upload wiring (`app.js`)

**Files:**
- Modify: `webapp/dist/app.js`

**Interfaces:**
- Consumes: `parseVerkoopExport` (Task 6); DOM elements from Task 4 (`#verkoopUploadDatum`, `#verkoopUploadInput`, `#verkoopUploadMessage`).
- Produces: `handleVerkoopUpload(file)` (async), wired to `#verkoopUploadInput`'s `change` event. Updates `window.PICKLIST_VERKOOP` in place and calls `renderVerkoopDialog()` (defined in Task 8 — this task calls it but Task 8 must land before this is exercised end-to-end; the function reference is fine to add now since JS resolves it at call time, not at parse time).

- [ ] **Step 1: Add DOM references**

Near the top of `app.js`, alongside the other `document.querySelector(...)` constant declarations (e.g. next to `managePackagesDialog`), add:

```js
const verkoopDialog = document.querySelector("#verkoopDialog");
const verkoopUploadDatum = document.querySelector("#verkoopUploadDatum");
const verkoopUploadInput = document.querySelector("#verkoopUploadInput");
const verkoopUploadMessage = document.querySelector("#verkoopUploadMessage");
```

- [ ] **Step 2: Add the local-today-ISO helper and upload handler**

Add after `parseVerkoopExport` (Task 6):

```js
function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now - offsetMs).toISOString().slice(0, 10);
}

async function handleVerkoopUpload(file) {
  verkoopUploadMessage.textContent = "";
  if (!file || !file.name.toLowerCase().endsWith(".csv")) {
    verkoopUploadMessage.textContent = "Kies een CSV-bestand.";
    return;
  }
  const datum = verkoopUploadDatum.value || todayIso();
  try {
    const orders = parseVerkoopExport(await file.text());
    if (!orders.length) throw new Error("Geen orderregels gevonden in dit bestand.");

    const onbekend = {};
    orders.forEach((order) => {
      if (order.kanaal.startsWith("Onbekend: ")) onbekend[order.kanaal] = (onbekend[order.kanaal] || 0) + 1;
    });

    const response = await fetch("/api/verkoop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datum, rows: orders }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload mislukt.");

    window.PICKLIST_VERKOOP = result.orders;
    renderVerkoopDialog();

    let text = `${result.toegevoegd} orderregels verwerkt, ${result.overgeslagen} overgeslagen (al eerder geüpload).`;
    const onbekendeNamen = Object.keys(onbekend);
    if (onbekendeNamen.length) {
      const detail = onbekendeNamen.map((naam) => `${naam} (${onbekend[naam]}×)`).join(", ");
      text += ` Let op, onbekend kanaal: ${detail}.`;
    }
    verkoopUploadMessage.textContent = text;
  } catch (error) {
    verkoopUploadMessage.textContent = `Kan bestand niet verwerken: ${error.message}`;
  }
}
```

- [ ] **Step 3: Wire the dialog open/close and file input**

Add near the other dialog event listeners at the bottom of `app.js` (alongside `document.querySelector("#managePackagesButton").addEventListener(...)`):

```js
document.querySelector("#openVerkoopButton").addEventListener("click", () => {
  verkoopUploadDatum.value = todayIso();
  renderVerkoopDialog();
  verkoopDialog.showModal();
});
document.querySelector("#closeVerkoopDialog").addEventListener("click", () => verkoopDialog.close());
verkoopUploadInput.addEventListener("change", () => {
  handleVerkoopUpload(verkoopUploadInput.files[0]);
  verkoopUploadInput.value = "";
});
```

- [ ] **Step 4: Verify syntax**

Run: `node --check webapp/dist/app.js`
Expected: no output (success). Note `renderVerkoopDialog` doesn't exist until Task 8 — that's fine, `node --check` only parses syntax, it doesn't execute.

- [ ] **Step 5: Commit**

```bash
git add webapp/dist/app.js
git commit -m "$(cat <<'EOF'
feat: wire Verkopen upload button to POST /api/verkoop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Tiles, weekly chart, filters, and sortable table (`app.js`)

**Files:**
- Modify: `webapp/dist/app.js`

**Interfaces:**
- Consumes: `window.PICKLIST_VERKOOP` (`{ordernummer, datum, kanaal, pakketnummer, aantal}[]`), `window.PICKLIST_PACKAGES` (existing global, for pakketnaam lookup), `regioVoorKanaal` (Task 6), `displayNumber` (existing function), `todayIso` (Task 7). DOM elements from Task 4.
- Produces: `renderVerkoopDialog()` — the single entry point called on dialog open (Task 7) and after every filter/sort change; fully re-renders tiles, chart, kanaal-filter options, and table from current state.

- [ ] **Step 1: Add filter/sort state and helpers**

Add near the other module-level `let` state declarations at the top of `app.js` (e.g. near `let nazendingen = ...`):

```js
let verkoopSort = { kolom: "aantal", richting: "desc" };
```

Add after the Task 6 functions:

```js
function verkoopIsoWeek(datumStr) {
  const date = new Date(`${datumStr}T00:00:00`);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function verkoopPakketnaam(pakketnummer) {
  const info = (window.PICKLIST_PACKAGES || []).find((entry) => entry.pakketnummer === pakketnummer);
  return info ? info.pakketnaam : "—";
}

function verkoopBinnenPeriode(datum, periode) {
  if (periode === "alles") return true;
  const vandaag = todayIso();
  if (periode === "vandaag") return datum === vandaag;
  if (periode === "week") return verkoopIsoWeek(datum) === verkoopIsoWeek(vandaag);
  if (periode === "maand") return datum.slice(0, 7) === vandaag.slice(0, 7);
  return true;
}

function verkoopGefilterdeOrders() {
  const periode = document.querySelector("#verkoopPeriodeFilter").value;
  const kanaal = document.querySelector("#verkoopKanaalFilter").value;
  const zoek = document.querySelector("#verkoopZoekInput").value.trim().toLowerCase();
  return (window.PICKLIST_VERKOOP || []).filter((order) => {
    if (!verkoopBinnenPeriode(order.datum, periode)) return false;
    if (kanaal && order.kanaal !== kanaal) return false;
    if (zoek) {
      const naam = verkoopPakketnaam(order.pakketnummer).toLowerCase();
      if (!order.pakketnummer.toLowerCase().includes(zoek) && !naam.includes(zoek)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 2: Add tile rendering**

```js
function renderVerkoopTiles() {
  const alleOrders = window.PICKLIST_VERKOOP || [];
  const vandaag = todayIso();
  const totaalSeizoen = alleOrders.reduce((sum, o) => sum + o.aantal, 0);
  const totaalVandaag = alleOrders.filter((o) => o.datum === vandaag).reduce((sum, o) => sum + o.aantal, 0);
  const dezeWeekKey = verkoopIsoWeek(vandaag);
  const totaalDezeWeek = alleOrders.filter((o) => verkoopIsoWeek(o.datum) === dezeWeekKey).reduce((sum, o) => sum + o.aantal, 0);
  const europa = alleOrders.filter((o) => regioVoorKanaal(o.kanaal) === "EUROPA").reduce((sum, o) => sum + o.aantal, 0);
  const benelux = alleOrders.filter((o) => regioVoorKanaal(o.kanaal) === "BENELUX").reduce((sum, o) => sum + o.aantal, 0);

  const tegels = [
    ["Totaal seizoen", displayNumber(totaalSeizoen)],
    ["Vandaag", displayNumber(totaalVandaag)],
    ["Deze week", displayNumber(totaalDezeWeek)],
    ["Europa · Benelux", `${displayNumber(europa)} · ${displayNumber(benelux)}`],
  ];
  document.querySelector("#verkoopTiles").innerHTML = tegels
    .map(([label, value]) => `<div class="verkoop-tile"><span class="verkoop-tile-label">${escapeHtml(label)}</span><span class="verkoop-tile-value">${escapeHtml(value)}</span></div>`)
    .join("");
}
```

- [ ] **Step 3: Add the weekly chart**

```js
function renderVerkoopChart(orders) {
  const perWeek = new Map();
  orders.forEach((order) => {
    const week = verkoopIsoWeek(order.datum);
    perWeek.set(week, (perWeek.get(week) || 0) + order.aantal);
  });
  const weken = [...perWeek.keys()].sort().slice(-12);
  const max = Math.max(1, ...weken.map((week) => perWeek.get(week)));
  document.querySelector("#verkoopChart").innerHTML = weken
    .map((week) => {
      const waarde = perWeek.get(week);
      const hoogte = Math.round((waarde / max) * 100);
      const label = week.split("-W")[1];
      return `<div class="verkoop-chart-bar" title="${escapeHtml(week)}: ${displayNumber(waarde)}">
        <div class="verkoop-chart-bar-fill" style="height:${hoogte}%"></div>
        <span class="verkoop-chart-bar-label">wk ${escapeHtml(label)}</span>
      </div>`;
    })
    .join("");
}
```

- [ ] **Step 4: Add the kanaal-filter option list and the sortable table**

```js
function renderVerkoopKanaalOpties() {
  const select = document.querySelector("#verkoopKanaalFilter");
  const huidige = select.value;
  const kanalen = [...new Set((window.PICKLIST_VERKOOP || []).map((o) => o.kanaal))].sort((a, b) => a.localeCompare(b, "nl"));
  select.innerHTML = '<option value="">Alle kanalen</option>' + kanalen.map((kanaal) => `<option value="${escapeHtml(kanaal)}">${escapeHtml(kanaal)}</option>`).join("");
  if (kanalen.includes(huidige)) select.value = huidige;
}

function verkoopAggregeerPerPakketEnKanaal(orders) {
  const groepen = new Map();
  orders.forEach((order) => {
    const key = `${order.pakketnummer}\u0000${order.kanaal}`;
    groepen.set(key, (groepen.get(key) || 0) + order.aantal);
  });
  return [...groepen.entries()].map(([key, aantal]) => {
    const [pakketnummer, kanaal] = key.split("\u0000");
    return { pakketnummer, kanaal, naam: verkoopPakketnaam(pakketnummer), aantal };
  });
}

function renderVerkoopTable(orders) {
  const rijen = verkoopAggregeerPerPakketEnKanaal(orders);
  const { kolom, richting } = verkoopSort;
  rijen.sort((a, b) => {
    const factor = richting === "asc" ? 1 : -1;
    if (kolom === "aantal") return (a.aantal - b.aantal) * factor;
    return String(a[kolom]).localeCompare(String(b[kolom]), "nl") * factor;
  });
  document.querySelector("#verkoopTableBody").innerHTML = rijen
    .map((rij) => `<tr>
      <td>${escapeHtml(rij.pakketnummer)}</td>
      <td>${escapeHtml(rij.naam)}</td>
      <td>${escapeHtml(rij.kanaal)}</td>
      <td class="verkoop-col-aantal">${displayNumber(rij.aantal)}</td>
    </tr>`)
    .join("");
  const totaal = orders.reduce((sum, order) => sum + order.aantal, 0);
  document.querySelector("#verkoopTotaalCel").textContent = displayNumber(totaal);
}

function renderVerkoopDialog() {
  renderVerkoopTiles();
  renderVerkoopKanaalOpties();
  const gefilterd = verkoopGefilterdeOrders();
  renderVerkoopChart(gefilterd);
  renderVerkoopTable(gefilterd);
}
```

- [ ] **Step 5: Wire filter changes and sortable column headers**

Add near the other event-listener wiring at the bottom of `app.js`:

```js
["#verkoopPeriodeFilter", "#verkoopKanaalFilter"].forEach((selector) => {
  document.querySelector(selector).addEventListener("change", renderVerkoopDialog);
});
document.querySelector("#verkoopZoekInput").addEventListener("input", renderVerkoopDialog);
document.querySelectorAll(".verkoop-table th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const kolom = th.dataset.sort;
    verkoopSort = {
      kolom,
      richting: verkoopSort.kolom === kolom && verkoopSort.richting === "desc" ? "asc" : "desc",
    };
    renderVerkoopDialog();
  });
});
```

- [ ] **Step 6: Verify syntax**

Run: `node --check webapp/dist/app.js`
Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add webapp/dist/app.js
git commit -m "$(cat <<'EOF'
feat: render Verkopen tiles, weekly chart, filters and sortable table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual end-to-end browser verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises Tasks 1–8 together.

- [ ] **Step 1: Start the app**

Run: `python webapp_server.py` (from `C:\picklist`) and open the URL it prints (or let it auto-open the browser).

- [ ] **Step 2: Open the dialog on an empty dataset**

Click "Verkopen 2026-2027". Expected: all four tiles show `0`, the chart area is empty, the kanaal filter shows only "Alle kanalen", and the table is empty with a `0` total.

- [ ] **Step 3: Upload the real sample export**

With the date field left on today, click "⬆ Upload naar Verkoop" and pick a real daily export CSV (e.g. `Export-2026-09-17_0749.csv`). Expected: confirmation message reads "63 orderregels verwerkt, 0 overgeslagen (al eerder geüpload)." (every row in this file has both an `Ordernr. intern` and a `Package Number`, so all 63 rows are counted — a file with blank cells on some rows would report fewer), tiles update to show the new totals, the chart shows one bar for the current week, the kanaal filter now lists Amazon/Bol.com/Limango/VakantieVeilingen/Groupon BE/Groupon DE/Groupon ES, and the table lists every pakketnummer/kanaal combination with the right counts (e.g. `9.11` / `VakantieVeilingen` — cross-check a couple of rows against a manual count in the CSV).

- [ ] **Step 4: Re-upload the same file**

Upload the exact same file again. Expected: "0 orderregels verwerkt, 63 overgeslagen (al eerder geüpload)." and none of the tiles/table numbers change — this proves the ordernummer dedupe works end-to-end through the real HTTP round-trip, not just in the unit tests.

- [ ] **Step 5: Exercise filters and sorting**

Switch the periode filter to "Vandaag" and back to "Alles"; type a known pakketnummer (e.g. `9.11`) into the search box and confirm the table narrows to just that pakketnummer's rows and the totaal cell updates; click the "Aantal" column header twice and confirm the sort direction flips.

- [ ] **Step 6: Confirm persistence**

Stop the server (Ctrl+C), restart it, reopen the dialog. Expected: the same totals are still there (proves `verkoop_orders.csv` was actually written to disk and `verkoop_data.js` regenerated on startup).

- [ ] **Step 7: Report the result**

No commit for this task — if any step doesn't match its expectation, go back and fix the relevant task before proceeding to Task 10.

---

## Task 10: One-time historical migration script

**Files:**
- Create: `tools/migrate_verkopen_historie.py`
- Test: `tests/test_migrate_verkopen_historie.py`

**Interfaces:**
- Consumes: `sales.VerkoopOrder`, `sales.load_verkoop_csv`, `sales.merge_new_orders`, `sales.write_verkoop_csv` (Task 1).
- Produces: `read_kanaal_historie(workbook_path) -> list[VerkoopOrder]` (parses every channel worksheet in the given `.xlsm`/`.xlsx`), `migreer(workbook_path, verkoop_csv_path) -> tuple[int, int]` (returns `(toegevoegd, overgeslagen)`), a `main()` CLI entry point.

The channel worksheets share this shape (confirmed against the real workbook during design):
- Cell `B6` holds the channel's display name (e.g. `"Amazon"`, `"Groupon BE"`).
- Row 8, from column D onward, holds pakketnummers (one per column) until the first empty cell.
- From row 9 onward, column A holds a date (or the literal text `"Totaal"`, which ends the data); each non-empty, non-zero cell in that row under a pakketnummer column is a sale.
- Worksheets named `"Verkopen per week"`, `"Verkopen per dag"`, `"Verkopen per pakketnummer"`, or `"CBS periode en land"` are summary sheets, not channels, and must be skipped.

- [ ] **Step 1: Write the failing test**

Create `tests/test_migrate_verkopen_historie.py`:

```python
import datetime

import openpyxl
import pytest

from sales import load_verkoop_csv
from tools.migrate_verkopen_historie import migreer, read_kanaal_historie


def _make_workbook(path):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    amazon = wb.create_sheet("Amazon")
    amazon["B6"] = "Amazon"
    amazon["D8"] = "9.1"
    amazon["E8"] = "70.12"
    amazon["A9"] = datetime.date(2026, 7, 1)
    amazon["D9"] = 5
    amazon["E9"] = 0  # zero cells must not become rows
    amazon["A10"] = "Totaal"

    summary = wb.create_sheet("Verkopen per pakketnummer")
    summary["A1"] = "moet worden overgeslagen"

    wb.save(path)


def test_read_kanaal_historie_skips_summary_sheets_and_zero_cells(tmp_path):
    workbook_path = tmp_path / "historie.xlsm"
    _make_workbook(workbook_path)

    orders = read_kanaal_historie(workbook_path)

    assert len(orders) == 1
    order = orders[0]
    assert order.kanaal == "Amazon"
    assert order.datum == "2026-07-01"
    assert order.pakketnummer == "9.1"
    assert order.aantal == 5.0
    assert order.ordernummer == "migratie-Amazon-2026-07-01-9.1"


def test_migreer_writes_orders_and_is_idempotent(tmp_path):
    workbook_path = tmp_path / "historie.xlsm"
    _make_workbook(workbook_path)
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"

    toegevoegd, overgeslagen = migreer(workbook_path, verkoop_csv_path)
    assert toegevoegd == 1
    assert overgeslagen == 0
    assert len(load_verkoop_csv(verkoop_csv_path)) == 1

    # Running it again must not duplicate rows.
    toegevoegd, overgeslagen = migreer(workbook_path, verkoop_csv_path)
    assert toegevoegd == 0
    assert overgeslagen == 1
    assert len(load_verkoop_csv(verkoop_csv_path)) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_migrate_verkopen_historie.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.migrate_verkopen_historie'`

- [ ] **Step 3: Write `tools/migrate_verkopen_historie.py`**

```python
"""One-time migration: backfill verkoop_orders.csv from the existing
'Totaaloverzicht verkochte pakketten <seizoen>.xlsm' sales-tracking
workbook, so the webapp dashboard starts with the season's real history
instead of an empty slate. Safe to re-run — dedupes on ordernummer.
"""

import datetime
import sys
from pathlib import Path

import openpyxl

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from sales import VerkoopOrder, load_verkoop_csv, merge_new_orders, write_verkoop_csv

VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"

SUMMARY_SHEETS = {
    "verkopen per week",
    "verkopen per dag",
    "verkopen per pakketnummer",
    "cbs periode en land",
}


def _laatste_pakket_kolom(ws):
    kolom = 4  # D
    while ws.cell(row=8, column=kolom).value not in (None, ""):
        kolom += 1
    return kolom - 1


def read_kanaal_historie(workbook_path):
    workbook = openpyxl.load_workbook(workbook_path, data_only=True, keep_vba=True)
    orders = []
    for ws in workbook.worksheets:
        if ws.title.strip().lower() in SUMMARY_SHEETS:
            continue
        kanaal = str(ws["B6"].value or "").strip()
        if not kanaal:
            continue
        laatste_kolom = _laatste_pakket_kolom(ws)
        if laatste_kolom < 4:
            continue
        pakketnummers = {
            kolom: str(ws.cell(row=8, column=kolom).value).strip()
            for kolom in range(4, laatste_kolom + 1)
        }
        rij = 9
        while True:
            datum_waarde = ws.cell(row=rij, column=1).value
            if isinstance(datum_waarde, str) and datum_waarde.strip().lower() == "totaal":
                break
            if not isinstance(datum_waarde, (datetime.date, datetime.datetime)):
                if datum_waarde is None:
                    break
                rij += 1
                continue
            datum = datum_waarde.strftime("%Y-%m-%d")
            for kolom, pakketnummer in pakketnummers.items():
                if not pakketnummer:
                    continue
                waarde = ws.cell(row=rij, column=kolom).value
                if not waarde:
                    continue
                orders.append(
                    VerkoopOrder(
                        ordernummer=f"migratie-{ws.title}-{datum}-{pakketnummer}",
                        datum=datum,
                        kanaal=kanaal,
                        pakketnummer=pakketnummer,
                        aantal=float(waarde),
                    )
                )
            rij += 1
    return orders


def migreer(workbook_path, verkoop_csv_path=VERKOOP_CSV_PATH):
    nieuwe_orders = read_kanaal_historie(workbook_path)
    bestaande_orders = load_verkoop_csv(verkoop_csv_path)
    alle_orders, toegevoegd, overgeslagen = merge_new_orders(bestaande_orders, nieuwe_orders)
    write_verkoop_csv(alle_orders, verkoop_csv_path)
    return toegevoegd, overgeslagen


def main():
    if len(sys.argv) != 2:
        print("Gebruik: python tools/migrate_verkopen_historie.py <pad-naar-totaaloverzicht.xlsm>")
        return 1
    toegevoegd, overgeslagen = migreer(Path(sys.argv[1]))
    print(f"{toegevoegd} historische orders toegevoegd, {overgeslagen} overgeslagen (al aanwezig).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_migrate_verkopen_historie.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/migrate_verkopen_historie.py tests/test_migrate_verkopen_historie.py
git commit -m "$(cat <<'EOF'
feat: add one-time migration script for the existing sales Excel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Run the real migration (manual, on request)**

Once Bas confirms the workbook path, run:

```bash
python tools/migrate_verkopen_historie.py "K:\E-Commerce\Verkopen\Verkopen 2026-2027\Totaaloverzicht verkochte pakketten 2026-2027.xlsm"
```

Then restart the webapp (or call `build_verkoop_data_js()`/hit the Back-up button) so `verkoop_data.js` picks up the migrated rows, and open the "Verkopen 2026-2027" dialog to confirm the season-to-date totals now match the Excel's own `TOTAAL` cell (`9.798` at the time this plan was written).

---

## Full Suite Check

After Task 10, run the entire test suite once more to confirm nothing regressed:

Run: `pytest -q`
Expected: all tests pass, no warnings about missing fixtures.
