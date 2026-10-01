import csv
from pathlib import Path

FIELDNAMES = ["pakketnummer", "potmaat"]


def _sorteer_sleutel(pakketnummer):
    # Numeriek sorteren waar dat kan ("1.2" vóór "1.10"), letters (T001) achteraan.
    delen = []
    for deel in pakketnummer.replace("p", ".p").split("."):
        delen.append((0, int(deel), "") if deel.isdigit() else (1, 0, deel))
    return delen


def write_potmaten(potmaten, path):
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for pakketnummer in sorted(potmaten, key=_sorteer_sleutel):
            writer.writerow({"pakketnummer": pakketnummer, "potmaat": potmaten[pakketnummer]})


def load_potmaten(path):
    path = Path(path)
    if not path.exists():
        return {}
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        return {row["pakketnummer"]: row["potmaat"] for row in csv.DictReader(csv_file)}


def voeg_potmaten_samen(bestaand, excel):
    """Vult alleen pakketten aan die nog geen potmaat hebben. Een potmaat die
    al is vastgelegd wordt nooit automatisch gewijzigd: wijkt de Excel af,
    dan komt dat in `verschillen` zodat het met de hand beslist kan worden.
    """
    samengevoegd = dict(bestaand)
    toegevoegd = []
    verschillen = []
    for pakketnummer, potmaat in excel.items():
        huidig = bestaand.get(pakketnummer, "")
        if not huidig:
            samengevoegd[pakketnummer] = potmaat
            toegevoegd.append(pakketnummer)
        elif huidig != potmaat:
            verschillen.append((pakketnummer, huidig, potmaat))
    return samengevoegd, toegevoegd, verschillen
