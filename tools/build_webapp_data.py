"""Build the browser app's bundled BOM/package data from bom.csv and package_info.csv."""

import json
import sys
from dataclasses import asdict
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from bom import load_bom_csv
from mmp import load_betalingen, load_correcties, load_instellingen, load_prijzen
from packages import load_package_info_csv
from sales import load_verkoop_csv

BOM_CSV_PATH = PROJECT_DIR / "bom.csv"
PACKAGE_INFO_CSV_PATH = PROJECT_DIR / "package_info.csv"
DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "data.js"
VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"
VERKOOP_DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "verkoop_data.js"
MMP_DATA_JS_PATH = PROJECT_DIR / "webapp" / "dist" / "mmp_data.js"
MMP_PATHS = {naam: PROJECT_DIR / f"mmp_{naam}.csv" for naam in ("prijzen", "betalingen", "correcties", "instellingen")}


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


def main():
    bom_count, package_count = build_data_js()
    verkoop_count = build_verkoop_data_js()
    build_mmp_data_js()
    print(f"{bom_count} BOM-regels en {package_count} pakketten geschreven naar {DATA_JS_PATH}")
    print(f"{verkoop_count} verkooporders geschreven naar {VERKOOP_DATA_JS_PATH}")
    print(f"Maison Privée-gegevens geschreven naar {MMP_DATA_JS_PATH}")


if __name__ == "__main__":
    main()
