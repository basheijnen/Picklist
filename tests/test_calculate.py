from bom import BomEntry
from calculate import calculate_totals


def test_calculate_totals_applies_multiplier_and_sums_across_pakketten():
    bom_entries = [
        BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0),
        BomEntry("1.32", "KOELING", "Parade", "CL Pink", 3.0),
    ]
    aantallen = {"1.3": 2, "1.32": 4}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert totals["KOELING"][("Parade", "CL Pink")] == 2 * 1.0 + 4 * 3.0
    assert unknown == {}


def test_calculate_totals_ignores_pakketten_with_zero_orders():
    bom_entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)]
    aantallen = {"1.3": 0}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert totals == {}
    assert unknown == {}


def test_calculate_totals_flags_unknown_pakketten_with_nonzero_orders():
    bom_entries = [BomEntry("1.3", "KOELING", "Parade", "CL Pink", 1.0)]
    aantallen = {"1.3": 1, "99.9": 7, "99.10": 0}

    totals, unknown = calculate_totals(bom_entries, aantallen)

    assert unknown == {"99.9": 7}
