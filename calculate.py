from collections import defaultdict


def calculate_totals(bom_entries, aantallen):
    totals = defaultdict(lambda: defaultdict(float))
    known_pakketten = {entry.pakketnummer for entry in bom_entries}

    for entry in bom_entries:
        aantal = aantallen.get(entry.pakketnummer, 0)
        if aantal:
            totals[entry.gebied][(entry.item, entry.soort)] += (
                aantal * entry.aantal_per_pakket
            )

    unknown = {
        pakketnummer: aantal
        for pakketnummer, aantal in aantallen.items()
        if aantal and pakketnummer not in known_pakketten
    }

    return {gebied: dict(items) for gebied, items in totals.items()}, unknown
