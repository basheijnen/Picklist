import json

from bom import BomEntry, write_bom_csv
from packages import PackageInfo, write_package_info_csv
from sales import VerkoopOrder, write_verkoop_csv
from tools.build_webapp_data import build_data_js, build_mmp_data_js, build_verkoop_data_js


def test_build_data_js_writes_bom_and_packages_as_window_globals(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv(
        [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0, "Rozen 38CM:", 7)],
        bom_csv_path,
    )
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv(
        [PackageInfo("1.3", "Klimroos rood", "nee", "14")], package_info_csv_path
    )
    output_path = tmp_path / "data.js"

    counts = build_data_js(bom_csv_path, package_info_csv_path, output_path)

    assert counts == (1, 1)
    text = output_path.read_text(encoding="utf-8")
    bom_json = text.split("window.PICKLIST_BOM = ", 1)[1].split(";\n", 1)[0]
    packages_json = text.split("window.PICKLIST_PACKAGES = ", 1)[1].rstrip(";\n")
    assert json.loads(bom_json) == [
        {
            "pakketnummer": "1.3", "gebied": "KOELING", "item": "Parade",
            "soort": "CL Pink", "aantal_per_pakket": 1.0,
            "groep": "Rozen 38CM:", "volgorde": 7,
        }
    ]
    assert json.loads(packages_json) == [
        {"pakketnummer": "1.3", "pakketnaam": "Klimroos rood", "pokon": "nee", "doosnummers": "14"}
    ]


def test_build_verkoop_data_js_writes_orders_as_window_global(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv(
        [VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0)],
        verkoop_csv_path,
    )
    output_path = tmp_path / "verkoop_data.js"

    count = build_verkoop_data_js(verkoop_csv_path, output_path)

    assert count == 1
    text = output_path.read_text(encoding="utf-8")
    orders_json = text.split("window.PICKLIST_VERKOOP = ", 1)[1].split(";\n", 1)[0]
    assert json.loads(orders_json) == [
        {"ordernummer": "123", "datum": "2026-09-17", "kanaal": "Amazon", "pakketnummer": "9.1", "aantal": 1.0}
    ]


def test_build_verkoop_data_js_with_missing_csv_writes_empty_list(tmp_path):
    count = build_verkoop_data_js(tmp_path / "missing.csv", tmp_path / "verkoop_data.js")

    assert count == 0
    text = (tmp_path / "verkoop_data.js").read_text(encoding="utf-8")
    assert text == "window.PICKLIST_VERKOOP = [];\nwindow.PICKLIST_VERKOOP_GEANNULEERD = [];\n"


def test_build_mmp_data_js_writes_all_sections(tmp_path):
    from mmp import MmpBetaling, MmpPrijs, write_betalingen, write_prijzen
    paths = {
        "prijzen": tmp_path / "mmp_prijzen.csv",
        "betalingen": tmp_path / "mmp_betalingen.csv",
        "correcties": tmp_path / "mmp_correcties.csv",
        "instellingen": tmp_path / "mmp_instellingen.csv",
    }
    write_prijzen([MmpPrijs("1.1", "Roses", "", 29.4)], paths["prijzen"])
    write_betalingen([MmpBetaling("a", "2026-09-26", "x", 100.0)], paths["betalingen"])
    output_path = tmp_path / "mmp_data.js"

    build_mmp_data_js(paths, output_path)

    text = output_path.read_text(encoding="utf-8")
    assert text.startswith("window.PICKLIST_MMP = ")
    data = json.loads(text[len("window.PICKLIST_MMP = "):].rstrip().rstrip(";"))
    assert data["prijzen"] == [{"pakketnummer": "1.1", "artikel": "Roses", "ean": "", "prijs": 29.4, "geldig_vanaf": ""}]
    assert data["betalingen"][0]["bedrag"] == 100.0
    assert data["correcties"] == []
    assert data["instellingen"] == {"startdatum": "2026-09-26", "pokon_toeslag": "6.01"}


def test_build_verkoop_data_js_exposes_cancelled_ordernummers(tmp_path):
    from sales import write_geannuleerd
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([], verkoop_csv_path)
    write_geannuleerd({"9002"}, tmp_path / "verkoop_geannuleerd.csv")
    output_path = tmp_path / "verkoop_data.js"

    build_verkoop_data_js(verkoop_csv_path, output_path)

    text = output_path.read_text(encoding="utf-8")
    assert 'window.PICKLIST_VERKOOP_GEANNULEERD = ["9002"];' in text
