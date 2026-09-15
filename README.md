# E-commerce picklist

Genereert dagelijks `Picklist.xlsx` op basis van de bestellingen in `Bron.xlsm`.

## Gebruik

Dubbelklik `run_picklist.bat` nadat de bestellingen van vandaag binnen zijn. Het
resultaat komt in `Picklist.xlsx` in deze map, en bestaande onbekende
pakketnummers (nieuw product, nog niet in `bom.csv`) worden apart getoond in het
consolevenster en op het tabblad "Onbekende pakketten".

## Alternatieve bron: los CSV-bestand

In plaats van automatisch `Bron.xlsm` van vandaag te zoeken, kun je ook een los
CSV-bestand met orderregels (bijv. een `Export-JJJJ-MM-DD_UUMM.csv`-export) op
`run_picklist.bat` slepen. De tool telt dan zelf het aantal orders per
pakketnummer (kolom "Package Number") en negeert `Bron.xlsm` voor die run. Het
CSV-bestand moet puntkomma-gescheiden zijn met minimaal een kolom
"Package Number".

## Nieuw product/pakket toevoegen

Voeg een regel toe aan `bom.csv`:
`pakketnummer,gebied,item,soort,aantal_per_pakket,groep,volgorde`.
`gebied` is een van `KOELING`, `KAS`, `KAMER`, `POKON`, `DOZEN`.

`groep` en `volgorde` bepalen hoe het item op de picklist wordt getoond:

- `groep` is de tekst van de categorie-kop waar het item op de picklist onder
  moet komen te staan (bijvoorbeeld `Rozen 38CM:`). Laat dit leeg (`""`) voor
  DOZEN-regels, of als het item geen eigen categorie-kop nodig heeft.
- `volgorde` is een getal dat bepaalt waar het item binnen zijn `gebied`
  terechtkomt (lager = eerder). Kies een getal tussen de `volgorde`-waardes
  van de twee regels waar het item tussen moet komen te staan. Laat je dit op
  `0` (of `groep` op `""`) staan, dan krijgt het item geen categorie-kop en
  komt het vóór alle andere items in zijn `gebied` te staan — voor
  gebiedslijsten is het daarom beter om een echte `volgorde` te kiezen, in de
  buurt van de categorie waar het item bij hoort.

## Ontwikkelaars

Tests draaien met `python -m pytest`. Zie
`docs/superpowers/specs/2026-09-15-picklist-automation-design.md` voor het ontwerp.
