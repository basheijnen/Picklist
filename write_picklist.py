import openpyxl

GEBIED_ORDER = ["KOELING", "KAS", "KAMER", "POKON", "DOZEN"]

BOXES_PER_PALLET = {
    "1": 100, "2": 54, "3": 54, "4": 27, "5": 34, "6": 16, "7": 70, "8": 60,
    "9": 40, "10": 36, "11": 21, "12": 36, "13": 16, "14": 72, "15": 144,
    "16": 25, "KB": 24, "EUR40": 30,
}


def _display_aantal(aantal):
    return int(aantal) if float(aantal).is_integer() else aantal


def _grouped_by_category(totals_for_gebied, item_order_for_gebied):
    entries = []
    for (item, soort), aantal in totals_for_gebied.items():
        groep, volgorde = item_order_for_gebied.get((item, soort), ("", 0))
        entries.append((volgorde, groep, item, soort, aantal))
    entries.sort(key=lambda e: e[0])

    groups = []
    current_groep = None
    for _volgorde, groep, item, soort, aantal in entries:
        if groep != current_groep:
            groups.append({"groep": groep, "items": []})
            current_groep = groep
        groups[-1]["items"].append((item, soort, aantal))
    return groups


def _write_area_sheet(ws, totals_for_gebied, item_order_for_gebied):
    ws.append(["Item", "Soort", "Aantal"])
    for group in _grouped_by_category(totals_for_gebied, item_order_for_gebied):
        subtotal = sum(aantal for _item, _soort, aantal in group["items"])
        if group["groep"]:
            ws.append([group["groep"], None, _display_aantal(subtotal)])
        for item, soort, aantal in group["items"]:
            ws.append([item, soort, _display_aantal(aantal)])
        # openpyxl drops a genuinely empty trailing row on save/reload (only
        # cells with an actual value survive serialization), so write empty
        # strings rather than nothing — they round-trip back as None and
        # still render as a blank separator row in Excel.
        ws.append(["", "", ""])


def _write_dozen_sheet(ws, totals_for_gebied, item_order_for_gebied):
    ws.append(["Doosnummer", "Aantal pallets", "Aantal dozen"])
    rows = sorted(
        totals_for_gebied.items(),
        key=lambda kv: item_order_for_gebied.get(kv[0], ("", 0))[1],
    )
    total_pallets = 0.0
    total_dozen = 0.0
    warned_doosnummers = set()
    for (item, _soort), aantal in rows:
        divisor = BOXES_PER_PALLET.get(item)
        total_dozen += aantal
        if divisor:
            pallets = aantal / divisor
            total_pallets += pallets
            ws.append([item, _display_aantal(pallets), _display_aantal(aantal)])
            ws.cell(row=ws.max_row, column=2).number_format = "0.00"
        else:
            # Unknown doosnummer: the dozen count is still accurate and known,
            # so keep the row, but don't guess a pallet count — "?" makes the
            # gap visually obvious instead of a silently-wrong 0, and it's
            # excluded from total_pallets so the total doesn't look complete.
            if item not in warned_doosnummers:
                print(
                    f"LET OP: onbekend doosnummer '{item}', aantal pallets niet berekend."
                )
                warned_doosnummers.add(item)
            ws.append([item, "?", _display_aantal(aantal)])
    ws.append(["Totaal", _display_aantal(total_pallets), _display_aantal(total_dozen)])
    ws.cell(row=ws.max_row, column=2).number_format = "0.00"


def write_picklist(totals, unknown, output_path, for_date, item_order):
    onbekend_gebieden = set(totals) - set(GEBIED_ORDER)
    if onbekend_gebieden:
        print(
            f"LET OP: onbekend gebied in BOM: {sorted(onbekend_gebieden)}, "
            "dit wordt niet in de picklist opgenomen."
        )

    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)

    for gebied in GEBIED_ORDER:
        ws = workbook.create_sheet(gebied)
        ws.append([f"E-COMMERCE {gebied} PICKLIST"])
        ws.append(["Datum:", for_date.strftime("%d-%m-%Y")])
        ws.append([])
        totals_for_gebied = totals.get(gebied, {})
        item_order_for_gebied = item_order.get(gebied, {})
        if gebied == "DOZEN":
            _write_dozen_sheet(ws, totals_for_gebied, item_order_for_gebied)
        else:
            _write_area_sheet(ws, totals_for_gebied, item_order_for_gebied)

    unknown_ws = workbook.create_sheet("Onbekende pakketten")
    unknown_ws.append(["Pakketnummer", "Aantal besteld"])
    for pakketnummer, aantal in sorted(unknown.items()):
        unknown_ws.append([pakketnummer, _display_aantal(aantal)])

    workbook.save(output_path)
