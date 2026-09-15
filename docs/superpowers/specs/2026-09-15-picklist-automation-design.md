# E-commerce picklist automatisering — ontwerp (fase 1)

## Achtergrond

De e-commerce afdeling gebruikt `E-Commerce PICKLIST - IN PROGRESS.xlsm` om dagelijks
picklijsten te genereren voor het magazijn (gebieden: Koeling, Kas, Kamer, Pokon,
Dozen). Het huidige proces:

1. Bestellingen uit meerdere kanalen (Amazon, BOL, GroupON, VakantieVeilingen — Maison
   buiten beschouwing) worden aggregeert in een dagelijks `Bron.xlsm`, in een map per
   datum: `K:\E-Commerce\Orderverwerking\2_Orders\{jaar}\{DD-MM-JJJJ}\Bron.xlsm`.
   Sheet "Totaal alles" bevat per pakketnummer het totaal aantal bestellingen die dag.
2. Iemand klikt in `Bron.xlsm` op een macroknop die de aantallen-kolom kopieert, en
   plakt dat handmatig in kolom G ("AANTAL") van sheet "1. Invoer pakketaantal" in de
   picklist.
3. De picklist-sheets (2-6) berekenen via hardcoded celverwijzingen naar sheet 1
   (bijv. `=('1. Invoer pakketaantal'!G27+G28)*1+...`) hoeveel van elk item gepickt
   moet worden per gebied.

**Probleem:** stap 2 is foutgevoelig handwerk, en stap 3 is fragiel — een ingevoegde
of verplaatste rij in sheet 1 breekt de formules in de picklist-sheets stilzwijgend.

**Bevestigd tijdens verificatie:** sheet "Totaal alles" in `Bron.xlsm` bevat vrijwel
dezelfde pakkettenlijst als kolom B van "1. Invoer pakketaantal" (1041 van 1085
nummers matchen 1:1; het verschil is grotendeels nieuwere pakketnummers die nog niet
besteld zijn). Pakketsamenstelling verandert een paar keer per seizoen (zie
seizoensmappen 2020-2021, 2021-2022, 2022-2023 in `1_Invoeren`), maar er komen
**regelmatig nieuwe producten/pakketten** bij tussendoor.

## Scope fase 1

- Automatiseren van de kopieer/plak-stap (Bron.xlsm → aantallen).
- Vervangen van de fragiele hardcoded-cel formules door een onderhoudbare,
  pakketnummer-gebaseerde berekening (BOM-tabel).
- **Buiten scope (fase 2):** printen/PDF-export, de "leegmaken"-knop, en overige
  VBA-macrofunctionaliteit — die blijven ongewijzigd in het bestaande `.xlsm`-bestand.

## Componenten

### 1. BOM-tabel (`bom.csv`, in dit project)
Eenmalig geëxtraheerd uit de huidige formules in sheets 2-6. Structuur:
`pakketnummer, gebied, item, aantal_per_pakket`. Dit is het stuk dat regelmatig
bijgewerkt wordt wanneer er nieuwe producten/pakketten bijkomen — een simpele tabel,
geen Excel-formules.

### 2. Import
Zoekt automatisch de map van "vandaag":
`K:\E-Commerce\Orderverwerking\2_Orders\{jaar}\{DD-MM-JJJJ}\Bron.xlsm`, leest sheet
"Totaal alles" (pakketnummer + aantal).

### 3. Berekening + output
Matcht aantallen aan de BOM-tabel op **pakketnummer** (niet op rijpositie). Berekent
per gebied de totalen en schrijft een schoon `.xlsx`-bestand (geen VBA) naar
`C:\picklist`, met dezelfde indeling als de huidige picklist-sheets. Dit bestand wordt
dagelijks overschreven.

Reden om een nieuw, schoon bestand te schrijven i.p.v. het bestaande `.xlsm` te
bewerken: dat bestand bevat VBA-macro's en ActiveX-knoppen; scripted schrijven daarin
riskeert corruptie. Omdat printen/macro's pas in fase 2 nodig zijn, vermijden we dat
risico nu.

### 4. Trigger
Handmatig: een dubbelklik-scriptje, te starten wanneer de bestellingen binnen zijn.
Geen scheduled task.

## Foutafhandeling

- Pakketnummer in `Bron.xlsm` maar niet in de BOM-tabel → duidelijke melding (niet
  stilzwijgend negeren). Dit is de belangrijkste vangnet voor nieuwe producten.
- Pakketnummer in BOM-tabel maar niet meer in `Bron.xlsm` → aantal 0, geen melding
  nodig (normaal: niet besteld die dag).
- Ontbrekende dagmap/`Bron.xlsm` voor vandaag → duidelijke foutmelding, geen crash.

## Testen

Vóór live-gebruik: de nieuwe berekening vergelijken met de uitkomst van de huidige
Excel-formules op basis van de data van een eerdere dag, om te bevestigen dat de
BOM-omzetting correct is.

## Openstaande aandachtspunten (niet blokkerend voor fase 1)

- Werkwijze voor het bijwerken van de BOM-tabel bij nieuwe producten wordt in de
  implementatie verder uitgewerkt (bijv. hoe voeg je een nieuw pakketnummer +
  samenstelling toe).
- Fase 2 (printen/PDF) volgt later, mogelijk als losse stap bovenop het schone
  `.xlsx`-bestand of als herintegratie in het bestaande `.xlsm`.
