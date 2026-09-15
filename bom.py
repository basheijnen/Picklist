import csv
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class BomEntry:
    pakketnummer: str
    gebied: str
    item: str
    soort: str
    aantal_per_pakket: float


FIELDNAMES = ["pakketnummer", "gebied", "item", "soort", "aantal_per_pakket"]


def write_bom_csv(entries, path):
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for entry in entries:
            writer.writerow(asdict(entry))


def load_bom_csv(path):
    path = Path(path)
    entries = []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            entries.append(
                BomEntry(
                    pakketnummer=row["pakketnummer"],
                    gebied=row["gebied"],
                    item=row["item"],
                    soort=row["soort"],
                    aantal_per_pakket=float(row["aantal_per_pakket"]),
                )
            )
    return entries
