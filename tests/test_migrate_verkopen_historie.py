import datetime

import openpyxl
import pytest

from sales import load_verkoop_csv
from tools.migrate_verkopen_historie import migreer, read_kanaal_historie


def _make_workbook(path):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    amazon = wb.create_sheet("Amazon")
    amazon["B6"] = "Amazon"
    amazon["D8"] = "9.1"
    amazon["E8"] = "70.12"
    amazon["A9"] = datetime.date(2026, 7, 1)
    amazon["D9"] = 5
    amazon["E9"] = 0  # zero cells must not become rows
    amazon["A10"] = "Totaal"

    summary = wb.create_sheet("Verkopen per pakketnummer")
    summary["A1"] = "moet worden overgeslagen"

    wb.save(path)


def test_read_kanaal_historie_skips_summary_sheets_and_zero_cells(tmp_path):
    workbook_path = tmp_path / "historie.xlsm"
    _make_workbook(workbook_path)

    orders = read_kanaal_historie(workbook_path)

    assert len(orders) == 1
    order = orders[0]
    assert order.kanaal == "Amazon"
    assert order.datum == "2026-07-01"
    assert order.pakketnummer == "9.1"
    assert order.aantal == 5.0
    assert order.ordernummer == "migratie-Amazon-2026-07-01-9.1"


def test_migreer_writes_orders_and_is_idempotent(tmp_path):
    workbook_path = tmp_path / "historie.xlsm"
    _make_workbook(workbook_path)
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"

    toegevoegd, overgeslagen = migreer(workbook_path, verkoop_csv_path)
    assert toegevoegd == 1
    assert overgeslagen == 0
    assert len(load_verkoop_csv(verkoop_csv_path)) == 1

    # Running it again must not duplicate rows.
    toegevoegd, overgeslagen = migreer(workbook_path, verkoop_csv_path)
    assert toegevoegd == 0
    assert overgeslagen == 1
    assert len(load_verkoop_csv(verkoop_csv_path)) == 1
