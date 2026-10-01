"""Neem de potmaat per pakket over uit Potmaten.xlsm naar potmaten.csv.

Alleen pakketten zonder potmaat worden aangevuld; een potmaat die al in
potmaten.csv staat wordt nooit overschreven. Afwijkingen tussen de Excel en
potmaten.csv worden alleen gemeld — die pas je zelf aan in potmaten.csv.

Gebruik: python tools/import_potmaten.py [pad-naar-Potmaten.xlsm]
"""

import sys
from pathlib import Path

import openpyxl

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from potmaten import load_potmaten, voeg_potmaten_samen, write_potmaten

EXCEL_PATH = Path(r"K:\E-Commerce\Overzichten\2026-2027\Potmaten.xlsm")
POTMATEN_CSV_PATH = PROJECT_DIR / "potmaten.csv"


def lees_potmaten_excel(path):
    """Eerste tabblad: kolom A = pakketnummer, kolom C = potmaat ("Korte uitleg")."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        potmaten = {}
        for row in wb.worksheets[0].iter_rows(min_row=2, values_only=True):
            pakketnummer = str(row[0]).strip() if row[0] is not None else ""
            potmaat = " ".join(str(row[2]).split()) if len(row) > 2 and row[2] is not None else ""
            if pakketnummer and potmaat:
                potmaten[pakketnummer] = potmaat
        return potmaten
    finally:
        wb.close()


def main(excel_path=EXCEL_PATH, csv_path=POTMATEN_CSV_PATH):
    excel = lees_potmaten_excel(excel_path)
    samengevoegd, toegevoegd, verschillen = voeg_potmaten_samen(load_potmaten(csv_path), excel)
    write_potmaten(samengevoegd, csv_path)
    print(f"{len(excel)} pakketten in {excel_path}; {len(toegevoegd)} potmaten toegevoegd aan {csv_path}.")
    if verschillen:
        print(f"{len(verschillen)} afwijkingen NIET overgenomen (pas zelf aan in potmaten.csv als het moet):")
        for pakketnummer, huidig, nieuw in verschillen:
            print(f"  {pakketnummer}: staat nu op {huidig!r}, Excel zegt {nieuw!r}")


if __name__ == "__main__":
    main(*(Path(arg) for arg in sys.argv[1:2]))
