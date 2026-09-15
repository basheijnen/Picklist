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

    try:
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
    except PermissionError:
        print(
            "FOUT: kan Picklist.xlsx niet opslaan — sluit het bestand in "
            "Excel en probeer opnieuw."
        )
        return 1
    except Exception as error:
        print(f"FOUT: {error}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
