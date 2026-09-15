from datetime import date

import openpyxl
import pytest

from bom import BomEntry, write_bom_csv
from generate_picklist import main


def _make_bron(path):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    ws = workbook.create_sheet("Totaal alles")
    for _ in range(5):
        ws.append([])
    ws.append(["Pakketnummer", "Aantal"])
    ws.append(["1.3", 2])
    ws.append(["99.9", 7])
    workbook.save(path)


def test_main_writes_picklist_and_reports_unknown(tmp_path, capsys):
    base_order_dir = tmp_path / "orders"
    day_folder = base_order_dir / "2026" / "16-09-2026"
    day_folder.mkdir(parents=True)
    _make_bron(day_folder / "Bron.xlsm")

    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)], bom_csv_path)

    output_path = tmp_path / "Picklist.xlsx"

    exit_code = main(
        base_order_dir=base_order_dir,
        bom_csv_path=bom_csv_path,
        output_path=output_path,
        today=date(2026, 9, 16),
    )

    assert exit_code == 0
    assert output_path.exists()
    workbook = openpyxl.load_workbook(output_path)
    assert workbook["KOELING"]["A5"].value == "Parade"
    assert "99.9" in capsys.readouterr().out


def test_main_returns_error_code_when_bron_missing(tmp_path, capsys):
    base_order_dir = tmp_path / "orders"
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([], bom_csv_path)
    output_path = tmp_path / "Picklist.xlsx"

    exit_code = main(
        base_order_dir=base_order_dir,
        bom_csv_path=bom_csv_path,
        output_path=output_path,
        today=date(2026, 9, 16),
    )

    assert exit_code == 1
    assert not output_path.exists()
    assert "FOUT" in capsys.readouterr().out
