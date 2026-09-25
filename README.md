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
te bekijken. Met **Afdrukken** kun je de pakkettenlijst en alle
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
verwijdert of op **Alle lijsten wissen** klikt.

### Klacht / nazending (los, deels pakket toevoegen)

Moet er buiten de normale bestelling om iets nagestuurd worden (bijv. een
klacht waarbij 2 van de 5 bomen uit pakket 11.1 opnieuw moeten)? Klik op
**+ Klacht aanmaken** (staat altijd bovenaan, ook zonder ingeladen picklist),
kies het bestaande pakketnummer en de app laadt de standaardinhoud. Vink uit
wat niet mee hoeft, pas aantallen aan en wijzig zo nodig het doosnummer (een
nazending gaat vaak in een andere doos dan het volledige pakket). Moeten er
meerdere pakketten in dezelfde klacht (voor dezelfde klant) mee? Klik op
**+ Nog een pakket toevoegen aan deze klacht** om er nog een pakketnummer bij
te zoeken, met een eigen doosje per toegevoegd pakket — handig als de klacht
in meerdere dozen verstuurd wordt.

De klacht verschijnt als aparte, oranje **NAZENDING**-regel naast de normale
regel (zo mag hetzelfde pakketnummer dubbel voorkomen), met een badge met het
aantal dozen dat de klacht echt meestuurt (of anders het aantal stuks). De
gekozen aantallen tellen ook mee in de KOELING/KAS/KAMER/POKON/DOZEN-lijsten —
de betreffende regels daar krijgen een oranje randje zodat duidelijk is dat er
een nazending in zit.

Elke klacht staat ook als eigen regel onder **Ingeladen lijsten**, net als een
ingelezen CSV: met een "Meetellen"-vinkje om 'm tijdelijk buiten de telling te
zetten zonder 'm te verwijderen, en een kruisje om 'm definitief weg te halen.

**Pakketkaarten afdrukken** werkt ook voor klachten: er komt één kaart per
doos, met alleen de inhoud die daadwerkelijk in die doos gaat. Vink je bij
een gebundelde klacht één doosje uit, dan schuift die inhoud mee op de kaart
van de doos die je wél aanhoudt.

### Pakketdatabase

Nieuwe pakketten voeg je in de browser-app toe met **Pakket aan database
toevoegen**. Komt in een ingelezen export een onbekend pakket voor, dan staat bij
dat nummer direct een knop **Toevoegen aan database**. Vul pakketnaam, inhoud,
aantallen, locatie, Pokon en doosnummer(s) in. Na opslaan wordt de geopende
picklist meteen opnieuw berekend, en de gegevens worden direct weggeschreven naar
`bom.csv`/`package_info.csv` — dus zichtbaar voor iedereen die de app opent, en
voor `run_picklist.bat`.

### Ma Maison Privée — vooruitbetaling

Ma Maison Privée betaalt vooruit. Met de knop **Maison Privée** bovenaan open je
het overzicht: ontvangen, besteld, saldo nu en welke orders wachten op betaling.
Vul daar elke ontvangen betaling in (een terugbetaling vul je negatief in).

Laad je een export in, dan worden de Maison Privée-orders van oud naar nieuw
tegen het saldo gelegd. Orders die niet meer gedekt zijn gaan automatisch naar de
lijst **Maison Privée – wacht op betaling** en tellen niet mee op de picklijst.
Is er een nieuwe betaling binnen, vink die lijst dan aan: de orders die nu wel
gedekt zijn komen in een nieuwe, actieve lijst "Maison Privée vrijgegeven …",
de rest blijft wachten. Een order waarvan het pakket nog geen prijs heeft wacht
altijd, tot je de prijs invult.

Een prijs aanpassen doe je met een ingangsdatum ("Geldig vanaf", standaard
vandaag): orders vanaf die datum krijgen de nieuwe prijs, oudere orders houden
de prijs die toen gold. De startprijzen (zonder datum) gelden vanaf het begin.

Op dezelfde pagina beheer je de prijslijst, correcties (orders die niet mogen
meetellen, bijv. een retour), de startdatum en de Pokon-toeslag, en maak je een
factuuroverzicht per periode (met afdrukknop). De gegevens staan in
`mmp_prijzen.csv`, `mmp_betalingen.csv`, `mmp_correcties.csv` en
`mmp_instellingen.csv` en gaan met de **Back-up**-knop mee naar K:.

Geannuleerde orders (Status "Cancelled" in de export) tellen nergens meer mee:
niet op de picklijst, niet in Verkopen en niet in het saldo.

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

Tests draaien met `python -m pytest`; de saldoberekening van Ma Maison Privée
(`webapp/dist/mmp_saldo.js`) wordt getest met `node --test tests/*.test.js`. Zie
`docs/superpowers/specs/2026-09-15-picklist-automation-design.md` voor het ontwerp.
