"""Extract package names, Pokon flags and box numbers from the source workbook."""

import csv
from pathlib import Path

import openpyxl


PROJECT_DIR = Path(__file__).resolve().parent.parent
SOURCE_PATH = PROJECT_DIR / "E-Commerce PICKLIST - IN PROGRESS.xlsm"
OUTPUT_PATH = PROJECT_DIR / "package_info.csv"


def main():
    workbook = openpyxl.load_workbook(SOURCE_PATH, data_only=True, read_only=True)
    worksheet = workbook["1. Invoer pakketaantal"]
    rows = []
    for values in worksheet.iter_rows(min_row=5, values_only=True):
        pakketnummer = values[1]
        if pakketnummer is None:
            continue
        pakketnummer = str(pakketnummer).strip()
        if not pakketnummer or pakketnummer == "TOTAAL PAKKETTEN:":
            continue
        rows.append(
            {
                "pakketnummer": pakketnummer,
                "pakketnaam": str(values[2] or "").strip(),
                "pokon": "ja" if str(values[5] or "").strip().lower() == "pokon" else "nee",
                "doosnummers": str(values[7] or "").strip(),
            }
        )

    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["pakketnummer", "pakketnaam", "pokon", "doosnummers"],
        )
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} pakketten geschreven naar {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
