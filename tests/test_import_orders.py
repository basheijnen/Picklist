from datetime import date

import openpyxl
import pytest

from import_orders import find_bron_file, read_totaal_alles


def test_find_bron_file_builds_dutch_date_path(tmp_path):
    for_date = date(2026, 9, 16)
    day_folder = tmp_path / "2026" / "16-09-2026"
    day_folder.mkdir(parents=True)
    bron_path = day_folder / "Bron.xlsm"
    bron_path.write_bytes(b"")

    result = find_bron_file(tmp_path, for_date)

    assert result == bron_path


def test_find_bron_file_missing_raises_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="16-09-2026"):
        find_bron_file(tmp_path, date(2026, 9, 16))


def test_read_totaal_alles_skips_header_and_totaal_row(tmp_path):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    ws = workbook.create_sheet("Totaal alles")
    ws.append(["TOTAAL VERKOOP PER DAG"])
    ws.append([])
    ws.append([])
    ws.append([])
    ws.append([])
    ws.append(["Pakketnummer", "Aantal"])
    ws.append(["1.1", 0])
    ws.append(["1.1p", 5])
    ws.append(["Totaal", 5])
    path = tmp_path / "Bron.xlsm"
    workbook.save(path)

    aantallen = read_totaal_alles(path)

    assert aantallen == {"1.1": 0, "1.1p": 5}
