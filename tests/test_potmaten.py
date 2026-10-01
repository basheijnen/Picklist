import json

import openpyxl

from bom import BomEntry, write_bom_csv
from packages import PackageInfo, write_package_info_csv
from potmaten import load_potmaten, voeg_potmaten_samen, write_potmaten
from tools.build_webapp_data import build_data_js
from tools.import_potmaten import lees_potmaten_excel


def test_write_then_load_round_trip(tmp_path):
    csv_path = tmp_path / "potmaten.csv"

    write_potmaten({"2.1": "P9", "1.1": "gerolde kluit"}, csv_path)

    assert load_potmaten(csv_path) == {"1.1": "gerolde kluit", "2.1": "P9"}


def test_load_missing_file_gives_empty_dict(tmp_path):
    assert load_potmaten(tmp_path / "bestaat_niet.csv") == {}


def test_samenvoegen_vult_alleen_lege_potmaten_en_overschrijft_nooit():
    bestaand = {"1.1": "gerolde kluit", "2.1": "P9", "3.1": ""}
    excel = {"1.1": "gerolde kluit", "2.1": "P12", "3.1": "P15", "4.1": "C2"}

    samengevoegd, toegevoegd, verschillen = voeg_potmaten_samen(bestaand, excel)

    assert samengevoegd == {"1.1": "gerolde kluit", "2.1": "P9", "3.1": "P15", "4.1": "C2"}
    assert toegevoegd == ["3.1", "4.1"]
    assert verschillen == [("2.1", "P9", "P12")]


def test_lees_potmaten_excel_neemt_waarden_letterlijk_over_zonder_spaties(tmp_path):
    pad = tmp_path / "Potmaten.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Pakket", "Artikelnaam", "Korte uitleg", "Indeling pakket"])
    ws.append(["2.1", "Mediterrane x 4", "P9  ", "1x Ficus"])
    ws.append([1.1, "Rozen", "gerolde kluit", "6x roos"])
    ws.append(["5.1", "Zonder maat", None, None])
    ws.append([None, None, None, None])
    wb.save(pad)

    assert lees_potmaten_excel(pad) == {"2.1": "P9", "1.1": "gerolde kluit"}


def test_build_data_js_zet_potmaten_als_window_global(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([BomEntry("2.1", "KAS", "Ficus Carica - P9", "", 1.0, "Mediterrane:", 9)], bom_csv_path)
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([PackageInfo("2.1", "Mediterrane x 4", "nee", "1")], package_info_csv_path)
    potmaten_csv_path = tmp_path / "potmaten.csv"
    write_potmaten({"2.1": "P9"}, potmaten_csv_path)
    output_path = tmp_path / "data.js"

    build_data_js(bom_csv_path, package_info_csv_path, output_path, potmaten_csv_path)

    text = output_path.read_text(encoding="utf-8")
    potmaten_json = text.split("window.PICKLIST_POTMATEN = ", 1)[1].split(";\n", 1)[0]
    assert json.loads(potmaten_json) == {"2.1": "P9"}
