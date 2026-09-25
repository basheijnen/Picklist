# Ma Maison Privée — vooruitbetaling en saldo — design

## Doel

Ma Maison Privée betaalt vooruit. Orders van deze klant mogen pas worden
verstuurd als er genoeg saldo is. Dat wordt nu bijgehouden in de Excel
`K:\E-Commerce\Klanten\Ma Maison Privée\2026-2027\Facturen\Factuurtool Ma Maison Privée.xlsx`
(tabbladen Saldo, Gepland, Betalingen, Correcties, Overzicht, Prijzen, Export).
Die Excel wordt vervangen door:

1. een nieuwe pagina **"Ma Maison Privée"** in de picklist-webapp (saldo,
   betalingen, prijzen, correcties, factuuroverzicht), en
2. een automatische controle bij het inladen van de picklist: Maison
   Privée-orders zonder dekking gaan vanzelf naar de wachtlijst
   **"Maison Privée – wacht op betaling"**.

Alleen voor Ma Maison Privée (kanaal `Maison Privee`); niet generiek per
kanaal.

## Saldoberekening

**Saldo nu = som(betalingen) − som(bedrag van alle meetellende orders).**

Het saldo gaat dus omlaag zodra een order *besteld* is, niet pas bij het
versturen. Een order die in de wacht staat telt al mee; het saldo kan
daardoor negatief zijn en laat dan zien hoeveel de klant nog moet betalen.
Er wordt niet bijgehouden wat fysiek verstuurd is — het tabblad "Gepland"
uit de Excel vervalt.

### Welke orders tellen mee

Een order telt mee als:
- kanaal `Maison Privee`, én
- datum ≥ **startdatum** (instelling, standaard `2026-09-26`), én
- het ordernummer staat niet in **Correcties**, én
- niet geannuleerd (status `Cancelled`, zie onder).

Bron van de orders: `verkoop_orders.csv` (via `window.PICKLIST_VERKOOP`)
**plus** de orders uit de picklist-CSV('s) die op dat moment ingeladen
zijn, samengevoegd op `Ordernr. intern` (elke order telt één keer). Zo
werkt de controle ook als de verkoopupload van vandaag nog niet gedaan is.
Datum van een picklist-order die nog niet in de verkoopdata staat: de
kolom `Order date` uit de export als die er is, anders vandaag.

### Bedrag per order

- Pakketnummer `X` (basis, bijv. `9.1`): prijs uit de prijslijst × aantal.
- Pokon-variant `Xp` (bijv. `9.1p`): prijs van `X` + **Pokon-toeslag**
  (instelling, standaard € 6,01). De verkoopdata splitst `9.1p` al in
  `9.1` + een regel `Pokon` (ordernummer `<nr>-pokon`); voor het saldo
  telt die `Pokon`-regel als de toeslag, niet als een los pakket.
- Geen prijs in de prijslijst → de order heeft geen bedrag en is
  **altijd "wacht op betaling"** met reden "prijs ontbreekt voor pakket X"
  (zodat het saldo nooit ongemerkt te hoog is). Hij telt niet mee in de
  som van bestelde orders, maar wordt apart gemeld.

### OK of wachten

Alle meetellende orders worden gesorteerd op datum, dan op ordernummer,
en van boven naar beneden opgeteld:
- cumulatief bedrag ≤ totaal betalingen → **OK** (mag op de picklijst);
- vanaf de eerste order die niet past: die en **alle latere** orders zijn
  **wacht op betaling** (een kleine latere order kruipt niet voor).

De berekening is één pure functie
`berekenMaisonPriveeSaldo({ orders, prijzen, betalingen, correcties, instellingen })`
die het saldo en per order `{ ordernummer, bedrag, status, reden }`
teruggeeft — gebruikt door zowel de pagina als de picklist-controle. Hij
staat in een eigen bestand `webapp/dist/mmp_saldo.js` (vóór `app.js`
ingeladen in `index.html`, en met een `module.exports`-regel zodat Node
hem kan testen), zodat hij los van de rest van `app.js` te testen is.

## Geannuleerde orders

De verkoopdata slaat nu geen status op. Wijziging:
- `parseVerkoopExport` en het inladen van de picklist slaan regels met
  `Status` = `Cancelled` over (kolom optioneel: ontbreekt hij, dan telt
  alles zoals nu).
- Ordernummers die in een export als `Cancelled` staan, worden bij de
  verkoopupload meegestuurd; de server verwijdert die orders (en hun
  `-pokon`-regel) uit `verkoop_orders.csv` als ze er al in stonden.

Dit maakt ook het Verkopen-dashboard correcter.

## Picklist-koppeling

Bij het inladen van een picklist-CSV (en bij het opnieuw aanvinken van
de wachtlijst "Maison Privée – wacht op betaling"):
1. Bereken het saldo met alle bekende orders (zie boven).
2. Maison Privée-orders uit de ingeladen lijst met status "wacht op
   betaling" worden via het bestaande in-de-wacht-mechanisme naar de
   lijst **"Maison Privée – wacht op betaling"** verplaatst (aanmaken als
   hij nog niet bestaat).
3. Melding bovenaan: bijv. "Maison Privée: € 312,40 tekort — 4 orders
   wachten op betaling" (of "prijs ontbreekt voor pakket 12.3").

Na een nieuwe betaling vinkt de gebruiker de wachtlijst weer aan
(Meetellen); de tool controleert dan opnieuw en laat alleen de orders
door die nu gedekt zijn — de rest blijft in de wacht.

## Pagina "Ma Maison Privée"

- **Kop:** ontvangen, besteld, saldo nu, aantal orders dat wacht, en
  waarschuwingen (pakket zonder prijs).
- **Betalingen:** tabel (datum, omschrijving, bedrag) met toevoegen en
  verwijderen. Negatief bedrag = terugbetaling/correctie.
- **Prijzen:** tabel (pakketnummer, artikel, EAN, prijs) met toevoegen,
  aanpassen, verwijderen; bestelde pakketten zonder prijs bovenaan
  gemarkeerd.
- **Correcties:** ordernummer + reden, toevoegen en verwijderen. Start
  leeg (de twee Excel-correcties vallen al vóór de startdatum).
- **Instellingen:** startdatum en Pokon-toeslag.
- **Factuuroverzicht:** kies van/tot; per pakketnummer aantal, prijs,
  totaal, plus eindtotaal; met printknop. Zelfde meetel-regels als het
  saldo.

## Opslag

Nieuwe bestanden in de projectmap, zelfde patroon als
`verkoop_orders.csv` (server schrijft, opgenomen in `SHARED_DATA_FILES`
zodat de Back-up-knop ze met K: synct, en meegebundeld in een JS-bestand
voor de browser):

| bestand | kolommen |
|---|---|
| `mmp_prijzen.csv` | pakketnummer, artikel, ean, prijs |
| `mmp_betalingen.csv` | id, datum, omschrijving, bedrag |
| `mmp_correcties.csv` | ordernummer, reden |
| `mmp_instellingen.csv` | sleutel, waarde (`startdatum`, `pokon_toeslag`) |

Serverendpoints (in `webapp_server.py`) om elk van deze lijsten op te
slaan, met validatie: datum `JJJJ-MM-DD`, bedrag/prijs een getal, geen
lege pakket- of ordernummers, geen dubbele pakketnummers in de prijslijst.
Fout → duidelijke Nederlandse foutmelding, niets weggeschreven.

## Migratie

Eenmalig script `tools/migrate_mmp_prijzen.py`: leest tabblad Prijzen
uit de Excel en schrijft `mmp_prijzen.csv` (308 regels). Betalingen zijn
leeg; correcties worden niet overgenomen. Instellingen krijgen de
standaardwaarden.

## Testen

- **pytest:** lezen/schrijven van de vier CSV's; validatie van de
  endpoints; verwijderen van geannuleerde orders uit `verkoop_orders.csv`;
  het migratiescript (met een klein test-xlsx).
- **Saldofunctie** (`tests/mmp_saldo.test.js`, gedraaid met `node --test`;
  de eerste JS-test in dit project): vaste voorbeelden — precies genoeg saldo; één cent te
  weinig; kleine order na een order die niet past (moet ook wachten);
  ontbrekende prijs; correctie; order vóór startdatum; Pokon-variant met
  toeslag; zelfde order in verkoopdata én picklist telt één keer;
  geannuleerde order telt niet.
- **Handmatig:** app starten, een echte export inladen en controleren
  dat de juiste orders in de wacht gaan en na een betaling weer door
  mogen.
