import pytest

from bom import BomEntry, load_bom_csv, write_bom_csv
from packages import PackageInfo, load_package_info_csv, write_package_info_csv
from sales import VerkoopOrder, load_geannuleerd, load_verkoop_csv, write_geannuleerd, write_verkoop_csv
from webapp_server import add_package, add_verkoop_orders, update_package


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


def test_add_package_inserts_into_an_existing_groep_and_shifts_later_items(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv(
        [
            BomEntry("100.5", "KAS", "Olijfboom struik", "", 1.0, "Mediterrane:", 18),
            BomEntry("100.3", "KAS", "Olijfboom op stam", "", 1.0, "Mediterrane:", 19),
            BomEntry("161.0", "KAS", "Olea europaea", "", 1.0, "Mediterrane:", 20),
            BomEntry("150.1", "KAS", "Chamaerops humilis", "", 1.0, "Tropische planten:", 24),
        ],
        bom_csv_path,
    )
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([], package_info_csv_path)

    package, entries = add_package(
        {
            "pakketnummer": "500.1",
            "pakketnaam": "Olijfboom P9",
            "doosnummers": "9",
            "pokon": None,
            "components": [
                {
                    "gebied": "KAS", "item": "Olijfboom P9", "soort": "",
                    "aantal_per_pakket": 1, "groep": "Mediterrane:",
                }
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert entries[0] == BomEntry("500.1", "KAS", "Olijfboom P9", "", 1.0, "Mediterrane:", 21)
    reloaded = {(entry.pakketnummer, entry.gebied): entry for entry in load_bom_csv(bom_csv_path)}
    assert reloaded[("100.5", "KAS")].volgorde == 18
    assert reloaded[("100.3", "KAS")].volgorde == 19
    assert reloaded[("161.0", "KAS")].volgorde == 20
    assert reloaded[("500.1", "KAS")].volgorde == 21
    assert reloaded[("150.1", "KAS")].volgorde == 25


def test_add_package_falls_back_to_nieuwe_artikelen_for_unknown_groep(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv(
        [BomEntry("100.5", "KAS", "Olijfboom struik", "", 1.0, "Mediterrane:", 18)],
        bom_csv_path,
    )
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([], package_info_csv_path)

    package, entries = add_package(
        {
            "pakketnummer": "500.2",
            "pakketnaam": "Iets nieuws",
            "doosnummers": "9",
            "pokon": None,
            "components": [
                {
                    "gebied": "KAS", "item": "Iets nieuws", "soort": "",
                    "aantal_per_pakket": 1, "groep": "Categorie die niet bestaat:",
                }
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert entries == [
        BomEntry("500.2", "KAS", "Iets nieuws", "", 1.0, "Nieuwe artikelen:", 900),
        BomEntry("500.2", "DOZEN", "9", "", 1.0, "", 900),
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


def test_add_package_rejects_pakketnummer_present_only_in_bom_csv(tmp_path):
    # Simulates a partial write left behind by a failed retry: bom.csv was
    # already written for this pakketnummer but package_info.csv write
    # failed (e.g. the file was locked open in Excel), so package_info.csv
    # still has no record of it. A naive retry that only checks
    # package_info.csv would pass the duplicate check and append the BOM
    # rows a second time, silently doubling that package's quantities.
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv(
        [BomEntry("281.1", "KAS", "Klimroos", "rood", 3.0, "Nieuwe artikelen:", 900)],
        bom_csv_path,
    )
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([], package_info_csv_path)

    with pytest.raises(ValueError, match="281.1"):
        add_package(
            {
                "pakketnummer": "281.1", "pakketnaam": "Klimroos rood x3",
                "doosnummers": "14", "pokon": None,
                "components": [
                    {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}
                ],
            },
            bom_csv_path,
            package_info_csv_path,
        )

    # And bom.csv must remain untouched — no doubled rows.
    assert load_bom_csv(bom_csv_path) == [
        BomEntry("281.1", "KAS", "Klimroos", "rood", 3.0, "Nieuwe artikelen:", 900)
    ]


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


def test_add_package_rejects_unknown_gebied(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="gebied"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": None,
                "components": [{"gebied": "TYPO", "item": "X", "soort": "", "aantal_per_pakket": 1}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_non_dict_payload(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError):
        add_package([], bom_csv_path, package_info_csv_path)


def test_add_package_rejects_non_dict_component(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="gebied"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": None,
                "components": ["not-a-dict"],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_non_dict_pokon(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="Pokon"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": "Pokon Rozen",
                "components": [{"gebied": "KAS", "item": "X", "soort": "", "aantal_per_pakket": 1}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_add_package_rejects_pokon_missing_naam(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="Pokon"):
        add_package(
            {
                "pakketnummer": "1.1", "pakketnaam": "X", "doosnummers": "1",
                "pokon": {"aantal": 2},
                "components": [{"gebied": "KAS", "item": "X", "soort": "", "aantal_per_pakket": 1}],
            },
            bom_csv_path,
            package_info_csv_path,
        )


def test_update_package_replaces_components_pokon_and_boxes(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    add_package(
        {
            "pakketnummer": "281.1",
            "pakketnaam": "Klimroos rood x3",
            "doosnummers": "14",
            "pokon": None,
            "components": [
                {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    package, entries = update_package(
        "281.1",
        {
            "pakketnaam": "Klimroos rood x5",
            "doosnummers": "14 + 15",
            "pokon": {"naam": "Pokon Rozen", "aantal": 1},
            "components": [
                {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 5}
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert package == PackageInfo("281.1", "Klimroos rood x5", "ja", "14 + 15")
    assert entries == [
        BomEntry("281.1", "KAS", "Klimroos", "rood", 5.0, "Nieuwe artikelen:", 900),
        BomEntry("281.1", "POKON", "Pokon Rozen", "", 1.0, "Pokon:", 900),
        BomEntry("281.1", "DOZEN", "14", "", 1.0, "", 900),
        BomEntry("281.1", "DOZEN", "15", "", 1.0, "", 901),
    ]
    reloaded_bom = load_bom_csv(bom_csv_path)
    assert reloaded_bom == entries  # the old rows for 281.1 are gone, replaced, not duplicated
    assert load_package_info_csv(package_info_csv_path) == [package]


def test_update_package_reinserts_into_an_existing_groep(tmp_path):
    bom_csv_path = tmp_path / "bom.csv"
    write_bom_csv(
        [
            BomEntry("100.5", "KAS", "Olijfboom struik", "", 1.0, "Mediterrane:", 18),
            BomEntry("500.1", "KAS", "Olijfboom P9 (oud)", "", 1.0, "Nieuwe artikelen:", 900),
        ],
        bom_csv_path,
    )
    package_info_csv_path = tmp_path / "package_info.csv"
    write_package_info_csv([PackageInfo("500.1", "Olijfboom P9", "nee", "9")], package_info_csv_path)

    package, entries = update_package(
        "500.1",
        {
            "pakketnaam": "Olijfboom P9",
            "doosnummers": "9",
            "pokon": None,
            "components": [
                {
                    "gebied": "KAS", "item": "Olijfboom P9", "soort": "",
                    "aantal_per_pakket": 1, "groep": "Mediterrane:",
                }
            ],
        },
        bom_csv_path,
        package_info_csv_path,
    )

    assert entries[0] == BomEntry("500.1", "KAS", "Olijfboom P9", "", 1.0, "Mediterrane:", 19)
    reloaded = load_bom_csv(bom_csv_path)
    # 100.5 (untouched) + the 2 freshly rebuilt rows for 500.1 (KAS + DOZEN) — the
    # stale "500.1 ... Nieuwe artikelen:" row is gone, not left behind as a duplicate.
    assert len(reloaded) == 3
    assert reloaded[1] == BomEntry("500.1", "KAS", "Olijfboom P9", "", 1.0, "Mediterrane:", 19)


def test_update_package_rejects_unknown_pakketnummer(tmp_path):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)

    with pytest.raises(ValueError, match="1.1"):
        update_package(
            "1.1",
            {
                "pakketnaam": "X", "doosnummers": "1", "pokon": None,
                "components": [{"gebied": "KAS", "item": "X", "soort": "", "aantal_per_pakket": 1}],
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


def test_server_updates_existing_package_via_http_put(tmp_path, monkeypatch):
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    add_package(
        {
            "pakketnummer": "281.1", "pakketnaam": "Klimroos rood x3", "doosnummers": "14",
            "pokon": None,
            "components": [{"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}],
        },
        bom_csv_path,
        package_info_csv_path,
    )
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
            f"http://127.0.0.1:{port}/api/pakketten/281.1",
            data=_json.dumps(
                {
                    "pakketnaam": "Klimroos rood x5", "doosnummers": "14",
                    "pokon": None,
                    "components": [
                        {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 5}
                    ],
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with _urllib_request.urlopen(request, timeout=5) as response:
            body = _json.loads(response.read())
    finally:
        server.shutdown()
        server.server_close()

    assert body["package"]["pakketnaam"] == "Klimroos rood x5"
    assert body["bom"][0]["aantal_per_pakket"] == 5.0
    assert len(load_bom_csv(bom_csv_path)) == 2  # replaced (KAS + DOZEN row), not duplicated


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


def test_server_returns_dutch_400_for_non_dict_json_body(tmp_path, monkeypatch):
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
        # A JSON array is valid JSON but not the object shape add_package
        # expects; it must be rejected with a clean Dutch 400, not a raw
        # AttributeError from calling .get() on a list.
        request = _urllib_request.Request(
            f"http://127.0.0.1:{port}/api/pakketten",
            data=b"[]",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            _urllib_request.urlopen(request, timeout=5)
            assert False, "expected an HTTPError for the non-dict body"
        except _urllib_error.HTTPError as error:
            assert error.code == 400
            body = _json.loads(error.read())
    finally:
        server.shutdown()
        server.server_close()

    assert body["error"] == "Ongeldige aanvraag."


def test_server_wraps_unexpected_500_error_in_dutch_text(tmp_path, monkeypatch):
    import urllib.error as _urllib_error

    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    data_js_path = tmp_path / "data.js"
    monkeypatch.setattr(webapp_server, "BOM_CSV_PATH", bom_csv_path)
    monkeypatch.setattr(webapp_server, "PACKAGE_INFO_CSV_PATH", package_info_csv_path)
    monkeypatch.setattr(webapp_server, "DATA_JS_PATH", data_js_path)

    def _boom(*args, **kwargs):
        raise RuntimeError("disk on fire")

    # Simulates an unexpected failure that isn't a ValueError (e.g. a locked
    # CSV file raising PermissionError) reaching the catch-all handler.
    monkeypatch.setattr(webapp_server, "build_data_js", _boom)

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
        try:
            _urllib_request.urlopen(request, timeout=5)
            assert False, "expected an HTTPError for the unexpected failure"
        except _urllib_error.HTTPError as error:
            assert error.code == 500
            body = _json.loads(error.read())
    finally:
        server.shutdown()
        server.server_close()

    # Dutch framing must wrap the raw (possibly English) exception text.
    assert body["error"].startswith("Onverwachte fout bij opslaan:")
    assert "disk on fire" in body["error"]


def test_server_serializes_concurrent_posts_for_same_pakketnummer(tmp_path, monkeypatch):
    # Regression test for the double-click race: two requests for the same
    # new pakketnummer arriving at (almost) the same instant must not both
    # pass the duplicate check and both append BOM rows. With the write
    # lock held across the read-modify-write, exactly one must succeed and
    # the other must be rejected as a duplicate.
    bom_csv_path, package_info_csv_path = _empty_csvs(tmp_path)
    data_js_path = tmp_path / "data.js"
    monkeypatch.setattr(webapp_server, "BOM_CSV_PATH", bom_csv_path)
    monkeypatch.setattr(webapp_server, "PACKAGE_INFO_CSV_PATH", package_info_csv_path)
    monkeypatch.setattr(webapp_server, "DATA_JS_PATH", data_js_path)

    server = _ThreadingHTTPServer(("127.0.0.1", 0), webapp_server.PicklistRequestHandler)
    port = server.server_address[1]
    thread = _threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    payload = _json.dumps(
        {
            "pakketnummer": "281.1", "pakketnaam": "Klimroos rood x3",
            "doosnummers": "14", "pokon": None,
            "components": [
                {"gebied": "KAS", "item": "Klimroos", "soort": "rood", "aantal_per_pakket": 3}
            ],
        }
    ).encode("utf-8")

    barrier = _threading.Barrier(2)
    statuses = []
    statuses_lock = _threading.Lock()

    def _post():
        barrier.wait(timeout=5)
        request = _urllib_request.Request(
            f"http://127.0.0.1:{port}/api/pakketten",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with _urllib_request.urlopen(request, timeout=5) as response:
                status = response.status
        except Exception as error:
            status = getattr(error, "code", None)
        with statuses_lock:
            statuses.append(status)

    try:
        workers = [_threading.Thread(target=_post) for _ in range(2)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)
    finally:
        server.shutdown()
        server.server_close()

    assert sorted(statuses) == [200, 400]
    # Exactly one copy of the BOM rows (1 component + 1 doosnummer) must
    # exist, never two — a doubled write would leave 4 rows instead of 2.
    entries = load_bom_csv(bom_csv_path)
    assert len([entry for entry in entries if entry.pakketnummer == "281.1"]) == 2


def test_add_verkoop_orders_appends_and_forces_aantal_to_one(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([], verkoop_csv_path)

    all_orders, toegevoegd, overgeslagen, _verwijderd = add_verkoop_orders(
        {
            "datum": "2026-09-17",
            "rows": [
                {"ordernummer": "123", "kanaal": "Amazon", "pakketnummer": "9.1", "aantal": 999},
                {"ordernummer": "124", "kanaal": "Bol.com", "pakketnummer": "70.12"},
            ],
        },
        verkoop_csv_path,
        tmp_path / "verkoop_geannuleerd.csv",
    )

    assert toegevoegd == 2
    assert overgeslagen == 0
    assert all_orders == [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Bol.com", "70.12", 1.0),
    ]
    assert load_verkoop_csv(verkoop_csv_path) == all_orders


def test_add_verkoop_orders_dedupes_against_existing_ordernummers(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([VerkoopOrder("123", "2026-09-16", "Amazon", "9.1", 1.0)], verkoop_csv_path)

    all_orders, toegevoegd, overgeslagen, _verwijderd = add_verkoop_orders(
        {"datum": "2026-09-17", "rows": [{"ordernummer": "123", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
        verkoop_csv_path,
        tmp_path / "verkoop_geannuleerd.csv",
    )

    assert toegevoegd == 0
    assert overgeslagen == 1
    assert all_orders == [VerkoopOrder("123", "2026-09-16", "Amazon", "9.1", 1.0)]


@pytest.mark.parametrize("payload", [
    {},
    {"datum": "", "rows": [{"ordernummer": "1", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": []},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "", "kanaal": "Amazon", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "1", "kanaal": "", "pakketnummer": "9.1"}]},
    {"datum": "2026-09-17", "rows": [{"ordernummer": "1", "kanaal": "Amazon", "pakketnummer": ""}]},
])
def test_add_verkoop_orders_rejects_invalid_payloads(tmp_path, payload):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    write_verkoop_csv([], verkoop_csv_path)

    with pytest.raises(ValueError):
        add_verkoop_orders(payload, verkoop_csv_path, tmp_path / "verkoop_geannuleerd.csv")


from mmp import load_betalingen, load_correcties, load_instellingen, load_prijzen
from webapp_server import save_mmp_sectie


def _mmp_paths(tmp_path):
    return {naam: tmp_path / f"mmp_{naam}.csv" for naam in ("prijzen", "betalingen", "correcties", "instellingen")}


def test_save_mmp_sectie_adds_to_what_is_on_disk(tmp_path):
    # Twee tabbladen (of twee servers op K:) die elk vanuit een verouderde
    # stand een betaling toevoegen: beide moeten bewaard blijven.
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("betalingen", {"toevoegen": [{"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": "100"}]}, paths)
    save_mmp_sectie("betalingen", {"toevoegen": [{"id": "b", "datum": "2026-09-27", "omschrijving": "y", "bedrag": "50"}]}, paths)
    assert [b.id for b in load_betalingen(paths["betalingen"])] == ["a", "b"]


def test_save_mmp_sectie_deletes_by_key(tmp_path):
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("betalingen", {"toevoegen": [
        {"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": "100"},
        {"id": "b", "datum": "2026-09-27", "omschrijving": "y", "bedrag": "50"},
    ]}, paths)
    save_mmp_sectie("betalingen", {"verwijderen": ["a"]}, paths)
    assert [b.id for b in load_betalingen(paths["betalingen"])] == ["b"]
    save_mmp_sectie("correcties", {"toevoegen": [{"ordernummer": "7", "reden": "retour"}]}, paths)
    save_mmp_sectie("correcties", {"verwijderen": ["7"]}, paths)
    assert load_correcties(paths["correcties"]) == []


def test_save_mmp_sectie_upserts_prijs_by_pakketnummer(tmp_path):
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("prijzen", {"toevoegen": [{"pakketnummer": "1.1", "artikel": "a", "ean": "", "prijs": "10"},
                                              {"pakketnummer": "1.2", "artikel": "b", "ean": "", "prijs": "20"}]}, paths)
    save_mmp_sectie("prijzen", {"toevoegen": [{"pakketnummer": "1.1", "artikel": "a2", "ean": "", "prijs": "11,5"}]}, paths)
    assert [(p.pakketnummer, p.artikel, p.prijs) for p in load_prijzen(paths["prijzen"])] == [
        ("1.1", "a2", 11.5), ("1.2", "b", 20.0)]


def test_save_mmp_sectie_instellingen(tmp_path):
    paths = _mmp_paths(tmp_path)
    save_mmp_sectie("instellingen", {"instellingen": {"startdatum": "2026-10-01", "pokon_toeslag": "6.01"}}, paths)
    assert load_instellingen(paths["instellingen"])["startdatum"] == "2026-10-01"


def test_save_mmp_sectie_invalid_writes_nothing(tmp_path):
    paths = _mmp_paths(tmp_path)
    with pytest.raises(ValueError):
        save_mmp_sectie("betalingen", {"toevoegen": [{"datum": "fout", "bedrag": 1}]}, paths)
    assert not paths["betalingen"].exists()


def test_save_mmp_sectie_unknown_section(tmp_path):
    with pytest.raises(KeyError):
        save_mmp_sectie("onzin", {"toevoegen": []}, _mmp_paths(tmp_path))


def test_push_code_seeds_missing_shared_data_but_never_overwrites(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    shared = tmp_path / "shared"
    repo.mkdir()
    shared.mkdir()
    (repo / "mmp_betalingen.csv").write_text("nieuw", encoding="utf-8")
    (repo / "mmp_prijzen.csv").write_text("repo-versie", encoding="utf-8")
    (shared / "mmp_prijzen.csv").write_text("k-versie", encoding="utf-8")
    monkeypatch.setattr(webapp_server, "CANONICAL_REPO_DIR", repo)
    monkeypatch.setattr(webapp_server, "SHARED_COPY_DIR", shared)

    webapp_server._push_code_to_shared_copy()

    assert (shared / "mmp_betalingen.csv").read_text(encoding="utf-8") == "nieuw"
    assert (shared / "mmp_prijzen.csv").read_text(encoding="utf-8") == "k-versie"


def _mmp_put(port, sectie, body):
    import urllib.error as _urllib_error
    request = _urllib_request.Request(
        f"http://127.0.0.1:{port}/api/mmp/{sectie}",
        data=_json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with _urllib_request.urlopen(request, timeout=5) as response:
            return response.status, _json.loads(response.read())
    except _urllib_error.HTTPError as error:
        return error.code, _json.loads(error.read())


def test_server_saves_mmp_sections_via_http_put(tmp_path, monkeypatch):
    monkeypatch.setattr(webapp_server, "MMP_PATHS", _mmp_paths(tmp_path))
    monkeypatch.setattr(webapp_server, "MMP_DATA_JS_PATH", tmp_path / "mmp_data.js")
    server = _ThreadingHTTPServer(("127.0.0.1", 0), webapp_server.PicklistRequestHandler)
    port = server.server_address[1]
    thread = _threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        ok = _mmp_put(port, "betalingen", {"toevoegen": [{"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": 100}]})
        fout = _mmp_put(port, "betalingen", {"toevoegen": [{"datum": "x", "bedrag": 1}]})
        onbekend = _mmp_put(port, "onzin", {"toevoegen": []})
    finally:
        server.shutdown()
        server.server_close()

    assert ok[0] == 200 and ok[1]["betalingen"][0]["bedrag"] == 100.0
    assert (tmp_path / "mmp_data.js").exists()
    assert fout[0] == 400 and "datum" in fout[1]["error"].lower()
    assert onbekend[0] == 404


def test_add_verkoop_orders_removes_and_remembers_cancelled(tmp_path):
    verkoop_csv_path = tmp_path / "verkoop_orders.csv"
    geannuleerd_path = tmp_path / "verkoop_geannuleerd.csv"
    write_verkoop_csv([
        VerkoopOrder("1", "2026-09-26", "Maison Privee", "9.1", 1.0),
        VerkoopOrder("1-pokon", "2026-09-26", "Maison Privee", "Pokon", 1.0),
    ], verkoop_csv_path)

    all_orders, toegevoegd, _, verwijderd = add_verkoop_orders(
        {"datum": "2026-09-27", "rows": [], "geannuleerd": ["1"]}, verkoop_csv_path, geannuleerd_path)

    assert all_orders == [] and toegevoegd == 0 and verwijderd == 2
    assert load_geannuleerd(geannuleerd_path) == {"1"}
    # later nog eens aangeboden (oude export) -> blijft weg
    all_orders, toegevoegd, _, _ = add_verkoop_orders(
        {"datum": "2026-09-28", "rows": [{"ordernummer": "1", "kanaal": "Maison Privee", "pakketnummer": "9.1"}]},
        verkoop_csv_path, geannuleerd_path)
    assert all_orders == [] and toegevoegd == 0


def test_merge_verkoop_orders_does_not_resurrect_cancelled(tmp_path, monkeypatch):
    repo, shared = tmp_path / "repo", tmp_path / "shared"
    repo.mkdir()
    shared.mkdir()
    order = VerkoopOrder("1", "2026-09-26", "Maison Privee", "9.1", 1.0)
    write_verkoop_csv([], repo / "verkoop_orders.csv")
    write_geannuleerd({"1"}, repo / "verkoop_geannuleerd.csv")
    write_verkoop_csv([order], shared / "verkoop_orders.csv")
    monkeypatch.setattr(webapp_server, "CANONICAL_REPO_DIR", repo)
    monkeypatch.setattr(webapp_server, "SHARED_COPY_DIR", shared)

    webapp_server._merge_verkoop_orders()

    assert load_verkoop_csv(repo / "verkoop_orders.csv") == []
    assert load_verkoop_csv(shared / "verkoop_orders.csv") == []
    assert load_geannuleerd(shared / "verkoop_geannuleerd.csv") == {"1"}
