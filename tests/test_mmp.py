import pytest

from mmp import (
    STANDAARD_INSTELLINGEN,
    MmpBetaling,
    MmpCorrectie,
    MmpPrijs,
    load_betalingen,
    load_correcties,
    load_instellingen,
    load_prijzen,
    parse_betalingen,
    parse_correcties,
    parse_instellingen,
    parse_prijzen,
    write_betalingen,
    write_correcties,
    write_instellingen,
    write_prijzen,
)


def test_prijzen_round_trip(tmp_path):
    path = tmp_path / "mmp_prijzen.csv"
    prijzen = [MmpPrijs("1.1", "Roses x 6", "8717032003863", 29.4)]
    write_prijzen(prijzen, path)
    assert load_prijzen(path) == prijzen


def test_betalingen_round_trip(tmp_path):
    path = tmp_path / "mmp_betalingen.csv"
    betalingen = [MmpBetaling("a1", "2026-09-26", "Vooruitbetaling okt.", 500.0)]
    write_betalingen(betalingen, path)
    assert load_betalingen(path) == betalingen


def test_correcties_round_trip(tmp_path):
    path = tmp_path / "mmp_correcties.csv"
    correcties = [MmpCorrectie("2024217357", "retour")]
    write_correcties(correcties, path)
    assert load_correcties(path) == correcties


def test_instellingen_round_trip_and_defaults(tmp_path):
    path = tmp_path / "mmp_instellingen.csv"
    assert load_instellingen(path) == STANDAARD_INSTELLINGEN
    write_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "7.5"}, path)
    assert load_instellingen(path) == {"startdatum": "2026-10-01", "pokon_toeslag": "7.5"}


def test_missing_files_load_empty(tmp_path):
    assert load_prijzen(tmp_path / "x.csv") == []
    assert load_betalingen(tmp_path / "x.csv") == []
    assert load_correcties(tmp_path / "x.csv") == []


def test_parse_prijzen_accepts_decimal_comma_and_strips():
    [prijs] = parse_prijzen([{"pakketnummer": " 1.1 ", "artikel": "Roses", "ean": "", "prijs": "29,40"}])
    assert prijs == MmpPrijs("1.1", "Roses", "", 29.4)


@pytest.mark.parametrize("rows", [
    [{"pakketnummer": "", "artikel": "x", "ean": "", "prijs": 1}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": "abc"}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": "nan"}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": -1}],
    [{"pakketnummer": "1.1", "artikel": "x", "ean": "", "prijs": 1},
     {"pakketnummer": "1.1", "artikel": "y", "ean": "", "prijs": 2}],
    "geen lijst",
    ["geen dict"],
])
def test_parse_prijzen_rejects_invalid(rows):
    with pytest.raises(ValueError):
        parse_prijzen(rows)


def test_parse_betalingen_accepts_negative_and_assigns_missing_id():
    [betaling] = parse_betalingen([{"id": "", "datum": "2026-09-26", "omschrijving": "retour", "bedrag": "-12,50"}])
    assert betaling.bedrag == -12.5
    assert betaling.id


@pytest.mark.parametrize("row", [
    {"id": "a", "datum": "26-09-2026", "omschrijving": "x", "bedrag": 1},
    {"id": "a", "datum": "", "omschrijving": "x", "bedrag": 1},
    {"id": "a", "datum": "2026-09-26", "omschrijving": "x", "bedrag": "veel"},
])
def test_parse_betalingen_rejects_invalid(row):
    with pytest.raises(ValueError):
        parse_betalingen([row])


def test_parse_correcties_rejects_empty_ordernummer():
    with pytest.raises(ValueError):
        parse_correcties([{"ordernummer": " ", "reden": "retour"}])


def test_parse_instellingen_validates():
    assert parse_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "6,01"}) == {
        "startdatum": "2026-10-01", "pokon_toeslag": "6.01"}
    with pytest.raises(ValueError):
        parse_instellingen({"startdatum": "1-10-2026", "pokon_toeslag": "6.01"})
    with pytest.raises(ValueError):
        parse_instellingen({"startdatum": "2026-10-01", "pokon_toeslag": "x"})
