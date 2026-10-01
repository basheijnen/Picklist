"""Koppel Pokon uit de oude administratie aan de echte orders.

In de historie staat Pokon alleen als dagtotaal ("handmatig-Pokon-<kanaal>-<datum>")
en het bijbehorende pakket zit in een dagtotaal "migratie-<kanaal>-<datum>-<pakket>".
Met een order-export van die Pokon-orders (pakketnummer eindigt op "p") wordt elke
order een echte pakketregel plus een gekoppelde "<nr>-pokon"-regel, zodat Verkopen
per pakket de Pokon-soort kan tonen. De totalen per pakket en voor Pokon blijven gelijk.

Regels die wegvallen gaan via verkoop_geannuleerd.csv, anders komen ze bij de
Back-up terug uit de kopie op K: (de samenvoeging daar is een vereniging).

Gebruik: python tools/koppel_pokon_export.py <export.csv>
"""

import csv
import sys
from collections import Counter
from dataclasses import replace
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from sales import (
    VerkoopOrder, load_geannuleerd, load_verkoop_csv, verwijder_geannuleerd, write_geannuleerd, write_verkoop_csv,
)

VERKOOP_CSV_PATH = PROJECT_DIR / "verkoop_orders.csv"
GEANNULEERD_CSV_PATH = PROJECT_DIR / "verkoop_geannuleerd.csv"


def lees_export(path):
    """Order-export (puntkomma's): ordernummer, datum (JJJJ-MM-DD), kanaal, pakketnummer."""
    with Path(path).open("r", newline="", encoding="utf-8-sig") as csv_file:
        rijen = []
        for row in csv.DictReader(csv_file, delimiter=";"):
            dag, maand, jaar = row["Order date"].split(" ")[0].split("-")
            rijen.append({
                "ordernummer": row["Ordernr. intern"].strip(),
                "datum": f"{jaar}-{int(maand):02d}-{int(dag):02d}",
                "kanaal": row["Client"].strip(),
                "pakketnummer": row["Package Number"].strip(),
            })
        return rijen


def koppel_pokon_orders(orders, export, geannuleerd):
    """Geeft (orders, geannuleerd, rapport). Stopt met een ValueError als de
    export niet precies klopt met de historie, zodat er niets half gebeurt.
    """
    actief = [o for o in orders if o.ordernummer not in geannuleerd]
    per_nummer = {o.ordernummer: o for o in actief}
    nieuw = [o for o in export if o["ordernummer"] not in per_nummer]
    rapport = {"gekoppeld": len(nieuw), "al_aanwezig": len(export) - len(nieuw)}
    if not nieuw:
        return orders, set(geannuleerd), rapport

    # Pokon per dag uit de export moet gelijk zijn aan de handmatige Pokon.
    pokon_per_dag = Counter((o["kanaal"], o["datum"]) for o in nieuw)
    for (kanaal, datum), aantal in pokon_per_dag.items():
        handmatig = per_nummer.get(f"handmatig-Pokon-{kanaal}-{datum}")
        if not handmatig or handmatig.aantal != aantal:
            gevonden = handmatig.aantal if handmatig else 0
            raise ValueError(f"Pokon {kanaal} {datum}: export heeft {aantal}, historie {gevonden}.")

    # Het pakket zit in het dagtotaal: dat moet groot genoeg zijn.
    verlaging = Counter((o["kanaal"], o["datum"], o["pakketnummer"].removesuffix("p")) for o in nieuw)
    aangepast = {}
    for (kanaal, datum, pakket), aantal in verlaging.items():
        sleutel = f"migratie-{kanaal}-{datum}-{pakket}"
        dagtotaal = per_nummer.get(sleutel)
        if not dagtotaal or dagtotaal.aantal < aantal:
            raise ValueError(f"Dagtotaal {sleutel} ontbreekt of is te klein voor {aantal} order(s).")
        aangepast[sleutel] = dagtotaal.aantal - aantal

    nieuwe_geannuleerd = set(geannuleerd)
    nieuwe_geannuleerd |= {f"handmatig-Pokon-{kanaal}-{datum}" for kanaal, datum in pokon_per_dag}
    nieuwe_geannuleerd |= {sleutel for sleutel, aantal in aangepast.items() if aantal == 0}
    resultaat = [replace(o, aantal=aangepast[o.ordernummer]) if o.ordernummer in aangepast else o for o in orders]
    for o in nieuw:
        pakket = o["pakketnummer"].removesuffix("p")
        resultaat.append(VerkoopOrder(o["ordernummer"], o["datum"], o["kanaal"], pakket, 1.0))
        resultaat.append(VerkoopOrder(f"{o['ordernummer']}-pokon", o["datum"], o["kanaal"], "Pokon", 1.0))
    # Zoals overal in de app: geannuleerde regels gaan ook echt uit de lijst.
    return verwijder_geannuleerd(resultaat, nieuwe_geannuleerd), nieuwe_geannuleerd, rapport


def main(export_path, verkoop_path=VERKOOP_CSV_PATH, geannuleerd_path=GEANNULEERD_CSV_PATH):
    orders = load_verkoop_csv(verkoop_path)
    geannuleerd = load_geannuleerd(geannuleerd_path)
    resultaat, nieuwe_geannuleerd, rapport = koppel_pokon_orders(orders, lees_export(export_path), geannuleerd)
    write_verkoop_csv(resultaat, verkoop_path)
    write_geannuleerd(nieuwe_geannuleerd, geannuleerd_path)
    print(f"{rapport['gekoppeld']} Pokon-orders gekoppeld, {rapport['al_aanwezig']} stonden er al.")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
