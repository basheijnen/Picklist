from import_csv import read_order_export_csv


def test_read_order_export_csv_counts_orders_per_pakketnummer(tmp_path):
    csv_path = tmp_path / "Export-2026-09-15_1101.csv"
    csv_path.write_text(
        '"Ordernr. intern";"Package Number";"Status"\n'
        '"1";"9.11";"Printed"\n'
        '"2";"9.11";"Printed"\n'
        '"3";"3.1";"Printed"\n',
        encoding="utf-8-sig",
    )

    aantallen = read_order_export_csv(csv_path)

    assert aantallen == {"9.11": 2, "3.1": 1}
