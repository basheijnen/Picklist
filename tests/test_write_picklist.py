from datetime import date

import openpyxl

from write_picklist import write_picklist


def test_write_picklist_groups_area_items_by_category_with_subtotal(tmp_path):
    totals = {
        "KOELING": {
            ("Parade", "CL Pink"): 4.0,
            ("Golden Rain", "CL Yellow"): 2.0,
            ("Bambino", "Pink"): 1.0,
        },
    }
    item_order = {
        "KOELING": {
            ("Parade", "CL Pink"): ("Rozen 38CM:", 7),
            ("Golden Rain", "CL Yellow"): ("Rozen 38CM:", 9),
            ("Bambino", "Pink"): ("Mini Stamroos 70CM:", 27),
        },
    }
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["KOELING"]
    rows = [[c.value for c in row] for row in ws.iter_rows(min_row=5)]
    assert rows == [
        ["Rozen 38CM:", None, 6],
        ["Parade", "CL Pink", 4],
        ["Golden Rain", "CL Yellow", 2],
        [None, None, None],
        ["Mini Stamroos 70CM:", None, 1],
        ["Bambino", "Pink", 1],
        [None, None, None],
    ]


def test_write_picklist_dozen_sheet_has_pallet_column_and_total(tmp_path):
    totals = {"DOZEN": {("1", ""): 250.0, ("KB", ""): 48.0}}
    item_order = {"DOZEN": {("1", ""): ("", 0), ("KB", ""): ("", 16)}}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["DOZEN"]
    rows = [[c.value for c in row] for row in ws.iter_rows(min_row=4)]
    assert rows == [
        ["Doosnummer", "Aantal pallets", "Aantal dozen"],
        ["1", 2.5, 250],
        ["KB", 2, 48],
        ["Totaal", 4.5, 298],
    ]
