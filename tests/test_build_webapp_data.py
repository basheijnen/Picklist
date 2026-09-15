import json

from bom import BomEntry, write_bom_csv
from packages import PackageInfo, write_package_info_csv
from tools.build_webapp_data import build_data_js


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
