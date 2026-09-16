# E-commerce picklist

Genereert dagelijks `Picklist.xlsx` op basis van de bestellingen in `Bron.xlsm`.

## Gebruik

Dubbelklik `run_picklist.bat` nadat de bestellingen van vandaag binnen zijn. Het
resultaat komt in `Picklist.xlsx` in deze map, en bestaande onbekende
pakketnummers (nieuw product, nog niet in `bom.csv`) worden apart getoond in het
consolevenster en op het tabblad "Onbekende pakketten".

## Browser-app zonder Excel

Dubbelklik `open_picklist_app.bat`. De picklistmaker opent lokaal in Chrome of
Edge. Sleep de orderexport-CSV naar het venster om eerst de pakkettenlijst met
pakketnaam, Pokon-markering en doosnummer(s), en daarna de picklists per afdeling
te bekijken. Met **Printen / PDF opslaan** kun je de pakkettenlijst en alle
afdelingen printen of in het Windows-afdrukvenster kiezen voor **Opslaan als
PDF**. De ordergegevens blijven op de computer en worden niet geüpload.

### Meerdere picklisten tegelijk

Sleep je meerdere CSV-exports achter elkaar, dan verschijnt elke export als
eigen regel onder **Ingeladen lijsten**, met een vinkje **Meetellen**, een
naam (standaard de bestandsnaam, zelf aan te passen) en een verwijderknop. De
aantallen in de picklist zijn altijd de som van alleen de aangevinkte lijsten
— vink een lijst uit om hem in de wacht te zetten zonder hem kwijt te raken.

Verlaag je in de pakkettentabel een aantal handmatig, dan kun je het verschil
meteen naar een (nieuwe of bestaande) in-de-wacht-lijst verplaatsen in plaats
van het gewoon te laten vervallen. De lijst blijft bewaard totdat je hem zelf
verwijdert of op **Alles wissen** klikt.

### Nazending (los, deels pakket toevoegen)

Moet er buiten de normale bestelling om iets nagestuurd worden (bijv. een
klacht waarbij 2 van de 5 bomen uit pakket 11.1 opnieuw moeten)? Klik in de
pakkettentabel op **+ Nazending toevoegen**, kies het bestaande pakketnummer
en de app laadt de standaardinhoud. Vink uit wat niet mee hoeft en pas
aantallen aan. Het pakket verschijnt dan als aparte, oranje **NAZENDING**-regel
naast de normale regel (zo mag hetzelfde pakketnummer dubbel voorkomen), en de
gekozen aantallen tellen ook mee in de KOELING/KAS/KAMER/POKON/DOZEN-lijsten —
de betreffende regels daar krijgen een oranje randje zodat duidelijk is dat
er een nazending in zit.

### Pakketdatabase

Nieuwe pakketten voeg je in de browser-app toe met **Pakket aan database
toevoegen**. Komt in een ingelezen export een onbekend pakket voor, dan staat bij
dat nummer direct een knop **Toevoegen aan database**. Vul pakketnaam, inhoud,
aantallen, locatie, Pokon en doosnummer(s) in. Na opslaan wordt de geopende
picklist meteen opnieuw berekend, en de gegevens worden direct weggeschreven naar
`bom.csv`/`package_info.csv` — dus zichtbaar voor iedereen die de app opent, en
voor `run_picklist.bat`.

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
