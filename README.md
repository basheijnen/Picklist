# E-commerce picklist

Genereert dagelijks `Picklist.xlsx` op basis van de bestellingen in `Bron.xlsm`.

## Gebruik

Dubbelklik `run_picklist.bat` nadat de bestellingen van vandaag binnen zijn. Het
resultaat komt in `Picklist.xlsx` in deze map, en bestaande onbekende
pakketnummers (nieuw product, nog niet in `bom.csv`) worden apart getoond in het
consolevenster en op het tabblad "Onbekende pakketten".

## Nieuw product/pakket toevoegen

Voeg een regel toe aan `bom.csv`: `pakketnummer,gebied,item,soort,aantal_per_pakket`.
`gebied` is een van `KOELING`, `KAS`, `KAMER`, `POKON`, `DOZEN`.

## Ontwikkelaars

Tests draaien met `python -m pytest`. Zie
`docs/superpowers/specs/2026-09-15-picklist-automation-design.md` voor het ontwerp.
