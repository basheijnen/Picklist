from packages import PackageInfo, load_package_info_csv, write_package_info_csv


def test_write_then_load_round_trip(tmp_path):
    entries = [
        PackageInfo("1.1", "Grootbloemige rozen x 6", "nee", "14"),
        PackageInfo("1.1p", "Grootbloemige rozen x 6", "ja", "2"),
    ]
    csv_path = tmp_path / "package_info.csv"

    write_package_info_csv(entries, csv_path)
    loaded = load_package_info_csv(csv_path)

    assert loaded == entries
