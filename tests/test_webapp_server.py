import pytest

from bom import BomEntry, load_bom_csv, write_bom_csv
from packages import PackageInfo, load_package_info_csv, write_package_info_csv
from webapp_server import add_package


def _empty_csvs(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([], bom_csv_path)
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([], package_info_csv_path)
    return bom_csv_path, package_info_csv_path


def test_add_package_appends_components_pokon_and_boxes(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    package, entries = add_package(
        {
            "pakketnummer": "281.1",
            "pakketnaam": "Klimroos rood x3",
            "doosnummers": "14 + 15",
            "pokon": {"naam": "Pokon Rozen", "aantal": 2},
            "components": [
                {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert package == PackageInfo("281.1", "Klimroos rood x3", "ja", "14 + 15")
    assert entries == [
        BomEntry("281.1", "KAS", "Klimroos", "rood", 3.0, "Nieuwe artikelen:", 900),
        BomEntry("281.1", "POKON", "Pokon Rozen", "", 2.0, "Pokon:", 900),
        BomEntry("281.1", "DOZEN", "14", "", 1.0, "", 900),
        BomEntry("281.1", "DOZEN", "15", "", 1.0, "", 901),
    ]
    assert load_bom_csv(bom_csv_path) == entries
    assert load_package_info_csv(package_info_csv_path) == [package]


def test_add_package_without_pokon_or_multiple_boxes(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    package, entries = add_package(
        {
            "pakketnummer": "1.99",
            "pakketnaam": "Losse plant",
            "doosnummers": "9",
            "pokon": None,
            "components": [
                {"gebied": "KOELING", "item": "Losse plant", "soort": "", "aantal_per_pakket": 1}
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert package.pokon == "nee"
    assert entries == [
        BomEntry("1.99", "KOELING", "Losse plant", "", 1.0, "Nieuwe artikelen:", 900),
        BomEntry("1.99", "DOZEN", "9", "", 1.0, "", 900),
    ]


def test_add_package_rejects_duplicate_pakketnummer(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv([], bom_csv_path)
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv(
        [PackageInfo("1.3", "Bestaand", "nee", "1")], package_info_csv_path
    )

    with pytest.raises(ValueError, match="1.3"):
        add_package(
            {
                "pakketnummer": "1.3", "pakketnaam": "X", "doosnummers": "1",
                "pokon": None,
                "components": [{"gebied": "KAS", "item": "X", "soort": "", "aantal_per_pakket": 1}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_missing_required_fields(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError):
        add_package(
            {"pakketnummer": "", "pakketnaam": "X", "doosnummers": "1", "pokon": None, "components": []},
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_non_numeric_aantal_with_dutch_message(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="geldig aantal"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": None,
                "components": [{"gebied": "KAS", "item": "X", "soort": "", "aantal_per_pakket": "abc"}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_component_missing_gebied(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="gebied"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": None,
                "components": [{"item": "X", "soort": "", "aantal_per_pakket": 1}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


import json as _json
import threading as _threading
import urllib.request as _urllib_request
from http.server import ThreadingHTTPServer as _ThreadingHTTPServer

import webapp_server


def test_server_persists_new_package_via_http_post(tmp_path, monkeypatch):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    data_js_path = tmp_path / "data.js"
    monkeypatch.setattr(webapp_server, "BOM_CSV_PATH", bom_csv_path)
    monkeypatch.setattr(webapp_server, "PACKAGE_INFO_CSV_PATH", package_info_csv_path)
    monkeypatch.setattr(webapp_server, "DATA_JS_PATH", data_js_path)

    server = _ThreadingHTTPServer(("127.0.0.1", 0), webapp_server.PicklistRequestHandler)
    port = server.server_address[1]
    thread = _threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = _urllib_request.Request(
            f"http://127.0.0.1:{port}/api/pakketten",
            data=_json.dumps(
                {
                    "pakketnummer": "281.1", "pakketnaam": "Klimroos rood x3",
                    "doosnummers": "14", "pokon": None,
                    "components": [
                        {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}
                    ],
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _urllib_request.urlopen(request, timeout=5) as response:
            body = _json.loads(response.read())
    finally:
        server.shutdown()
        server.server_close()

    assert body["package"]["pakketnummer"] == "281.1"
    assert body["bom"][0]["item"] == "Klimroos"
    assert data_js_path.exists()


def test_server_returns_dutch_error_for_malformed_json_body(tmp_path, monkeypatch):
    import urllib.error as _urllib_error

    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    data_js_path = tmp_path / "data.js"
    monkeypatch.setattr(webapp_server, "BOM_CSV_PATH", bom_csv_path)
    monkeypatch.setattr(webapp_server, "PACKAGE_INFO_CSV_PATH", package_info_csv_path)
    monkeypatch.setattr(webapp_server, "DATA_JS_PATH", data_js_path)

    server = _ThreadingHTTPServer(("127.0.0.1", 0), webapp_server.PicklistRequestHandler)
    port = server.server_address[1]
    thread = _threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = _urllib_request.Request(
            f"http://127.0.0.1:{port}/api/pakketten",
            data=b"not valid json",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            _urllib_request.urlopen(request, timeout=5)
            assert False, "expected an HTTPError for the malformed body"
        except _urllib_error.HTTPError as error:
            assert error.code == 400
            body = _json.loads(error.read())
    finally:
        server.shutdown()
        server.server_close()

    assert body["error"] == "Ongeldige aanvraag: kan de gegevens niet lezen."
