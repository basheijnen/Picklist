import csv
from pathlib import Path

from bom import BomEntry, load_bom_csv, write_bom_csv


def test_write_then_load_round_trip(tmp_path):
    entries = [
        BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0),
        BomEntry("1.32", "KOELING", "Parade", "CL Pink", 3.0),
        BomEntry("2.1", "DOZEN", "9", "", 1.0),
    ]
    csv_path = tmp_path / "bom.csv"

    write_bom_csv(entries, csv_path)
    loaded = load_bom_csv(csv_path)

    assert loaded == entries


def test_write_then_load_round_trip_preserves_groep_and_volgorde(tmp_path):
    entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "Rozen 38CM:", 7)]
    csv_path = tmp_path / "bom.csv"

    write_bom_csv(entries, csv_path)
    loaded = load_bom_csv(csv_path)

    assert loaded == entries


def test_load_bom_csv_defaults_groep_and_volgorde_when_columns_missing(tmp_path):
    # Simulates a maintainer still editing bom.csv in the pre-amendment
    # 5-column format documented in an old README.
    csv_path = tmp_path / "bom.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["pakketnummer", "gebied", "item", "soort", "aantal_per_pakket"])
        writer.writerow(["1.3", "KOELING", "Parade", "CL Pink", "1.0"])

    loaded = load_bom_csv(csv_path)

    assert loaded == [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "", 0)]


def test_load_bom_csv_defaults_groep_and_volgorde_when_values_empty(tmp_path):
    # Simulates the current 7-column format with groep/volgorde present but
    # left blank for a row that doesn't need grouping/ordering.
    csv_path = tmp_path / "bom.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(
            ["pakketnummer", "gebied", "item", "soort", "aantal_per_pakket", "groep", "volgorde"]
        )
        writer.writerow(["1.3", "KOELING", "Parade", "CL Pink", "1.0", "", ""])

    loaded = load_bom_csv(csv_path)

    assert loaded == [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "", 0)]


def test_load_bom_csv_strips_whitespace_from_names(tmp_path):
    # A trailing space in an item name made "op stam " and "op stam" count as
    # two separate lines on the picklist instead of one total.
    path = tmp_path / "bom.csv"
    path.write_text(
        "pakketnummer,gebied,item,soort,aantal_per_pakket,groep,volgorde\n"
        "22.1,KAS,Eucalyptus op stam ,,1.0,Kas diversen: ,293\n",
        encoding="utf-8",
    )

    [entry] = load_bom_csv(path)

    assert entry.item == "Eucalyptus op stam"
    assert entry.groep == "Kas diversen:"
