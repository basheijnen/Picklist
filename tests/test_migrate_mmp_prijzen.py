import openpyxl

from mmp import MmpPrijs
from tools.migrate_mmp_prijzen import lees_prijzen_uit_excel


def test_lees_prijzen_uit_excel(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Prijzen"
    ws.append(["Pakketnummer", "Artikel", "EAN", "Verkoopprijs", "Aantal in periode"])
    ws.append(["1.1", "Roses x 6", 8717032003863, 29.4, "=1+1"])
    ws.append([1.2, "Roses Polyantha ", None, 24.71, None])
    ws.append([None, None, None, None, None])
    path = tmp_path / "tool.xlsx"
    wb.save(path)

    assert lees_prijzen_uit_excel(path) == [
        MmpPrijs("1.1", "Roses x 6", "8717032003863", 29.4),
        MmpPrijs("1.2", "Roses Polyantha", "", 24.71),
    ]
