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
    groep: str = ""
    volgorde: int = 0


FIELDNAMES = [
    "pakketnummer",
    "gebied",
    "item",
    "soort",
    "aantal_per_pakket",
    "groep",
    "volgorde",
]


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
                    # Names are stripped: a stray trailing space would make
                    # the same item count as two separate picklist lines.
                    pakketnummer=row["pakketnummer"].strip(),
                    gebied=row["gebied"].strip(),
                    item=row["item"].strip(),
                    soort=row["soort"].strip(),
                    aantal_per_pakket=float(row["aantal_per_pakket"]),
                    # groep/volgorde are tolerant of a missing column (an old
                    # 5-column bom.csv row) or an empty value, defaulting the
                    # same way BomEntry itself does, rather than crashing.
                    groep=(row.get("groep") or "").strip(),
                    volgorde=int(row.get("volgorde") or 0),
                )
            )
    return entries
