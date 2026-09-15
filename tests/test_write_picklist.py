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


def test_write_picklist_creates_one_sheet_per_gebied_plus_unknown(tmp_path):
    totals = {
        "KOELING": {("Parade", "CL Pink"): 4.0},
    }
    unknown = {"9.99": 12.0}
    item_order = {
        "KOELING": {("Parade", "CL Pink"): ("Rozen 38CM:", 7)},
    }
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, unknown, output_path, date(2026, 9, 16), item_order)

    workbook = openpyxl.load_workbook(output_path)
    assert workbook.sheetnames == [
        "KOELING",
        "KAS",
        "KAMER",
        "POKON",
        "DOZEN",
        "Onbekende pakketten",
    ]

    ws = workbook["KOELING"]
    assert ws["A1"].value == "E-COMMERCE KOELING PICKLIST"
    assert [ws["A2"].value, ws["B2"].value] == ["Datum:", "16-09-2026"]

    unknown_ws = workbook["Onbekende pakketten"]
    rows = [[c.value for c in row] for row in unknown_ws.iter_rows(min_row=1, max_row=2)]
    assert rows == [
        ["Pakketnummer", "Aantal besteld"],
        ["9.99", 12],
    ]


def test_write_picklist_dozen_sheet_pallets_column_has_two_decimal_format(tmp_path):
    # The real production workbook's DOZEN!B6:B24 ("Aantal pallets") all carry
    # Excel number format '0.00', so e.g. 250/54 prints as "4.63" rather than
    # the raw float "4.629629629629629".
    totals = {"DOZEN": {("2", ""): 250.0}}
    item_order = {"DOZEN": {("2", ""): ("", 0)}}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["DOZEN"]
    # Row 4: header, row 5: "2" data row, row 6: Totaal row.
    assert ws.cell(row=5, column=2).number_format == "0.00"
    assert ws.cell(row=6, column=2).number_format == "0.00"


def test_write_picklist_dozen_sheet_warns_about_unknown_doosnummer(tmp_path, capsys):
    totals = {"DOZEN": {("1", ""): 250.0, ("99", ""): 40.0}}
    item_order = {"DOZEN": {("1", ""): ("", 0), ("99", ""): ("", 16)}}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, {}, output_path, date(2026, 9, 16), item_order)

    ws = openpyxl.load_workbook(output_path)["DOZEN"]
    rows = [[c.value for c in row] for row in ws.iter_rows(min_row=4)]
    assert rows == [
        ["Doosnummer", "Aantal pallets", "Aantal dozen"],
        ["1", 2.5, 250],
        ["99", "?", 40],
        # No phantom 0 contribution from the unknown doosnummer: only the
        # known "1" row's 2.5 pallets count towards the total.
        ["Totaal", 2.5, 290],
    ]

    captured = capsys.readouterr()
    assert "LET OP: onbekend doosnummer '99', aantal pallets niet berekend." in captured.out


def test_write_picklist_warns_about_unknown_gebied(tmp_path, capsys):
    totals = {
        "KOELING": {("Parade", "CL Pink"): 14.0},
        "Koeling": {("Typo", "Fout"): 5.0},
    }
    unknown = {}
    output_path = tmp_path / "Picklist.xlsx"

    write_picklist(totals, unknown, output_path, date(2026, 9, 16), {})

    captured = capsys.readouterr()
    assert "LET OP" in captured.out
    assert "Koeling" in captured.out
