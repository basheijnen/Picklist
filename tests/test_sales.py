from sales import VerkoopOrder, load_verkoop_csv, merge_new_orders, write_verkoop_csv


def test_write_then_load_roundtrips_orders(tmp_path):
    csv_path = tmp_path / "verkoop_orders.csv"
    orders = [
        VerkoopOrder("123", "2026-09-17", "VakantieVeilingen", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Amazon", "70.12", 1.0),
    ]

    write_verkoop_csv(orders, csv_path)

    assert load_verkoop_csv(csv_path) == orders


def test_load_verkoop_csv_returns_empty_list_when_file_missing(tmp_path):
    assert load_verkoop_csv(tmp_path / "does-not-exist.csv") == []


def test_merge_new_orders_skips_known_ordernummers():
    existing = [VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0)]
    new_orders = [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),  # duplicate
        VerkoopOrder("124", "2026-09-17", "Amazon", "9.1", 1.0),  # new
    ]

    all_orders, toegevoegd, overgeslagen = merge_new_orders(existing, new_orders)

    assert toegevoegd == 1
    assert overgeslagen == 1
    assert all_orders == [
        VerkoopOrder("123", "2026-09-17", "Amazon", "9.1", 1.0),
        VerkoopOrder("124", "2026-09-17", "Amazon", "9.1", 1.0),
    ]


def test_merge_new_orders_with_no_existing_orders_adds_everything():
    all_orders, toegevoegd, overgeslagen = merge_new_orders([], [
        VerkoopOrder("1", "2026-09-17", "Bol.com", "9.1", 1.0),
    ])

    assert toegevoegd == 1
    assert overgeslagen == 0
    assert len(all_orders) == 1
