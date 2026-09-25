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
        prijzen.append(MmpPrijs(str(pakketnummer).strip(), _tekst(artikel), _tekst(ean), float(prijs)))
    wb.close()
    return prijzen


def main(xlsx_path=EXCEL_PATH):
    prijzen = lees_prijzen_uit_excel(xlsx_path)
    write_prijzen(prijzen, PRIJZEN_CSV_PATH)
    print(f"{len(prijzen)} prijzen geschreven naar {PRIJZEN_CSV_PATH}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else EXCEL_PATH)
