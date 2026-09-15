"""Build the browser app's bundled BOM/package data from bom.csv and package_info.csv."""

import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from bom import load_bom_csv
from packages import load_package_info_csv

BOM_CSV_PATH = PROJECT_DIR / "bom.csv"
PACKAGE_INFO_CSV_PATH = PROJECT_DIR / "package_info.csv"
DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "data.js"


def build_data_js(bom_csv_path=BOM_CSV_PATH, package_info_csv_path=PACKAGE_INFO_CSV_PATH,
                   output_path=DATA_JS_PATH):
    entries = [
        {
            "pakketnummer": entry.pakketnummer,
            "gebied": entry.gebied,
            "item": entry.item,
            "soort": entry.soort,
            "aantal_per_pakket": entry.aantal_per_pakket,
            "groep": entry.groep,
            "volgorde": entry.volgorde,
        }
        for entry in load_bom_csv(bom_csv_path)
    ]
    packages = [
        {
            "pakketnummer": entry.pakketnummer,
            "pakketnaam": entry.pakketnaam,
            "pokon": entry.pokon,
            "doosnummers": entry.doosnummers,
        }
        for entry in load_package_info_csv(package_info_csv_path)
    ]
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "window.PICKLIST_BOM = "
        + json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.PICKLIST_PACKAGES = "
        + json.dumps(packages, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    return len(entries), len(packages)


def main():
    bom_count, package_count = build_data_js()
    print(f"{bom_count} BOM-regels en {package_count} pakketten geschreven naar {DATA_JS_PATH}")


if __name__ == "__main__":
    main()
