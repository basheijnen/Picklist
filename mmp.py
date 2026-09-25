"""Opslag van de Ma Maison Privée-vooruitbetaling: prijzen, betalingen,
correcties en instellingen, elk in een eigen CSV naast bom.csv. De
parse_*-functies valideren wat de browser stuurt voordat er iets wordt
weggeschreven.
"""

import csv
import math
import re
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path

DATUM_PATROON = re.compile(r"\d{4}-\d{2}-\d{2}")
STANDAARD_INSTELLINGEN = {"startdatum": "2026-09-26", "pokon_toeslag": "6.01"}


@dataclass(frozen=True)
class MmpPrijs:
    pakketnummer: str
    artikel: str
    ean: str
    prijs: float
    # Leeg = geldt altijd (de startprijs); anders geldt deze prijs voor orders
    # vanaf deze datum, tot een regel met een latere datum het overneemt.
    geldig_vanaf: str = ""


@dataclass(frozen=True)
class MmpBetaling:
    id: str
    datum: str
    omschrijving: str
    bedrag: float


@dataclass(frozen=True)
class MmpCorrectie:
    ordernummer: str
    reden: str


PRIJZEN_FIELDNAMES = ["pakketnummer", "artikel", "ean", "prijs", "geldig_vanaf"]
BETALINGEN_FIELDNAMES = ["id", "datum", "omschrijving", "bedrag"]
CORRECTIES_FIELDNAMES = ["ordernummer", "reden"]
INSTELLINGEN_FIELDNAMES = ["sleutel", "waarde"]


def _write(rows, fieldnames, path):
    with Path(path).open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read(path):
    path = Path(path)
    if not path.exists():
        return []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        return list(csv.DictReader(csv_file))


def write_prijzen(prijzen, path):
    _write([asdict(p) for p in prijzen], PRIJZEN_FIELDNAMES, path)


def load_prijzen(path):
    return [
        MmpPrijs(r["pakketnummer"], r["artikel"], r["ean"], float(r["prijs"]), r.get("geldig_vanaf") or "")
        for r in _read(path)
    ]


def write_betalingen(betalingen, path):
    _write([asdict(b) for b in betalingen], BETALINGEN_FIELDNAMES, path)


def load_betalingen(path):
    return [MmpBetaling(r["id"], r["datum"], r["omschrijving"], float(r["bedrag"])) for r in _read(path)]


def write_correcties(correcties, path):
    _write([asdict(c) for c in correcties], CORRECTIES_FIELDNAMES, path)


def load_correcties(path):
    return [MmpCorrectie(r["ordernummer"], r["reden"]) for r in _read(path)]


def write_instellingen(instellingen, path):
    _write([{"sleutel": k, "waarde": v} for k, v in instellingen.items()], INSTELLINGEN_FIELDNAMES, path)


def load_instellingen(path):
    instellingen = dict(STANDAARD_INSTELLINGEN)
    instellingen.update({r["sleutel"]: r["waarde"] for r in _read(path)})
    return instellingen


def _getal(value, melding):
    try:
        getal = float(str(value).strip().replace(",", "."))
    except ValueError:
        raise ValueError(melding) from None
    if not math.isfinite(getal):
        raise ValueError(melding)
    return getal


def _datum(value, melding):
    datum = str(value or "").strip()
    if not DATUM_PATROON.fullmatch(datum):
        raise ValueError(melding)
    return datum


def _rijen(rows):
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise ValueError("Ongeldige aanvraag.")
    return rows


def parse_prijzen(rows):
    prijzen, gezien = [], set()
    for row in _rijen(rows):
        pakketnummer = str(row.get("pakketnummer", "")).strip()
        if not pakketnummer:
            raise ValueError("Elke prijsregel moet een pakketnummer hebben.")
        geldig_vanaf = str(row.get("geldig_vanaf") or "").strip()
        if geldig_vanaf:
            geldig_vanaf = _datum(geldig_vanaf, f"Geldig vanaf van pakket {pakketnummer} moet het formaat JJJJ-MM-DD hebben.")
        if (pakketnummer, geldig_vanaf) in gezien:
            raise ValueError(f"Pakketnummer {pakketnummer} staat dubbel in de prijslijst.")
        gezien.add((pakketnummer, geldig_vanaf))
        prijs = _getal(row.get("prijs", ""), f"Prijs van pakket {pakketnummer} is geen geldig getal.")
        if prijs < 0:
            raise ValueError(f"Prijs van pakket {pakketnummer} mag niet negatief zijn.")
        prijzen.append(MmpPrijs(pakketnummer, str(row.get("artikel", "")).strip(),
                                str(row.get("ean", "")).strip(), prijs, geldig_vanaf))
    return prijzen


def parse_betalingen(rows):
    betalingen = []
    for row in _rijen(rows):
        datum = _datum(row.get("datum"), "Elke betaling moet een datum (JJJJ-MM-DD) hebben.")
        bedrag = _getal(row.get("bedrag", ""), "Elke betaling moet een geldig bedrag hebben.")
        betaling_id = str(row.get("id", "")).strip() or uuid.uuid4().hex[:12]
        betalingen.append(MmpBetaling(betaling_id, datum, str(row.get("omschrijving", "")).strip(), bedrag))
    return betalingen


def parse_correcties(rows):
    correcties = []
    for row in _rijen(rows):
        ordernummer = str(row.get("ordernummer", "")).strip()
        if not ordernummer:
            raise ValueError("Elke correctie moet een ordernummer hebben.")
        correcties.append(MmpCorrectie(ordernummer, str(row.get("reden", "")).strip()))
    return correcties


def parse_instellingen(instellingen):
    if not isinstance(instellingen, dict):
        raise ValueError("Ongeldige aanvraag.")
    startdatum = _datum(instellingen.get("startdatum"), "Startdatum moet het formaat JJJJ-MM-DD hebben.")
    toeslag = _getal(instellingen.get("pokon_toeslag", ""), "Pokon-toeslag moet een geldig bedrag zijn.")
    return {"startdatum": startdatum, "pokon_toeslag": f"{toeslag:g}"}
