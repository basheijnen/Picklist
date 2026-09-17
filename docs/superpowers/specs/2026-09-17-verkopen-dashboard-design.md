# Verkopen 2026-2027 dashboard — design

## Doel

Vervang het handmatige Excel-werkblad `Totaaloverzicht verkochte pakketten
2026-2027.xlsm` (20+ tabbladen, één per verkoopkanaal, met de macro
`AllesInvullenVoorDatum_SUPERSNEL` die een dagelijks bronbestand erin
plakt) door een sectie in de picklist-webapp. De dagelijkse order-export
die nu al voor de picklist wordt gebruikt (CSV met o.a. `Package Number`,
`Client`, `Shop`) wordt losstaand geüpload naar een nieuwe
"Verkopen 2026-2027"-pagina, die een overzicht toont van verkopen per
periode, kanaal en pakketnummer — zonder dat Excel er nog aan te pas komt.

## Datamodel

Nieuw bestand `verkoop_orders.csv` naast de bestaande `bom.csv` /
`package_info.csv`, met hetzelfde persistentiepatroon (server schrijft het
CSV weg, het wordt meegenomen in `SHARED_DATA_FILES` zodat de bestaande
Back-up-knop het ook naar K: synct).

Kolommen:

| kolom         | betekenis                                                          |
|---------------|---------------------------------------------------------------------|
| `ordernummer` | uniek per rij — zie hieronder                                       |
| `datum`       | de dag waaraan deze verkoop wordt toegewezen (`YYYY-MM-DD`)          |
| `kanaal`      | genormaliseerde kanaalnaam (zie kanaal-mapping)                     |
| `pakketnummer`| zoals in het bronbestand (bijv. `9.1`, `9.1p`)                       |
| `aantal`      | meestal `1` (één orderregel = één stuk); groter bij gemigreerde data |

`ordernummer` is de dedupe-sleutel:
- Bij een normale upload: de waarde uit de `Ordernr. intern`-kolom van het
  geüploade bestand.
- Bij de eenmalige historie-migratie (zie verderop): een gegenereerde
  sleutel `migratie-<tabblad>-<datum>-<pakketnummer>`, die nooit met een
  echt (numeriek) ordernummer kan botsen.

Alle weergaven (kengetallen, grafiek, tabel) worden **live berekend** uit
deze ruwe rijen door de browser — er worden geen aparte, vooraf
opgetelde totalen bewaard die uit de pas kunnen raken.

`pakketnaam` wordt niet dubbel opgeslagen: de bestaande
`window.PICKLIST_PACKAGES`-lijst (uit `package_info.csv`) wordt gebruikt
om een pakketnummer naar zijn naam te vertalen voor weergave.

## Kanaal- en regio-mapping

Vaste tabel in `app.js` (analoog aan bestaande constants zoals
`BOXES_PER_PALLET`), overgenomen uit de huidige Excel-tabbladen:

```
EUROPA:  Groupon FR, Groupon DE, Groupon IT, Groupon ES,
         Limango, Maison Privee, WestWing, Outspot, VeePee, ALDI
BENELUX: Bol.com, Groupon NL, Groupon BE, iBood, Mediahuis,
         NewReturns, VakantieVeilingen, PVW, Voordeelvanger, Amazon, ESSIM
```

Twee extra normalisatieregels, ontdekt tijdens de eindreview door alle
243 echte exportbestanden na te lopen: `Client == "TMG"` normaliseert
naar het bestaande kanaal `"Mediahuis"` (TMG is Mediahuis onder haar
exportnaam), en rijen met `Client == "Klachten E-Commerce"` worden
volledig genegeerd (retouren/klachten, geen verkoop).

Normalisatie van de ruwe `Client`/`Shop`-kolommen naar een kanaalnaam uit
bovenstaande tabel:

- `Client == "Amazon"` → kanaal `"Amazon"` (Shop-detail als "Amazon.de"
  wordt genegeerd, alle Amazon-marktplaatsen tellen samen).
- `Client == "GroupON"` → kanaal `"Groupon " + Shop` (Shop bevat de
  landcode, bijv. `"Groupon BE"`).
- Overige `Client`-waarden → kanaal = `Client`, getrimd, vergeleken
  hoofdletterongevoelig met de tabel.
- Geen match gevonden → de rij wordt **niet** weggegooid: kanaal wordt
  `"Onbekend: <Client>"` en regio `"Onbekend"`. Dat maakt zulke rijen
  zichtbaar in de tabel/filter in plaats van ze stil te laten
  verdwijnen, en de uploadbevestiging noemt ze expliciet zodat de
  mapping-tabel aangevuld kan worden.

## Upload-flow

Nieuwe, losstaande knop **"Upload naar Verkoop"** op de
"Verkopen 2026-2027"-pagina (los van de bestaande picklist-CSV-import,
zodat een test- of picklist-import de verkoopcijfers nooit raakt).

1. Bestand kiezen/slepen (zelfde `.csv`-validatie als de bestaande
   import).
2. Datumveld verschijnt, vooraf ingevuld met vandaag, handmatig aan te
   passen — dit wordt de `datum` voor alle rijen uit dit bestand.
3. Parsing + kanaal-normalisatie gebeurt in de browser (zelfde aanpak als
   de bestaande CSV-import in `handleFile`).
4. De rijen (`ordernummer`, `kanaal`, `pakketnummer`, gekozen `datum`,
   `aantal: 1`) gaan naar een nieuw endpoint `POST /api/verkoop`.
5. De server voegt alleen rijen toe waarvan `ordernummer` nog niet
   bestaat in `verkoop_orders.csv`, schrijft het bestand weg, en
   regenereert `verkoop_data.js` (zelfde patroon als `data.js` uit
   `bom.csv`/`package_info.csv`).
6. Bevestiging in de UI: bijv. *"62 orderregels verwerkt, 3 overgeslagen
   (al eerder geüpload), 2 rijen met onbekend kanaal: 'Foo' (2×)."*

Reden voor optellen i.p.v. overschrijven per datum (in tegenstelling tot
de oude macro): de gebruiker uploadt soms meerdere deelbestanden per dag
die samen de dagtotalen vormen. De ordernummer-dedupe maakt dit veilig
tegen dubbele uploads van hetzelfde bestand.

## Server (`webapp_server.py`)

- Nieuw endpoint `POST /api/verkoop`: body = `{"datum": "...", "rows":
  [{"ordernummer": "...", "kanaal": "...", "pakketnummer": "..."}]}`.
  De server kent zelf `aantal: 1` toe aan elke rij (nooit clientinvoer
  vertrouwen voor dat veld) — alleen de migratiescript schrijft rechtstreeks
  grotere `aantal`-waarden weg. De server leest `verkoop_orders.csv`,
  filtert op nieuwe `ordernummer`s, appendt, herbouwt `verkoop_data.js`, en
  retourneert `{"toegevoegd": n, "overgeslagen": n, "orders": [...]}` —
  de volledige, samengevoegde orderslijst, zodat de browser
  `window.PICKLIST_VERKOOP` na een upload meteen kan vervangen zonder
  een paginaverversing (de "onbekend kanaal"-telling voor de
  uploadbevestiging wordt client-side afgeleid uit diezelfde lijst, niet
  apart door de server meegestuurd).
- `verkoop_orders.csv` toegevoegd aan `SHARED_DATA_FILES`, zodat de
  bestaande Back-up-knop 'm meeneemt. Anders dan `bom.csv`/`package_info.csv`
  (waar K: leidend is en pull dus eenrichtingsverkeer K→C mag zijn) kan
  dit bestand op *beide* kanten onafhankelijk groeien — een upload vanaf
  deze checkout, of een upload door een collega die de app vanaf K: draait
  — dus wordt het bij elke Back-up in beide richtingen samengevoegd
  (dedupe op `ordernummer`, resultaat teruggeschreven naar zowel C: als
  K:), in plaats van dat de ene kant de andere overschrijft. Dit gat werd
  pas bij de eindreview ontdekt (K: bleek het bestand nog helemaal niet
  te hebben) en is toen alsnog zo gefixt.
- `build_data_js`-equivalent uitgebreid (of een parallelle functie) om
  naast `data.js` ook `verkoop_data.js` met `window.PICKLIST_VERKOOP` te
  schrijven, zodat de pagina bij een gewone paginaverversing altijd de
  actuele data laadt (in combinatie met de eerder toegevoegde
  `Cache-Control: no-store`).

## UI — "Verkopen 2026-2027"-pagina

Zoals goedgekeurd in de mockup:

- Nieuwe knop in de hoofdnavigatie (naast bijv. "Pakketten beheren") die
  naar deze pagina navigeert.
- Kengetal-tegels bovenaan: totaal seizoen, vandaag, deze week,
  Europa-totaal · Benelux-totaal.
- Trendgrafiek (verkopen per week over het hele seizoen, met
  dag/week/maand-toggle).
- Filterbalk: periode, kanaal, vrije zoekbox op pakketnummer/naam.
- Sorteerbare tabel: pakketnummer, naam (via `PICKLIST_PACKAGES`),
  kanaal, aantal — met een totaalrij voor het huidige filter.
- "Upload naar Verkoop"-knop rechtsboven op dezelfde pagina.

## Eenmalige historie-migratie

Los script `tools/migrate_verkopen_historie.py`, één keer handmatig te
draaien met het pad naar
`Totaaloverzicht verkochte pakketten 2026-2027.xlsm`:

- Itereert over alle kanaal-tabbladen (Amazon, Bol.com, Groupon
  BE/DE/ES/FR/IT/NL, iBood, Maison Privee, Mediahuis, Limango,
  NewReturns, Outspot, PVW, VakantieVeilingen, VeePee, Voordeelvanger,
  WestWing). De 3 samenvattingstabbladen en "CBS periode en land" worden
  overgeslagen, net als de kanalen die alleen nog als `#REF!`-rij bestaan
  (Eurosparen, TicketVeiling, ActieVanDeDag) — die hebben geen tabblad
  meer.
- Kanaalnaam per tabblad komt uit cel `B6` (dus rechtstreeks uit het
  bestand overgenomen, niet opnieuw geraden).
- Pakketnummers uit rij 8 (kolom D en verder); voor elke datumrij
  (rij 9+) wordt elke niet-lege, niet-nul cel een rij in
  `verkoop_orders.csv` met `ordernummer = "migratie-<tabblad>-<datum>-
  <pakketnummer>"` en `aantal` = de historische celwaarde.
- Script is **idempotent**: opnieuw draaien overschrijft geen bestaande
  rijen dankzij de ordernummer-dedupe, dus een halverwege afgebroken run
  kan gewoon opnieuw.

## Foutafhandeling

- Ongeldig/ontbrekend bestand bij upload → dezelfde melding als de
  bestaande CSV-import ("Kies een CSV-bestand.").
- Onbekend kanaal → zichtbaar in tabel/filter als `"Onbekend: <naam>"`,
  genoemd in de uploadbevestiging, upload gaat gewoon door (geen harde
  blokkade).
- Ontbrekende `Package Number`-cel in een rij → rij wordt overgeslagen
  (zelfde aanpak als de bestaande CSV-import).

## Testen

- Python: unit tests voor `migrate_verkopen_historie.py`
  (kanaalnaam/datum/pakketnummer-parsing op een kleine testworkbook) en
  voor de dedupe-/append-logica van het nieuwe `/api/verkoop`-endpoint
  (via de bestaande testopzet in `tests/test_webapp_server.py`).
- Handmatig: upload van het meegeleverde voorbeeldbestand
  (`Export-2026-09-17_0749.csv`) en controleren dat de kengetallen/tabel
  kloppen met een handmatige telling.

## Buiten scope

- Geen Excel-export vanuit de webapp terug — "geen Excel meer" was
  expliciet het uitgangspunt.
- Geen samenvoeging van pakketnummer-varianten met een `p`-suffix (bijv.
  `9.1` vs `9.1p`, de Pokon-variant) in de weergave — die verschijnen
  vooralsnog als aparte pakketnummers. Kan later alsnog, is geen
  blokkerende beslissing voor deze versie.
