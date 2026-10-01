import pytest

from sales import VerkoopOrder
from tools.koppel_pokon_export import koppel_pokon_orders, lees_export


def _o(ordernummer, datum, pakketnummer, aantal, kanaal="Bol.com"):
    return VerkoopOrder(ordernummer, datum, kanaal, pakketnummer, aantal)


def _export(*rijen):
    return [
        {"ordernummer": nr, "datum": datum, "kanaal": "Bol.com", "pakketnummer": pakket}
        for nr, datum, pakket in rijen
    ]


def test_koppelt_pokon_aan_echte_orders_zonder_totalen_te_veranderen():
    orders = [
        _o("migratie-Bol.com-2026-08-10-249.4", "2026-08-10", "249.4", 3.0),
        _o("migratie-Bol.com-2026-08-11-249.2", "2026-08-11", "249.2", 6.0),
        _o("migratie-Bol.com-2026-08-11-249.4", "2026-08-11", "249.4", 1.0),
        _o("handmatig-Pokon-Bol.com-2026-08-10", "2026-08-10", "Pokon", 1.0),
        _o("handmatig-Pokon-Bol.com-2026-08-11", "2026-08-11", "Pokon", 2.0),
    ]
    export = _export(("2024211717", "2026-08-10", "249.4p"), ("2024211910", "2026-08-11", "249.2p"),
                     ("2024211911", "2026-08-11", "249.4p"))

    nieuw, geannuleerd, rapport = koppel_pokon_orders(orders, export, set())

    actief = [o for o in nieuw if o.ordernummer not in geannuleerd]
    per_nummer = {o.ordernummer: o for o in actief}
    # Dagtotalen verlaagd, echte orders + gekoppelde Pokon erbij.
    assert per_nummer["migratie-Bol.com-2026-08-10-249.4"].aantal == 2.0
    assert per_nummer["migratie-Bol.com-2026-08-11-249.2"].aantal == 5.0
    assert per_nummer["2024211717"] == _o("2024211717", "2026-08-10", "249.4", 1.0)
    assert per_nummer["2024211717-pokon"] == _o("2024211717-pokon", "2026-08-10", "Pokon", 1.0)
    # Handmatige Pokon en een op 0 gekomen dagtotaal vallen weg via de annuleringen.
    assert geannuleerd == {"handmatig-Pokon-Bol.com-2026-08-10", "handmatig-Pokon-Bol.com-2026-08-11",
                           "migratie-Bol.com-2026-08-11-249.4"}
    # Per pakket en voor Pokon blijft het totaal gelijk.
    def totaal(lijst, pakket):
        return sum(o.aantal for o in lijst if o.pakketnummer == pakket)
    for pakket in ("249.2", "249.4", "Pokon"):
        assert totaal(actief, pakket) == totaal(orders, pakket)
    assert rapport["gekoppeld"] == 3


def test_order_die_al_in_verkopen_staat_wordt_overgeslagen():
    orders = [_o("2024217438", "2026-09-28", "249.2", 1.0), _o("2024217438-pokon", "2026-09-28", "Pokon", 1.0)]
    nieuw, geannuleerd, rapport = koppel_pokon_orders(orders, _export(("2024217438", "2026-09-28", "249.2p")), set())
    assert nieuw == orders
    assert geannuleerd == set()
    assert rapport["al_aanwezig"] == 1


def test_stopt_als_handmatige_pokon_niet_klopt_met_de_export():
    orders = [
        _o("migratie-Bol.com-2026-08-10-249.4", "2026-08-10", "249.4", 3.0),
        _o("handmatig-Pokon-Bol.com-2026-08-10", "2026-08-10", "Pokon", 2.0),
    ]
    with pytest.raises(ValueError, match="2026-08-10"):
        koppel_pokon_orders(orders, _export(("2024211717", "2026-08-10", "249.4p")), set())


def test_lees_export(tmp_path):
    pad = tmp_path / "export.csv"
    pad.write_text(
        "﻿Ordernr. intern;Ordernr. 1;Ordernr. 2;Order date;Package;Package Number;Client;Country;Printed on\n"
        "2024211717;C000CLWP5R;;10-8-2026 8:19:1;Toscaanse Jasmijn x 6 roze met POKON;249.4p;Bol.com;NL;10-8-2026 8:36:50\n",
        encoding="utf-8",
    )
    assert lees_export(pad) == [{"ordernummer": "2024211717", "datum": "2026-08-10", "kanaal": "Bol.com", "pakketnummer": "249.4p"}]
