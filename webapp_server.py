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
from dataclasses import asdict
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


def add_package(payload, bom_csv_path=BOM_CSV_PATH, package_info_csv_path=PACKAGE_INFO_CSV_PATH):
    pakketnummer = str(payload.get("pakketnummer", "")).strip()
    pakketnaam = str(payload.get("pakketnaam", "")).strip()
    doosnummers = str(payload.get("doosnummers", "")).strip()
    components = payload.get("components") or []
    pokon = payload.get("pokon")

    if not pakketnummer or not pakketnaam or not doosnummers or not components:
        raise ValueError("Vul pakketnummer, pakketnaam, doosnummer(s) en minstens één artikelregel in.")
    for component in components:
        if not str(component.get("item", "")).strip() or not (float(component.get("aantal_per_pakket", 0)) > 0):
            raise ValueError("Elke artikelregel moet een naam en een geldig aantal hebben.")

    packages = load_package_info_csv(package_info_csv_path)
    if any(existing.pakketnummer == pakketnummer for existing in packages):
        raise ValueError(f"Pakketnummer {pakketnummer} bestaat al.")

    new_entries = [
        BomEntry(
            pakketnummer=pakketnummer,
            gebied=component["gebied"],
            item=str(component["item"]).strip(),
            soort=str(component.get("soort", "")).strip(),
            aantal_per_pakket=float(component["aantal_per_pakket"]),
            groep=NEW_ITEMS_GROEP,
            volgorde=NEW_ITEMS_BASE_VOLGORDE + index,
        )
        for index, component in enumerate(components)
    ]
    if pokon:
        new_entries.append(
            BomEntry(
                pakketnummer=pakketnummer,
                gebied="POKON",
                item=str(pokon["naam"]),
                soort="",
                aantal_per_pakket=float(pokon.get("aantal", 1)),
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

    bom_entries = load_bom_csv(bom_csv_path)
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
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            package, entries = add_package(payload, BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH)
            build_data_js(BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH, DATA_JS_PATH)
            self._send_json(200, {"package": asdict(package), "bom": [asdict(entry) for entry in entries]})
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            # A local single-user tool: surface any unexpected failure (e.g. a
            # locked CSV file) as a readable message in the browser instead of
            # a bare connection reset.
            self._send_json(500, {"error": str(error)})

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
    build_data_js(BOM_CSV_PATH, PACKAGE_INFO_CSV_PATH, DATA_JS_PATH)
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
