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
