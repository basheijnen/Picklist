import csv
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class PackageInfo:
    pakketnummer: str
    pakketnaam: str
    pokon: str
    doosnummers: str


FIELDNAMES = ["pakketnummer", "pakketnaam", "pokon", "doosnummers"]


def write_package_info_csv(entries, path):
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for entry in entries:
            writer.writerow(asdict(entry))


def load_package_info_csv(path):
    path = Path(path)
    entries = []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            entries.append(
                PackageInfo(
                    pakketnummer=row["pakketnummer"],
                    pakketnaam=row["pakketnaam"],
                    pokon=row["pokon"],
                    doosnummers=row["doosnummers"],
                )
            )
    return entries
