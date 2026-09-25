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


def write_geannuleerd(ordernummers, path):
    with Path(path).open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["ordernummer"])
        writer.writerows([nr] for nr in sorted(ordernummers))


def load_geannuleerd(path):
    path = Path(path)
    if not path.exists():
        return set()
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        return {row["ordernummer"] for row in csv.DictReader(csv_file) if row["ordernummer"]}


def verwijder_geannuleerd(orders, geannuleerd):
    """Laat orders weg die geannuleerd zijn, inclusief de losse
    `<nr>-pokon`-regel die parseVerkoopExport voor een Pokon-variant maakt.
    """
    return [
        order for order in orders
        if order.ordernummer not in geannuleerd
        and order.ordernummer.removesuffix("-pokon") not in geannuleerd
    ]
