import csv


def read_order_export_csv(csv_path):
    aantallen = {}
    with open(csv_path, encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file, delimiter=";")
        for row in reader:
            pakketnummer = row["Package Number"].strip()
            if not pakketnummer:
                continue
            aantallen[pakketnummer] = aantallen.get(pakketnummer, 0) + 1
    return aantallen
