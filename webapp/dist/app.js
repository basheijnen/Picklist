const DEPARTMENTS = ["KOELING", "KAS", "KAMER", "POKON", "DOZEN"];
const BOXES_PER_PALLET = {
  "1": 100, "2": 54, "3": 54, "4": 27, "5": 34, "6": 16, "7": 70,
  "8": 60, "9": 40, "10": 36, "11": 21, "12": 36, "13": 16,
  "14": 72, "15": 144, "16": 25, "KB": 24, "EUR40": 30,
};

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const message = document.querySelector("#message");
let messageTimeoutId = null;
function setMessage(text) {
  message.textContent = text;
  clearTimeout(messageTimeoutId);
  messageTimeoutId = text ? setTimeout(() => { message.textContent = ""; }, 10000) : null;
}
const results = document.querySelector("#results");
const emptyState = document.querySelector("#emptyState");
const printButton = document.querySelector("#printButton");
const printPakketkaartenButton = document.querySelector("#printPakketkaartenButton");
const resetPrintStatusButton = document.querySelector("#resetPrintStatusButton");
const backupButton = document.querySelector("#backupButton");
const backupStatus = document.querySelector("#backupStatus");
const pakketkaartenPanel = document.querySelector("#pakketkaartenPanel");
const packageDialog = document.querySelector("#packageDialog");
const packageForm = document.querySelector("#packageForm");
const componentRows = document.querySelector("#componentRows");
const importsPanel = document.querySelector("#importsPanel");
const importsList = document.querySelector("#importsList");
const managePackagesDialog = document.querySelector("#managePackagesDialog");
const managePackagesList = document.querySelector("#managePackagesList");
const verkoopDialog = document.querySelector("#verkoopDialog");
const nazendingDialog = document.querySelector("#nazendingDialog");
const nazendingKlantnaamField = document.querySelector("#nazendingKlantnaamField");
const nazendingKlantnaamInput = document.querySelector("#nazendingKlantnaam");
const nazendingPakketnummerInput = document.querySelector("#nazendingPakketnummer");
const nazendingPakketSuggestionsEl = document.querySelector("#nazendingPakketSuggestions");
const nazendingPakketNaamEl = document.querySelector("#nazendingPakketNaam");
const nazendingComponentRowsEl = document.querySelector("#nazendingComponentRows");
const nazendingMessage = document.querySelector("#nazendingMessage");
const nazendingDraftListEl = document.querySelector("#nazendingDraftList");
const addAnotherNazendingPakketButton = document.querySelector("#addAnotherNazendingPakketButton");
let nazendingDraft = [];
let nazendingSoort = "klacht";
// Gezet wanneer de bundel-draft automatisch is voorgevuld vanuit "Dubbele
// klanten" — bepaalt of saveNazending() de brontelling (orderCounts/
// orderNames) mag verminderen. Bij een handmatig getypte bundel (nooit
// gekoppeld aan een bestaande telling) blijft dit null en gebeurt dat niet.
let nazendingBrondata = null;
const NEW_ITEMS_GROEP = "Nieuwe artikelen:";
const IMPORTS_STORAGE_KEY = "picklist-imports-v1";
const PRINTED_PAKKETNUMMERS_STORAGE_KEY = "picklist-printed-pakketnummers-v1";
const EXTRA_DOOSNUMMERS_STORAGE_KEY = "picklist-extra-doosnummers-v1";
// Doosnummers die niet aan een bestaand pakket hangen (bijv. losse
// bundel-dozen als "Doos 12 tubes") — apart bijgehouden zodat ze toch als
// suggestie verschijnen. Bij de eerste keer starten met een paar bekende
// standaardtypes; daarna groeit de lijst vanzelf mee zodra je een nieuw
// doosnummer typt en een bundel/klacht opslaat.
function loadExtraDoosnummers() {
  try {
    const raw = localStorage.getItem(EXTRA_DOOSNUMMERS_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (_error) {
    // localStorage unavailable — start met alleen de standaardset.
  }
  return new Set(["Doos 12 tubes", "Doos 14 tubes", "Doos 16 tubes"]);
}
function saveExtraDoosnummers() {
  try {
    localStorage.setItem(EXTRA_DOOSNUMMERS_STORAGE_KEY, JSON.stringify([...extraDoosnummers]));
  } catch (_error) {
    // Best effort only, zie saveImportState.
  }
}
let extraDoosnummers = loadExtraDoosnummers();

const VERBORGEN_DOOSNUMMERS_STORAGE_KEY = "picklist-verborgen-doosnummers-v1";
// Doosnummers die wél uit echte pakketdata (BOM) komen, maar die je niet
// meer als suggestie wilt zien — bijv. een doosje dat niet meer gebruikt
// wordt. Verbergt alleen de suggestie, verandert niets aan bom.csv.
function loadVerborgenDoosnummers() {
  try {
    const raw = localStorage.getItem(VERBORGEN_DOOSNUMMERS_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (_error) {
    // localStorage unavailable — start leeg.
  }
  return new Set();
}
function saveVerborgenDoosnummers() {
  try {
    localStorage.setItem(VERBORGEN_DOOSNUMMERS_STORAGE_KEY, JSON.stringify([...verborgenDoosnummers]));
  } catch (_error) {
    // Best effort only.
  }
}
let verborgenDoosnummers = loadVerborgenDoosnummers();
let imports = [];
let editingPakketnummer = null;
let managePackagesSearchTerm = "";
let packageFormOpenedFromManageList = false;
let printedPakketnummers = new Set();

function savePrintedPakketnummers() {
  try {
    if (!printedPakketnummers.size) { localStorage.removeItem(PRINTED_PAKKETNUMMERS_STORAGE_KEY); return; }
    localStorage.setItem(PRINTED_PAKKETNUMMERS_STORAGE_KEY, JSON.stringify([...printedPakketnummers]));
  } catch (_error) {
    // localStorage unavailable — the "al geprint"-status wordt dan gewoon niet onthouden.
  }
}

function loadPrintedPakketnummers() {
  try {
    const raw = localStorage.getItem(PRINTED_PAKKETNUMMERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_error) {
    return new Set();
  }
}

function makeImportId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function saveImportState() {
  try {
    if (!imports.length) { localStorage.removeItem(IMPORTS_STORAGE_KEY); return; }
    localStorage.setItem(IMPORTS_STORAGE_KEY, JSON.stringify(imports.map((imp) => ({
      id: imp.id,
      name: imp.name,
      active: imp.active,
      orderCounts: Object.fromEntries(imp.orderCounts),
      orderNames: imp.orderNames || [],
      verkoopOrders: imp.verkoopOrders || null,
      verkoopVerstuurd: Boolean(imp.verkoopVerstuurd),
    }))));
  } catch (_error) {
    // localStorage unavailable (private browsing, quota, ...) — the session
    // just won't be remembered on reload, not fatal for the current run.
  }
}

function loadImportState() {
  try {
    const raw = localStorage.getItem(IMPORTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((imp) => ({
      id: imp.id || makeImportId(),
      name: imp.name,
      active: Boolean(imp.active),
      orderCounts: new Map(Object.entries(imp.orderCounts || {})),
      orderNames: Array.isArray(imp.orderNames) ? imp.orderNames : [],
      verkoopOrders: imp.verkoopOrders || null,
      verkoopVerstuurd: Boolean(imp.verkoopVerstuurd),
    }));
  } catch (_error) {
    return [];
  }
}

function mergedActiveOrderCounts() {
  const merged = new Map();
  imports.filter((imp) => imp.active).forEach((imp) => {
    imp.orderCounts.forEach((aantal, pakketnummer) => {
      merged.set(pakketnummer, (merged.get(pakketnummer) || 0) + aantal);
    });
  });
  return merged;
}

function addToActiveImports(pakketnummer, delta) {
  const activeImports = imports.filter((imp) => imp.active);
  if (!activeImports.length) return;
  const target = activeImports.find((imp) => imp.orderCounts.has(pakketnummer)) || activeImports[0];
  target.orderCounts.set(pakketnummer, (target.orderCounts.get(pakketnummer) || 0) + delta);
}

function subtractFromActiveImports(pakketnummer, delta) {
  let remaining = delta;
  imports.filter((imp) => imp.active).forEach((imp) => {
    if (remaining <= 0) return;
    const current = imp.orderCounts.get(pakketnummer) || 0;
    if (!current) return;
    const take = Math.min(current, remaining);
    if (take === current) imp.orderCounts.delete(pakketnummer);
    else imp.orderCounts.set(pakketnummer, current - take);
    remaining -= take;
  });
}

function createHeldImport(name) {
  const held = { id: makeImportId(), name, active: false, orderCounts: new Map(), orderNames: [] };
  imports.push(held);
  return held;
}

const TE_BUNDELEN_NAAM = "TE BUNDELEN";

// Klantnamen die vaker dan 1x voorkomen in de actieve lijsten, ongeacht
// pakketnummer — die klant heeft dan meerdere bestellingen geplaatst die
// mogelijk samen in 1 doos passen. Alfabetisch gesorteerd op naam.
// Aantal planten in één pakket van dit nummer — zelfde bron (BOM,
// KOELING/KAS/KAMER-regels) als de pakketkaart zelf gebruikt voor zijn
// "x N"-koptotaal, zodat dit overal hetzelfde getal oplevert.
function plantenPerPakket(pakketnummer) {
  return (window.PICKLIST_BOM || [])
    .filter((entry) => entry.pakketnummer === pakketnummer && ["KOELING", "KAS", "KAMER"].includes(entry.gebied))
    .reduce((sum, entry) => sum + entry.aantal_per_pakket, 0);
}

function verzamelDubbeleKlanten() {
  const perNaam = new Map();
  imports.filter((imp) => imp.active).forEach((imp) => {
    (imp.orderNames || []).forEach(({ naam, pakketnummer, kanaal }) => {
      if (!perNaam.has(naam)) perNaam.set(naam, { perPakket: new Map(), kanalen: new Set() });
      const info = perNaam.get(naam);
      info.perPakket.set(pakketnummer, (info.perPakket.get(pakketnummer) || 0) + 1);
      if (kanaal) info.kanalen.add(kanaal);
    });
  });
  const dubbel = [...perNaam.entries()]
    .map(([naam, info]) => {
      const regels = [...info.perPakket.entries()].map(([pakketnummer, aantal]) => ({ pakketnummer, aantal }));
      return {
        naam,
        kanaal: [...info.kanalen].join(" / "),
        regels,
        totaal: regels.reduce((sum, r) => sum + r.aantal, 0),
        totaalPlanten: regels.reduce((sum, r) => sum + plantenPerPakket(r.pakketnummer) * r.aantal, 0),
      };
    })
    .filter((entry) => entry.totaal >= 2);
  dubbel.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  return dubbel;
}

// Haalt precies `aantal` (pakketnummer, naam)-orderregels weg uit de actieve
// lijsten — het spiegelbeeld van subtractFromActiveImports, zodat de
// klantnaam-gegevens in sync blijven met de aantallen die verplaatst zijn.
function verwijderOrderNamen(naam, pakketnummer, aantal) {
  let resterend = aantal;
  imports.filter((imp) => imp.active).forEach((imp) => {
    if (resterend <= 0 || !imp.orderNames || !imp.orderNames.length) return;
    const behouden = [];
    imp.orderNames.forEach((entry) => {
      if (resterend > 0 && entry.naam === naam && entry.pakketnummer === pakketnummer) {
        resterend -= 1;
      } else {
        behouden.push(entry);
      }
    });
    imp.orderNames = behouden;
  });
}

function verplaatsNaarTeBundelen(geselecteerd) {
  if (!geselecteerd.length) return;
  const teBundelen = imports.find((imp) => imp.name === TE_BUNDELEN_NAAM) || createHeldImport(TE_BUNDELEN_NAAM);
  geselecteerd.forEach(({ naam, kanaal, regels }) => {
    regels.forEach(({ pakketnummer, aantal }) => {
      subtractFromActiveImports(pakketnummer, aantal);
      verwijderOrderNamen(naam, pakketnummer, aantal);
      teBundelen.orderCounts.set(pakketnummer, (teBundelen.orderCounts.get(pakketnummer) || 0) + aantal);
      if (!teBundelen.orderNames) teBundelen.orderNames = [];
      for (let i = 0; i < aantal; i += 1) teBundelen.orderNames.push({ pakketnummer, naam, kanaal });
    });
  });
  saveImportState();
  renderAll();
}

const klantDuplicatenDialog = document.querySelector("#klantDuplicatenDialog");
const klantDuplicatenListEl = document.querySelector("#klantDuplicatenList");
const klantDuplicatenKanaalFiltersEl = document.querySelector("#klantDuplicatenKanaalFilters");
let klantDuplicatenActieveKanalen = new Set();
const klantDuplicatenMessage = document.querySelector("#klantDuplicatenMessage");
const klantDuplicatenSelectAllRow = document.querySelector("#klantDuplicatenSelectAllRow");
const klantDuplicatenSelectAllCheckbox = document.querySelector("#klantDuplicatenSelectAllCheckbox");

// Zelfde kleur-toewijzing als de kanaalknoppen op de Verkopen-hoofdpagina
// (renderVerkoopKlantFilters): index in de alfabetisch gesorteerde lijst van
// alle bekende kanalen, modulo de vaste kleurenset.
function kanaalKleur(kanaal) {
  const kanalen = [...new Set((window.PICKLIST_VERKOOP || []).map((o) => o.kanaal))].sort((a, b) => a.localeCompare(b, "nl"));
  const index = kanalen.indexOf(kanaal);
  return VERKOOP_KLANT_KLEUREN[index < 0 ? 0 : index % VERKOOP_KLANT_KLEUREN.length];
}

// Korte namen (Amazon, Bol.com, iBood, ...) passen prima; lange namen worden
// initialen van elk woord — zowel spatie- als CamelCase-gescheiden, dus
// "VakantieVeilingen" → "VV" en "Maison Privee" → "MP". Alleen gebruikt in
// het PDF-overzicht, waar de ruimte het krapst is.
function kanaalAfkorting(kanaal) {
  if (!kanaal || kanaal.length <= 10) return kanaal;
  const woorden = kanaal.split(/(?=[A-Z])|\s+/).filter(Boolean);
  const afkorting = woorden.map((w) => w[0]).join("").toUpperCase();
  return afkorting.length >= 2 ? afkorting : kanaal;
}

function renderKlantDuplicatenDialog() {
  const dubbel = verzamelDubbeleKlanten();
  const packageInfo = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry]));
  klantDuplicatenListEl.replaceChildren();
  klantDuplicatenKanaalFiltersEl.replaceChildren();
  if (!dubbel.length) {
    klantDuplicatenMessage.textContent = "";
    klantDuplicatenSelectAllRow.hidden = true;
    const leeg = document.createElement("p");
    leeg.className = "klant-duplicaten-empty";
    leeg.textContent = "Geen dubbele klantnamen gevonden in de actieve lijsten.";
    klantDuplicatenListEl.append(leeg);
    return;
  }
  // Filter op kanalen blijft geldig zolang die kanalen nog voorkomen —
  // anders (nieuwe import, kanaal verdwenen) die uit de selectie halen.
  const kanalen = [...new Set(dubbel.flatMap((entry) => entry.kanaal ? entry.kanaal.split(" / ") : []))]
    .sort((a, b) => a.localeCompare(b, "nl"));
  [...klantDuplicatenActieveKanalen].forEach((kanaal) => {
    if (!kanalen.includes(kanaal)) klantDuplicatenActieveKanalen.delete(kanaal);
  });
  const zichtbaar = klantDuplicatenActieveKanalen.size
    ? dubbel.filter((entry) => entry.kanaal.split(" / ").some((k) => klantDuplicatenActieveKanalen.has(k)))
    : dubbel;
  klantDuplicatenMessage.textContent = `${zichtbaar.length} klant${zichtbaar.length === 1 ? "" : "en"} met meerdere bestellingen.`;
  klantDuplicatenSelectAllRow.hidden = false;
  klantDuplicatenKanaalFiltersEl.replaceChildren();
  kanalen.forEach((kanaal) => {
    const actief = klantDuplicatenActieveKanalen.has(kanaal);
    const knop = document.createElement("button");
    knop.type = "button";
    knop.className = `verkoop-klant-button${actief ? " is-actief" : ""}`;
    knop.style.setProperty("--klant-kleur", kanaalKleur(kanaal));
    knop.textContent = kanaal;
    knop.addEventListener("click", () => {
      if (actief) klantDuplicatenActieveKanalen.delete(kanaal);
      else klantDuplicatenActieveKanalen.add(kanaal);
      renderKlantDuplicatenDialog();
    });
    klantDuplicatenKanaalFiltersEl.append(knop);
  });
  zichtbaar.forEach((entry) => {
    // Eén regel per order i.p.v. één regel met een (xN)-suffix — zo zie je
    // in één oogopslag hoe vaak iets terugkomt, zonder een getal te lezen.
    const regelsHtml = entry.regels
      .flatMap((r) => {
        const naam = (packageInfo.get(r.pakketnummer) || {}).pakketnaam || "Onbekend pakket";
        const regel = `${escapeHtml(r.pakketnummer)} – ${escapeHtml(naam)}`;
        return Array(r.aantal).fill(regel);
      })
      .join("<br>");
    const row = document.createElement("label");
    row.className = "klant-duplicaat-row";
    row.innerHTML = `
      <input type="checkbox" checked>
      <span><span class="klant-duplicaat-naam">${escapeHtml(entry.naam)}</span>
      <button type="button" class="klant-duplicaat-bundel-button">Bundelen →</button><br>
      <span class="klant-duplicaat-regels">${regelsHtml}</span></span>
      ${entry.kanaal ? `<button type="button" class="klant-duplicaat-kanaal" style="--klant-kleur:${kanaalKleur(entry.kanaal)}" data-kanaal="${escapeHtml(entry.kanaal)}">${escapeHtml(entry.kanaal)}</button>` : ""}
      <span class="klant-duplicaat-planten">${displayNumber(entry.totaalPlanten)} planten</span>`;
    row._entry = entry;
    row.querySelector("input").addEventListener("change", updateKlantDuplicatenSelectAllState);
    row.querySelector(".klant-duplicaat-bundel-button").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      bundelKlantDirect(entry);
    });
    if (entry.kanaal) {
      row.querySelector(".klant-duplicaat-kanaal").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selecteerKlantenPerKanaal(entry.kanaal);
      });
    }
    klantDuplicatenListEl.append(row);
  });
  updateKlantDuplicatenSelectAllState();
}

// Houdt het hoofd-selectievakje in sync met de individuele rijen: aangevinkt
// als alles aan staat, leeg als niets aan staat, "indeterminate" (streepje)
// als het gemengd is.
function updateKlantDuplicatenSelectAllState() {
  const checkboxes = [...klantDuplicatenListEl.querySelectorAll(".klant-duplicaat-row input")];
  const aantalAangevinkt = checkboxes.filter((checkbox) => checkbox.checked).length;
  klantDuplicatenSelectAllCheckbox.checked = checkboxes.length > 0 && aantalAangevinkt === checkboxes.length;
  klantDuplicatenSelectAllCheckbox.indeterminate = aantalAangevinkt > 0 && aantalAangevinkt < checkboxes.length;
}

// Klik op een kanaal-badge selecteert (of deselecteert) in één keer alle
// klanten met datzelfde kanaal — handig als je bijv. alleen Bol.com wilt
// bundelen zonder elke klant apart aan te vinken.
function selecteerKlantenPerKanaal(kanaal) {
  const checkboxes = [...klantDuplicatenListEl.querySelectorAll(".klant-duplicaat-row")]
    .filter((row) => row._entry.kanaal.split(" / ").includes(kanaal))
    .map((row) => row.querySelector("input"));
  if (!checkboxes.length) return;
  const alleAangevinkt = checkboxes.every((checkbox) => checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = !alleAangevinkt; });
  updateKlantDuplicatenSelectAllState();
}

function openKlantDuplicatenDialog() {
  klantDuplicatenActieveKanalen = new Set();
  renderKlantDuplicatenDialog();
  if (!klantDuplicatenDialog.open) klantDuplicatenDialog.showModal();
}

// Print/PDF-overzicht van precies de aangevinkte klanten op dit moment —
// niets aangevinkt is dus ook niets op het overzicht, geen impliciete
// "alles" als er niet expliciet geselecteerd is.
function printKlantOverzicht() {
  const geselecteerd = [...klantDuplicatenListEl.querySelectorAll(".klant-duplicaat-row")]
    .filter((row) => row.querySelector("input").checked)
    .map((row) => row._entry);
  if (!geselecteerd.length) {
    klantDuplicatenMessage.textContent = "Selecteer eerst minstens één klant om een overzicht van te maken.";
    return;
  }
  const packageInfo = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry]));
  const rijenHtml = geselecteerd
    .map((entry) => {
      // Eén regel per order, net als in de dialoog zelf — geen (xN)-suffix.
      const regelsHtml = entry.regels
        .flatMap((r) => {
          const naam = (packageInfo.get(r.pakketnummer) || {}).pakketnaam || "Onbekend pakket";
          return Array(r.aantal).fill(`${escapeHtml(r.pakketnummer)} – ${escapeHtml(naam)}`);
        })
        .join("<br>");
      const kanaalHtml = entry.kanaal
        ? entry.kanaal.split(" / ").map((k) => `<span class="klant-overzicht-kanaal" style="--klant-kleur:${kanaalKleur(k)}" title="${escapeHtml(k)}">${escapeHtml(kanaalAfkorting(k))}</span>`).join(" ")
        : "—";
      return `<tr>
        <td class="klant-overzicht-naam">${escapeHtml(entry.naam)}</td>
        <td>${kanaalHtml}</td>
        <td>${regelsHtml}</td>
        <td class="klant-overzicht-planten">${displayNumber(entry.totaalPlanten)}</td>
      </tr>`;
    })
    .join("");
  document.querySelector("#klantOverzichtPanel").innerHTML = `
    <div class="klant-overzicht">
      <header class="klant-overzicht-header">
        <h1>Te bundelen klanten</h1>
        <p>${formatLongDate(new Date())} — ${geselecteerd.length} klant${geselecteerd.length === 1 ? "" : "en"}</p>
      </header>
      <table class="klant-overzicht-table">
        <thead><tr><th>Klant</th><th>Kanaal</th><th>Pakketten</th><th>Planten</th></tr></thead>
        <tbody>${rijenHtml}</tbody>
      </table>
    </div>`;
  klantDuplicatenDialog.close();
  document.body.classList.add("printing-klantoverzicht");
  window.print();
}
const NAZENDINGEN_STORAGE_KEY = "picklist-nazendingen-v1";
let nazendingen = [];
let verkoopSort = { kolom: "aantal", richting: "desc" };
let verkoopActiefKanaal = "";
let verkoopView = "kalender";
// Los van de Van/Tot-velden: alleen het seizoensmenu zelf verandert dit —
// een tegel als "Vandaag"/"Deze week" mag Van/Tot best naar buiten het
// bekeken seizoen zetten (voor de tabel-filter) zonder dat de titel, de
// tegels, de kanaalknoppen of het kalenderoverzicht meespringen.
let verkoopActiefSeizoen = "";

// A klacht is active by default; older saved records simply have no
// `active` field at all, which should still mean "counts".
function activeNazendingen() {
  return nazendingen.filter((nz) => nz.active !== false);
}

function saveNazendingen() {
  try {
    if (!nazendingen.length) { localStorage.removeItem(NAZENDINGEN_STORAGE_KEY); return; }
    localStorage.setItem(NAZENDINGEN_STORAGE_KEY, JSON.stringify(nazendingen));
  } catch (_error) {
    // See saveImportState — best effort only.
  }
}

function loadNazendingen() {
  try {
    const raw = localStorage.getItem(NAZENDINGEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function resetImport() {
  imports = [];
  nazendingen = [];
  saveImportState();
  saveNazendingen();
  renderAll();
  setMessage("");
}

function populateGroepOptions(gebied, select) {
  const previous = select.value;
  select.replaceChildren(new Option("Nieuw (onderaan de lijst)", ""));
  const firstSeenVolgorde = new Map();
  (window.PICKLIST_BOM || []).forEach((entry) => {
    if (entry.gebied !== gebied || !entry.groep || entry.groep === NEW_ITEMS_GROEP) return;
    if (!firstSeenVolgorde.has(entry.groep) || entry.volgorde < firstSeenVolgorde.get(entry.groep)) {
      firstSeenVolgorde.set(entry.groep, entry.volgorde);
    }
  });
  [...firstSeenVolgorde.entries()]
    .sort((a, b) => a[1] - b[1])
    .forEach(([groep]) => select.add(new Option(groep, groep)));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function createComponentRow() {
  const row = document.createElement("div");
  row.className = "component-row";
  row.innerHTML = `
    <label>Plant / artikel<input class="component-item" required placeholder="Naam"></label>
    <label>Soort<input class="component-kind" placeholder="Optioneel"></label>
    <label>Aantal<input class="component-amount" type="number" min="1" step="1" value="1" required></label>
    <label>Waar?<select class="component-area" required><option>KOELING</option><option>KAS</option><option>KAMER</option></select></label>
    <label>Categorie<select class="component-groep"></select></label>
    <button class="remove-component" type="button" aria-label="Regel verwijderen">×</button>`;
  const areaSelect = row.querySelector(".component-area");
  const groepSelect = row.querySelector(".component-groep");
  populateGroepOptions(areaSelect.value, groepSelect);
  areaSelect.addEventListener("change", () => populateGroepOptions(areaSelect.value, groepSelect));
  const amountInput = row.querySelector(".component-amount");
  amountInput.addEventListener("input", () => {
    // Getypte komma's/punten meteen afronden — dit veld mag nooit decimalen tonen.
    if (amountInput.value && !Number.isInteger(Number(amountInput.value))) {
      amountInput.value = Math.max(1, Math.round(Number(amountInput.value)) || 1);
    }
  });
  row.querySelector(".remove-component").addEventListener("click", () => {
    if (componentRows.children.length > 1) row.remove();
  });
  componentRows.append(row);
}

function syncPokonAmountField() {
  const pokonSelect = document.querySelector("#newPackagePokon");
  const amountField = document.querySelector("#newPackagePokonAmount");
  const pokonDoosField = document.querySelector("#newPackagePokonDoos");
  const pakketnummer = document.querySelector("#newPackageNumber").value.trim();
  const isPVariant = /p$/i.test(pakketnummer);

  // Bewerken van een bestaand basispakket kan nooit een p-variant aanmaken
  // (dat gebeurt alleen bij het aanmaken van een nieuw pakket) — Pokon is dan
  // dus niet relevant en het hele blok verdwijnt. Bewerk je de p-variant
  // zelf, dan blijven "Welke Pokon?"/"Aantal Pokon" bruikbaar om die te
  // wijzigen, maar is er geen apart doosnummer-veld nodig: dit pakket hééft
  // al zijn eigen "Doosnummer(s)" hierboven.
  document.querySelector("#pokonVariantBox").hidden = Boolean(editingPakketnummer) && !isPVariant;
  document.querySelector("#pokonVariantDoosField").hidden = Boolean(editingPakketnummer);
  document.querySelector("#pokonVariantHint").textContent = editingPakketnummer
    ? "De Pokon van deze pakketvariant."
    : 'Kies een Pokon om automatisch een apart "…p"-pakket met dezelfde inhoud + Pokon aan te maken. Dit pakket zelf blijft zonder Pokon.';

  if (pokonSelect.value) {
    amountField.disabled = false;
    if (!amountField.value) amountField.value = 1;
    pokonDoosField.disabled = false;
  } else {
    amountField.disabled = true;
    amountField.value = "";
    pokonDoosField.disabled = true;
    pokonDoosField.value = "";
  }
  const maaktPokonVariantAan = Boolean(pokonSelect.value) && pakketnummer && !editingPakketnummer && !isPVariant;
  document.querySelector("#pokonVariantPreview").textContent = maaktPokonVariantAan ? `→ wordt aangemaakt als ${pakketnummer}p` : "";
}

function getPakketnummerList() {
  return [...(window.PICKLIST_PACKAGES || [])]
    .map((entry) => entry.pakketnummer)
    .sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
}

function getDoosnummerList() {
  const doosnummers = new Set();
  (window.PICKLIST_PACKAGES || []).forEach((entry) => {
    (entry.doosnummers || "").split("+").forEach((deel) => {
      const doosnummer = deel.trim();
      if (doosnummer) doosnummers.add(doosnummer);
    });
  });
  return [...doosnummers].sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
}

// Reused for both the normal doosnummer field and the Pokon-variant's own
// doosnummer field: shows every known box number on click/focus (there's no
// point filtering — a box number doesn't have a "search term" the way a
// pakketnummer does) and closes as soon as you start typing.
function wireDoosnummerSuggestions(inputEl, listEl, lijstFn = getDoosnummerList) {
  const hide = () => { listEl.hidden = true; listEl.replaceChildren(); };
  const render = () => {
    const alleDoosnummers = lijstFn();
    if (!alleDoosnummers.length) { hide(); return; }
    listEl.replaceChildren();
    alleDoosnummers.forEach((doosnummer) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = doosnummer;
      // mousedown (not click) fires before the input's blur, so the list is
      // still there to read from when the handler runs.
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        inputEl.value = doosnummer;
        hide();
      });
      item.append(button);
      // Bij deze lijst (Klacht/Bundel-doosveld) is elk doosnummer weg te
      // halen uit de suggesties — zelf toegevoegde verdwijnen helemaal,
      // "echte" (uit bom.csv) worden alleen verborgen: bom.csv zelf blijft
      // ongewijzigd, mocht het nummer ooit weer gebruikt worden.
      if (lijstFn === getKnownDoosnummers) {
        const verwijderButton = document.createElement("button");
        verwijderButton.type = "button";
        verwijderButton.className = "nazending-doosnummer-verwijder";
        verwijderButton.textContent = "×";
        verwijderButton.setAttribute("aria-label", `Doosnummer ${doosnummer} verwijderen uit suggesties`);
        verwijderButton.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (extraDoosnummers.has(doosnummer)) {
            extraDoosnummers.delete(doosnummer);
            saveExtraDoosnummers();
          } else {
            verborgenDoosnummers.add(doosnummer);
            saveVerborgenDoosnummers();
          }
          render();
        });
        item.append(verwijderButton);
      }
      listEl.append(item);
    });
    listEl.hidden = false;
  };
  inputEl.addEventListener("focus", render);
  inputEl.addEventListener("click", render);
  inputEl.addEventListener("input", hide);
  inputEl.addEventListener("blur", hide);
}

function updatePackageNavButtons(pakketnummer) {
  const nav = document.querySelector(".package-nav");
  const prevButton = document.querySelector("#prevPackageButton");
  const nextButton = document.querySelector("#nextPackageButton");
  const copyButton = document.querySelector("#copyPackageButton");
  const list = getPakketnummerList();
  const index = list.indexOf(pakketnummer);
  const showNav = Boolean(editingPakketnummer) && index !== -1 && list.length > 1;
  const showCopy = Boolean(editingPakketnummer);
  nav.hidden = !showNav && !showCopy;
  prevButton.hidden = !showNav;
  nextButton.hidden = !showNav;
  copyButton.hidden = !showCopy;
  if (showNav) {
    prevButton.disabled = index <= 0;
    nextButton.disabled = index >= list.length - 1;
  }
}

function navigatePackage(step) {
  const list = getPakketnummerList();
  const index = list.indexOf(editingPakketnummer);
  if (index === -1) return;
  const nextIndex = index + step;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  openEditPackageForm(list[nextIndex]);
}

// Turns the currently open edit form into a "nieuw pakket"-form without
// touching any of the filled-in fields, so je alles (planten, doosnummer,
// Pokon) kan hergebruiken en alleen het pakketnummer hoeft aan te passen —
// bijvoorbeeld om van 110.9 een 110.9p met Pokon te maken.
function copyCurrentPackage() {
  const gekopieerdPakketnummer = editingPakketnummer;
  editingPakketnummer = null;
  const numberInput = document.querySelector("#newPackageNumber");
  numberInput.disabled = false;
  numberInput.value = gekopieerdPakketnummer || "";
  document.querySelector("#packageDialogTitle").textContent = "Nieuw pakket toevoegen";
  document.querySelector("#savePackageButton").textContent = "Pakket opslaan";
  document.querySelector("#packageFormMessage").textContent = "";
  updatePackageNavButtons("");
  numberInput.focus();
  // Cursor achteraan zetten in plaats van de hele waarde te selecteren, zodat
  // je meteen kan doortypen (bijv. een "p" achter het gekopieerde nummer).
  numberInput.setSelectionRange(numberInput.value.length, numberInput.value.length);
  syncPokonAmountField();
}

function openPackageForm(pakketnummer = "") {
  editingPakketnummer = null;
  packageForm.reset();
  componentRows.replaceChildren();
  createComponentRow();
  document.querySelector("#newPackageNumber").value = pakketnummer;
  document.querySelector("#newPackageNumber").disabled = false;
  syncPokonAmountField();
  document.querySelector("#packageDialogTitle").textContent = "Nieuw pakket toevoegen";
  document.querySelector("#savePackageButton").textContent = "Pakket opslaan";
  document.querySelector("#packageFormMessage").textContent = "";
  updatePackageNavButtons(pakketnummer);
  if (!packageDialog.open) packageDialog.showModal();
  document.querySelector("#newPackageNumber").focus();
}

function openEditPackageForm(pakketnummer) {
  const info = (window.PICKLIST_PACKAGES || []).find((entry) => entry.pakketnummer === pakketnummer);
  if (!info) return;
  const relatedEntries = (window.PICKLIST_BOM || []).filter((entry) => entry.pakketnummer === pakketnummer);
  const components = relatedEntries.filter((entry) => ["KOELING", "KAS", "KAMER"].includes(entry.gebied));
  const pokonEntry = relatedEntries.find((entry) => entry.gebied === "POKON");
  const doosEntries = relatedEntries.filter((entry) => entry.gebied === "DOZEN");

  editingPakketnummer = pakketnummer;
  packageForm.reset();
  componentRows.replaceChildren();
  (components.length ? components : [null]).forEach((entry) => {
    createComponentRow();
    if (!entry) return;
    const row = componentRows.lastElementChild;
    row.querySelector(".component-item").value = entry.item;
    row.querySelector(".component-kind").value = entry.soort;
    row.querySelector(".component-amount").value = entry.aantal_per_pakket;
    const areaSelect = row.querySelector(".component-area");
    areaSelect.value = entry.gebied;
    const groepSelect = row.querySelector(".component-groep");
    populateGroepOptions(areaSelect.value, groepSelect);
    groepSelect.value = entry.groep === NEW_ITEMS_GROEP ? "" : entry.groep;
  });
  document.querySelector("#newPackageNumber").value = pakketnummer;
  document.querySelector("#newPackageNumber").disabled = true;
  document.querySelector("#newPackageName").value = info.pakketnaam;
  document.querySelector("#newPackageBoxes").value = doosEntries.map((entry) => entry.item).join(" + ");
  document.querySelector("#newPackagePokon").value = pokonEntry ? pokonEntry.item : "";
  document.querySelector("#newPackagePokonAmount").value = pokonEntry ? pokonEntry.aantal_per_pakket : "";
  syncPokonAmountField();
  document.querySelector("#packageDialogTitle").textContent = "Pakket bewerken";
  document.querySelector("#savePackageButton").textContent = "Wijzigingen opslaan";
  document.querySelector("#packageFormMessage").textContent = "";
  updatePackageNavButtons(pakketnummer);
  if (!packageDialog.open) packageDialog.showModal();
}

function closePackageDialogAndReturn() {
  packageDialog.close();
  if (!packageFormOpenedFromManageList) return;
  packageFormOpenedFromManageList = false;
  document.querySelector("#managePackagesSearch").value = managePackagesSearchTerm;
  renderManagePackagesList(managePackagesSearchTerm);
  managePackagesDialog.showModal();
}

function renderManagePackagesList(filter = "") {
  const term = filter.trim().toLowerCase();
  const packages = [...(window.PICKLIST_PACKAGES || [])]
    .filter((entry) => !term || entry.pakketnummer.toLowerCase().includes(term) || entry.pakketnaam.toLowerCase().includes(term))
    .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true }));
  if (!packages.length) {
    managePackagesList.innerHTML = '<p class="manage-packages-empty">Geen pakketten gevonden.</p>';
    return;
  }
  managePackagesList.replaceChildren();
  packages.forEach((entry) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "manage-package-row";
    row.innerHTML = `<span class="manage-package-number">${escapeHtml(entry.pakketnummer)}</span><span class="manage-package-name">${escapeHtml(entry.pakketnaam)}</span>`;
    row.addEventListener("click", () => {
      managePackagesDialog.close();
      packageFormOpenedFromManageList = true;
      openEditPackageForm(entry.pakketnummer);
    });
    managePackagesList.append(row);
  });
}

function populatePokonOptions() {
  const select = document.querySelector("#newPackagePokon");
  const names = [...new Set((window.PICKLIST_BOM || []).filter((entry) => entry.gebied === "POKON").map((entry) => entry.item))].sort((a, b) => a.localeCompare(b, "nl"));
  names.forEach((name) => select.add(new Option(name, name)));
}

function hideNazendingPakketSuggestions() {
  nazendingPakketSuggestionsEl.hidden = true;
  nazendingPakketSuggestionsEl.replaceChildren();
}

function renderNazendingPakketSuggestions() {
  const rawValue = nazendingPakketnummerInput.value.trim();
  const query = rawValue.toLowerCase();
  const allPakketten = getPakketnummerList();
  // An exact match already has its content loaded below — keeping the
  // suggestion list open then would just sit on top of it for no reason.
  if (!query || allPakketten.includes(rawValue)) { hideNazendingPakketSuggestions(); return; }
  const matches = allPakketten.filter((pakketnummer) => pakketnummer.toLowerCase().includes(query)).slice(0, 8);
  if (!matches.length) { hideNazendingPakketSuggestions(); return; }
  nazendingPakketSuggestionsEl.replaceChildren();
  matches.forEach((pakketnummer) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = pakketnummer;
    // mousedown (not click) fires before the input's blur, so the list is
    // still there to read from when the handler runs.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      nazendingPakketnummerInput.value = pakketnummer;
      hideNazendingPakketSuggestions();
      loadNazendingComponents();
    });
    item.append(button);
    nazendingPakketSuggestionsEl.append(item);
  });
  nazendingPakketSuggestionsEl.hidden = false;
}

function openNazendingDialog(soort = "klacht") {
  nazendingSoort = soort;
  nazendingBrondata = null;
  const isBundel = soort === "bundel";
  document.querySelector("#nazendingDialogTitle").textContent = isBundel ? "Bundelpakket samenstellen" : "Klacht aanmaken";
  document.querySelector("#addAnotherNazendingPakketButton").textContent = isBundel
    ? "+ Nog een pakket toevoegen aan dit bundelpakket"
    : "+ Nog een pakket toevoegen aan deze klacht";
  document.querySelector("#saveNazendingButton").textContent = isBundel ? "Bundelpakket opslaan" : "Klacht opslaan";
  nazendingKlantnaamField.hidden = !isBundel;
  nazendingKlantnaamInput.value = "";
  nazendingDraft = [];
  renderNazendingDraftList();
  resetNazendingPakketPicker();
  nazendingMessage.textContent = "";
  if (!nazendingDialog.open) nazendingDialog.showModal();
  nazendingPakketnummerInput.focus();
}

function resetNazendingPakketPicker() {
  nazendingPakketnummerInput.value = "";
  nazendingPakketNaamEl.textContent = "";
  nazendingComponentRowsEl.replaceChildren();
  addAnotherNazendingPakketButton.hidden = true;
  hideNazendingPakketSuggestions();
}

function getKnownDoosnummers() {
  const known = new Set((window.PICKLIST_BOM || []).filter((entry) => entry.gebied === "DOZEN").map((entry) => entry.item));
  extraDoosnummers.forEach((doosnummer) => known.add(doosnummer));
  verborgenDoosnummers.forEach((doosnummer) => known.delete(doosnummer));
  return [...known].sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
}

function loadNazendingComponents() {
  const pakketnummer = nazendingPakketnummerInput.value.trim();
  nazendingComponentRowsEl.replaceChildren();
  nazendingMessage.textContent = "";
  addAnotherNazendingPakketButton.hidden = true;
  if (!pakketnummer) { nazendingPakketNaamEl.textContent = ""; return; }
  const info = (window.PICKLIST_PACKAGES || []).find((entry) => entry.pakketnummer === pakketnummer);
  const relatedEntries = (window.PICKLIST_BOM || []).filter((entry) => entry.pakketnummer === pakketnummer);
  if (!info || !relatedEntries.length) {
    nazendingPakketNaamEl.textContent = "Onbekend pakketnummer.";
    return;
  }
  nazendingPakketNaamEl.textContent = info.pakketnaam;
  addAnotherNazendingPakketButton.hidden = false;
  relatedEntries
    .slice()
    .sort((a, b) => a.volgorde - b.volgorde)
    .forEach((entry) => {
      const row = document.createElement("label");
      row.className = "nazending-component-row";
      const labelHtml = entry.gebied === "DOZEN"
        ? `Doos <div class="nazending-pakket-input-wrap nazending-doosnummer-wrap">
            <input type="text" class="nazending-doosnummer" value="${escapeHtml(entry.item)}" placeholder="Doosnummer" aria-label="Doosnummer" autocomplete="off">
            <ul class="nazending-suggestions nazending-doosnummer-suggestions" hidden></ul>
          </div>${
            nazendingSoort === "bundel"
              ? `<textarea class="nazending-tracking" rows="3" placeholder="Trackingnummer(s), één per regel bij meerdere dozen (optioneel)" aria-label="Trackingnummer(s) voor deze doos"></textarea>`
              : ""
          }`
        : `${escapeHtml(entry.item)}${entry.soort ? ` – ${escapeHtml(entry.soort)}` : ""}`;
      row.innerHTML = `
        <input type="checkbox" checked data-gebied="${escapeHtml(entry.gebied)}" data-item="${escapeHtml(entry.item)}" data-soort="${escapeHtml(entry.soort || "")}" data-groep="${escapeHtml(entry.groep || "")}" data-volgorde="${entry.volgorde}">
        <span class="nazending-component-label">${labelHtml}<small>${escapeHtml(entry.gebied)}</small></span>
        <input type="number" class="nazending-aantal" min="0" step="1" value="${Math.round(entry.aantal_per_pakket)}">`;
      const checkbox = row.querySelector("input[type=checkbox]");
      checkbox.addEventListener("change", () => row.classList.toggle("is-unchecked", !checkbox.checked));
      const doosnummerInput = row.querySelector(".nazending-doosnummer");
      if (doosnummerInput) {
        wireDoosnummerSuggestions(doosnummerInput, row.querySelector(".nazending-doosnummer-suggestions"), getKnownDoosnummers);
      }
      nazendingComponentRowsEl.append(row);
    });
}

// Bouwt dezelfde "draft data"-vorm als readCurrentNazendingSelection, maar
// automatisch uit de BOM i.p.v. handmatig aangevinkte formuliervelden —
// gebruikt om een bundel-draft voor te vullen vanuit bekende orderdata
// (Dubbele klanten), zodat je pakketnummer/inhoud niet opnieuw hoeft te
// typen of aan te vinken.
function buildBundelPakketDataUitRegel(pakketnummer, aantal) {
  const info = (window.PICKLIST_PACKAGES || []).find((entry) => entry.pakketnummer === pakketnummer);
  const relatedEntries = (window.PICKLIST_BOM || []).filter((entry) => entry.pakketnummer === pakketnummer);
  if (!info || !relatedEntries.length) return null;
  const entries = relatedEntries.map((entry) => ({
    gebied: entry.gebied,
    item: entry.item,
    soort: entry.soort,
    groep: entry.groep,
    volgorde: entry.volgorde,
    aantal: entry.gebied === "DOZEN" ? aantal : Math.round(entry.aantal_per_pakket * aantal),
    tracking: "",
  }));
  return { pakketnummer, pakketnaam: info.pakketnaam, volledig: false, entries };
}

// Opent de Bundel-dialoog al gevuld met de pakketten van één klant uit het
// "Dubbele klanten"-overzicht — geen pakketnummer meer hoeven intypen, wel
// zelf nog de doos(en)/tracking en eventueel de aantallen splitsen (bijv.
// "+ Nog een pakket toevoegen" met hetzelfde pakketnummer nogmaals, voor een
// tweede doos met een deel van het aantal).
function bundelKlantDirect(entry) {
  klantDuplicatenDialog.close();
  openNazendingDialog("bundel");
  nazendingKlantnaamInput.value = entry.naam;
  nazendingDraft = entry.regels
    .map((r) => buildBundelPakketDataUitRegel(r.pakketnummer, r.aantal))
    .filter(Boolean);
  nazendingBrondata = { naam: entry.naam };
  renderNazendingDraftList();
  // Meteen het eerste pakket openklappen om te bewerken (doos/tracking) —
  // anders staat er alleen een leeg "Pakketnummer"-veld, terwijl alles al
  // bekend is en er niets hoeft te worden ingetypt.
  if (nazendingDraft.length) switchToNazendingDraftItem(0);
}

// Reads whatever pakket is currently shown in the picker (not yet added to
// the draft list). Used both by "nog een pakket toevoegen" and by the final
// save, which folds in the last pakket without forcing an extra click.
function readCurrentNazendingSelection() {
  const pakketnummer = nazendingPakketnummerInput.value.trim();
  if (!pakketnummer) return { status: "empty" };
  const info = (window.PICKLIST_PACKAGES || []).find((entry) => entry.pakketnummer === pakketnummer);
  if (!info) return { status: "invalid", message: `Onbekend pakketnummer: ${pakketnummer}.` };
  const allRows = [...nazendingComponentRowsEl.querySelectorAll(".nazending-component-row")];
  const contentRows = allRows.filter((row) => row.querySelector("input[type=checkbox]").dataset.gebied !== "DOZEN");
  // A full resend keeps every plant/Pokon row checked — the doosnummer row
  // doesn't count towards that, since leaving the box unchecked (it ships
  // combined in another pakket's box) shouldn't turn it into a "partial" one.
  const volledig = contentRows.length > 0 && contentRows.every((row) => row.querySelector("input[type=checkbox]").checked);
  const entries = allRows
    .map((row) => {
      const checkbox = row.querySelector("input[type=checkbox]");
      const aantal = Math.round(Number(row.querySelector(".nazending-aantal").value));
      if (!checkbox.checked || !(aantal > 0)) return null;
      const doosnummerInput = row.querySelector(".nazending-doosnummer");
      const item = doosnummerInput ? doosnummerInput.value.trim() : checkbox.dataset.item;
      if (!item) return null;
      const trackingInput = row.querySelector(".nazending-tracking");
      return {
        gebied: checkbox.dataset.gebied,
        item,
        soort: checkbox.dataset.soort,
        groep: checkbox.dataset.groep,
        volgorde: Number(checkbox.dataset.volgorde),
        aantal,
        tracking: trackingInput ? trackingInput.value.trim() : "",
      };
    })
    .filter(Boolean);
  if (!entries.length) return { status: "invalid", message: `Vink minstens één regel aan met een geldig aantal voor ${pakketnummer}.` };
  return { status: "ok", data: { pakketnummer, pakketnaam: info.pakketnaam, volledig, entries } };
}

function renderNazendingDraftList() {
  nazendingDraftListEl.hidden = nazendingDraft.length === 0;
  nazendingDraftListEl.replaceChildren();
  nazendingDraft.forEach((entry, index) => {
    const stukAantal = entry.entries
      .filter((e) => ["KOELING", "KAS", "KAMER"].includes(e.gebied))
      .reduce((sum, e) => sum + e.aantal, 0);
    const summary = entry.volledig ? "volledig pakket" : `${displayNumber(stukAantal)} stuks`;
    const row = document.createElement("div");
    row.className = "nazending-draft-row";
    row.innerHTML = `<button type="button" class="nazending-draft-edit">${escapeHtml(entry.pakketnummer)} – ${escapeHtml(entry.pakketnaam)} <small>(${summary})</small></button><button type="button" class="nazending-draft-remove" aria-label="Verwijderen uit klacht">×</button>`;
    row.querySelector(".nazending-draft-edit").addEventListener("click", () => switchToNazendingDraftItem(index));
    row.querySelector(".nazending-draft-remove").addEventListener("click", () => {
      nazendingDraft.splice(index, 1);
      renderNazendingDraftList();
    });
    nazendingDraftListEl.append(row);
  });
}

// Restores checkbox/aantal/doosnummer state onto the freshly rendered rows
// for a pakket, matching by volgorde since a doosnummer's text may have
// been edited (so its item no longer matches the row's default box number).
function applyNazendingSelectionToRows(entries) {
  const byVolgorde = new Map(entries.map((entry) => [entry.volgorde, entry]));
  [...nazendingComponentRowsEl.querySelectorAll(".nazending-component-row")].forEach((row) => {
    const checkbox = row.querySelector("input[type=checkbox]");
    const match = byVolgorde.get(Number(checkbox.dataset.volgorde));
    checkbox.checked = Boolean(match);
    row.classList.toggle("is-unchecked", !checkbox.checked);
    if (!match) return;
    row.querySelector(".nazending-aantal").value = match.aantal;
    const doosnummerInput = row.querySelector(".nazending-doosnummer");
    if (doosnummerInput) doosnummerInput.value = match.item;
    const trackingInput = row.querySelector(".nazending-tracking");
    if (trackingInput) trackingInput.value = match.tracking || "";
  });
}

// Lets you switch back to editing an already-added pakket (e.g. to uncheck
// its doos after all) without losing whatever you're currently filling in —
// the pakket you're on gets folded back into the draft list first.
function switchToNazendingDraftItem(index) {
  const current = readCurrentNazendingSelection();
  if (current.status === "ok") nazendingDraft.push(current.data);
  const entry = nazendingDraft[index];
  nazendingDraft.splice(index, 1);
  renderNazendingDraftList();
  nazendingMessage.textContent = "";
  nazendingPakketnummerInput.value = entry.pakketnummer;
  loadNazendingComponents();
  applyNazendingSelectionToRows(entry.entries);
  nazendingPakketnummerInput.focus();
}

function addAnotherNazendingPakket() {
  const current = readCurrentNazendingSelection();
  if (current.status === "invalid") { nazendingMessage.textContent = current.message; return; }
  if (current.status === "empty") { nazendingMessage.textContent = "Kies eerst een pakketnummer om toe te voegen."; return; }
  nazendingDraft.push(current.data);
  nazendingMessage.textContent = "";
  renderNazendingDraftList();
  resetNazendingPakketPicker();
  nazendingPakketnummerInput.focus();
}

function saveNazending() {
  const current = readCurrentNazendingSelection();
  if (current.status === "invalid") { nazendingMessage.textContent = current.message; return; }
  const pakketten = [...nazendingDraft];
  if (current.status === "ok") pakketten.push(current.data);
  if (!pakketten.length) { nazendingMessage.textContent = "Voeg minstens één pakket toe."; return; }
  nazendingen.push({
    id: makeImportId(),
    active: true,
    soort: nazendingSoort,
    klantnaam: nazendingSoort === "bundel" ? nazendingKlantnaamInput.value.trim() : "",
    pakketnummer: pakketten.map((p) => p.pakketnummer).join(" + "),
    pakketnaam: pakketten.map((p) => p.pakketnaam).join(" + "),
    // Een bundelpakket toont nooit het pakketnummer groot boven — alleen het
    // aantal planten is relevant — dus die telt altijd als "niet volledig",
    // ongeacht welke regels zijn aangevinkt.
    volledig: nazendingSoort === "bundel" ? false : pakketten.every((p) => p.volledig),
    entries: pakketten.flatMap((p) => p.entries),
    // Kept per pakket (not just flattened into `entries`) so pakketkaarten
    // can print one card per doos: a pakket whose doos was unchecked has no
    // way to say which other box it physically ships in besides "the one
    // its bundle-mate kept", which only this per-pakket breakdown captures.
    pakketten: pakketten.map((p) => ({ pakketnummer: p.pakketnummer, pakketnaam: p.pakketnaam, entries: p.entries })),
  });
  // Een hier getypt nieuw doosnummer (niet uit de BOM, bijv. "Doos 12 tubes")
  // onthouden als extra suggestie voor volgende keren.
  const bekend = new Set(getKnownDoosnummers());
  let extraDoosnummersGewijzigd = false;
  pakketten.forEach((p) => {
    p.entries.forEach((entry) => {
      if (entry.gebied === "DOZEN" && entry.item && !bekend.has(entry.item)) {
        extraDoosnummers.add(entry.item);
        bekend.add(entry.item);
        extraDoosnummersGewijzigd = true;
      }
    });
  });
  if (extraDoosnummersGewijzigd) saveExtraDoosnummers();
  // Voorgevuld vanuit "Dubbele klanten": de eenheden die daadwerkelijk in
  // deze bundel terechtkomen (per pakketnummer het DOZEN-aantal, dat is de
  // brontelling) gaan eraf bij de actieve lijsten — zodat ze niet dubbel
  // meetellen als los pakket én als bundel. Alleen wat je zelf uit de draft
  // hebt verwijderd of niet hebt opgeslagen blijft dus gewoon actief staan.
  if (nazendingBrondata) {
    const perPakket = new Map();
    pakketten.forEach((p) => {
      const doosEntry = p.entries.find((entry) => entry.gebied === "DOZEN");
      const aantal = doosEntry ? doosEntry.aantal : 0;
      if (aantal > 0) perPakket.set(p.pakketnummer, (perPakket.get(p.pakketnummer) || 0) + aantal);
    });
    perPakket.forEach((aantal, pakketnummer) => {
      subtractFromActiveImports(pakketnummer, aantal);
      verwijderOrderNamen(nazendingBrondata.naam, pakketnummer, aantal);
    });
    saveImportState();
    nazendingBrondata = null;
  }
  saveNazendingen();
  nazendingDialog.close();
  renderAll();
}

async function saveNewPackage(event) {
  event.preventDefault();
  const pakketnummer = document.querySelector("#newPackageNumber").value.trim();
  const pakketnaam = document.querySelector("#newPackageName").value.trim();
  const doosnummers = document.querySelector("#newPackageBoxes").value.trim();
  const pokonName = document.querySelector("#newPackagePokon").value;
  const pokonAmount = Number(document.querySelector("#newPackagePokonAmount").value || 1);
  const pokonDoos = document.querySelector("#newPackagePokonDoos").value.trim();
  const formMessage = document.querySelector("#packageFormMessage");
  if (!editingPakketnummer && (window.PICKLIST_PACKAGES || []).some((entry) => entry.pakketnummer === pakketnummer)) {
    formMessage.textContent = `Pakketnummer ${pakketnummer} bestaat al.`;
    return;
  }
  const components = [...componentRows.querySelectorAll(".component-row")].map((row) => ({
    gebied: row.querySelector(".component-area").value,
    item: row.querySelector(".component-item").value.trim(),
    soort: row.querySelector(".component-kind").value.trim(),
    aantal_per_pakket: Number(row.querySelector(".component-amount").value),
    groep: row.querySelector(".component-groep").value,
  }));
  if (!pakketnummer || !pakketnaam || !doosnummers || components.some((entry) => !entry.item || !(entry.aantal_per_pakket > 0))) {
    formMessage.textContent = "Vul alle verplichte velden en geldige aantallen in.";
    return;
  }
  const onbekendeDoosnummers = (waarde) => waarde.split("+").map((deel) => deel.trim()).filter(Boolean).filter((deel) => !getDoosnummerList().includes(deel));
  const onbekendInDoosnummers = onbekendeDoosnummers(doosnummers);
  if (onbekendInDoosnummers.length) {
    const ok = await confirmDialog(`Doosnummer ${onbekendInDoosnummers.join(", ")} bestaat nog niet. Toch gebruiken?`, "Toch gebruiken");
    if (!ok) return;
  }
  // Een nieuw pakket met Pokon krijgt zelf geen Pokon-regel — in plaats
  // daarvan maakt de app automatisch de "...p"-variant aan met dezelfde
  // planteninhoud plus Pokon, zoals dat ook bij alle bestaande pakketten gaat.
  const maaktPokonVariantAan = !editingPakketnummer && pokonName && !/p$/i.test(pakketnummer);
  if (maaktPokonVariantAan) {
    if (!pokonDoos) {
      formMessage.textContent = "Vul het doosnummer voor de Pokon-variant in.";
      return;
    }
    const onbekendInPokonDoos = onbekendeDoosnummers(pokonDoos);
    if (onbekendInPokonDoos.length) {
      const ok = await confirmDialog(`Doosnummer ${onbekendInPokonDoos.join(", ")} bestaat nog niet. Toch gebruiken?`, "Toch gebruiken");
      if (!ok) return;
    }
  }
  formMessage.textContent = "Opslaan...";
  const submitButton = packageForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const postPakket = async (nummer, doos, magPokon) => {
      const url = editingPakketnummer ? `/api/pakketten/${encodeURIComponent(editingPakketnummer)}` : "/api/pakketten";
      const method = editingPakketnummer ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pakketnummer: nummer, pakketnaam, doosnummers: doos,
          pokon: magPokon && pokonName ? { naam: pokonName, aantal: pokonAmount } : null,
          components,
        }),
      });
      return { response, result: await response.json() };
    };

    const { response, result } = await postPakket(pakketnummer, doosnummers, !maaktPokonVariantAan);
    if (!response.ok) { formMessage.textContent = result.error || "Opslaan mislukt."; return; }
    if (editingPakketnummer) {
      window.PICKLIST_PACKAGES = window.PICKLIST_PACKAGES.filter((entry) => entry.pakketnummer !== editingPakketnummer);
      window.PICKLIST_BOM = window.PICKLIST_BOM.filter((entry) => entry.pakketnummer !== editingPakketnummer);
    }
    window.PICKLIST_PACKAGES.push(result.package);
    window.PICKLIST_BOM.push(...result.bom);

    let bevestiging = editingPakketnummer
      ? `Pakket ${pakketnummer} is bijgewerkt.`
      : `Pakket ${pakketnummer} is opgeslagen in bom.csv/package_info.csv.`;

    if (maaktPokonVariantAan) {
      const pPakketnummer = `${pakketnummer}p`;
      const { response: pResponse, result: pResult } = await postPakket(pPakketnummer, pokonDoos, true);
      if (!pResponse.ok) {
        bevestiging += ` Let op: Pokon-variant ${pPakketnummer} kon niet worden aangemaakt (${pResult.error || "onbekende fout"}).`;
      } else {
        window.PICKLIST_PACKAGES.push(pResult.package);
        window.PICKLIST_BOM.push(...pResult.bom);
        bevestiging += ` Pokon-variant ${pPakketnummer} is automatisch meegemaakt.`;
      }
    }

    verkoopPakketnaamMap = null;
    closePackageDialogAndReturn();
    setMessage(bevestiging);
    if (imports.length) renderAll();
  } catch (_error) {
    formMessage.textContent = "Kan de server niet bereiken. Is de app gestart via open_picklist_app.bat?";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i += 1; }
      else { quoted = !quoted; }
    } else if (char === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else { field += char; }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const KANAAL_REGIO = {
  "amazon": "BENELUX",
  "bol.com": "BENELUX",
  "groupon nl": "BENELUX",
  "groupon be": "BENELUX",
  "ibood": "BENELUX",
  "mediahuis": "BENELUX",
  "newreturns": "BENELUX",
  "vakantieveilingen": "BENELUX",
  "pvw": "BENELUX",
  "voordeelvanger": "BENELUX",
  "groupon fr": "EUROPA",
  "groupon de": "EUROPA",
  "groupon it": "EUROPA",
  "groupon es": "EUROPA",
  "limango": "EUROPA",
  "maison privee": "EUROPA",
  "westwing": "EUROPA",
  "outspot": "EUROPA",
  "veepee": "EUROPA",
  "aldi online": "ALDI",
  "essim": "BENELUX",
  "dagknaller": "BENELUX",
};

function regioVoorKanaal(kanaal) {
  return KANAAL_REGIO[String(kanaal || "").trim().toLowerCase()] || "Onbekend";
}

// Client=Amazon rows carry the marketplace in Shop ("Amazon.de", "Amazon.es",
// ...) but all count toward one "Amazon" total. Client=GroupON rows instead
// carry the *country code* in Shop ("BE", "NL", ...), which picks the
// per-country channel ("Groupon BE"). Every other client is already a
// distinct channel name as-is.
function normalizeKanaal(client, shop) {
  const trimmedClient = String(client || "").trim();
  const lowerClient = trimmedClient.toLowerCase();
  if (lowerClient === "amazon") return "Amazon";
  if (lowerClient === "groupon") {
    const land = String(shop || "").trim().toUpperCase();
    return land ? `Groupon ${land}` : "Groupon";
  }
  if (lowerClient === "tmg") return "Mediahuis";
  return trimmedClient;
}

// A pakketnummer ending in "p"/"P" means "this package, with a box of Pokon
// added" — the base package still counts as itself, and the Pokon box counts
// separately (visible per kanaal in the dashboard, never as its own pakket).
// A bare "P<nummer>" (no dot, e.g. "P004") is a fixed internal code series
// unrelated to real Pokon-with-a-package sales — ignored entirely.
function verkoopPakketPokonSplitsing(pakketnummer) {
  if (/^[Pp]\d+$/.test(pakketnummer)) return { basis: null, pokon: false };
  const metPokon = pakketnummer.match(/^(\d+\.\d+)[Pp]$/);
  if (metPokon) return { basis: metPokon[1], pokon: true };
  return { basis: pakketnummer, pokon: false };
}

function parseVerkoopExport(text) {
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error("Het CSV-bestand is leeg.");
  const header = rows[0].map((value) => value.trim());
  const kolomIndex = {
    ordernummer: header.indexOf("Ordernr. intern"),
    pakketnummer: header.indexOf("Package Number"),
    client: header.indexOf("Client"),
    shop: header.indexOf("Shop"),
  };
  if (kolomIndex.ordernummer < 0 || kolomIndex.pakketnummer < 0 || kolomIndex.client < 0) {
    throw new Error('De kolommen "Ordernr. intern", "Package Number" en "Client" zijn verplicht.');
  }
  const orders = [];
  rows.slice(1).forEach((row) => {
    const ordernummer = (row[kolomIndex.ordernummer] || "").trim();
    const pakketnummer = (row[kolomIndex.pakketnummer] || "").trim();
    if (!ordernummer || !pakketnummer) return;
    const rawClient = row[kolomIndex.client] || "";
    if (rawClient.trim().toLowerCase() === "klachten e-commerce") return;
    const client = row[kolomIndex.client] || "";
    const shop = kolomIndex.shop >= 0 ? row[kolomIndex.shop] || "" : "";
    let kanaal = normalizeKanaal(client, shop);
    if (regioVoorKanaal(kanaal) === "Onbekend") kanaal = `Onbekend: ${kanaal || "?"}`;
    const { basis, pokon } = verkoopPakketPokonSplitsing(pakketnummer);
    if (basis) orders.push({ ordernummer, kanaal, pakketnummer: basis });
    if (pokon) orders.push({ ordernummer: `${ordernummer}-pokon`, kanaal, pakketnummer: "Pokon" });
  });
  return orders;
}

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now - offsetMs).toISOString().slice(0, 10);
}

// Monday..Sunday of the week containing datumStr, as a {van, tot} range —
// used to fill in the top Van/Tot fields when "Deze week" is clicked.
function verkoopWeekBereik(datumStr) {
  const [jaar, maand, dag] = datumStr.split("-").map(Number);
  const dayNr = (new Date(jaar, maand - 1, dag).getDay() + 6) % 7;
  return { van: verkoopVerschuifDatum(datumStr, -dayNr), tot: verkoopVerschuifDatum(datumStr, 6 - dayNr) };
}

// The verkoopseizoen loopt van 1 juli t/m 30 juni — vóór juli hoort een datum
// dus bij het seizoen dat al in het voorgaande kalenderjaar begon.
function verkoopHuidigSeizoenStart(datumStr) {
  const [jaar, maand] = datumStr.split("-").map(Number);
  const seizoenJaar = maand >= 7 ? jaar : jaar - 1;
  return `${seizoenJaar}-07-01`;
}

// Eén entry per seizoen waarvoor er daadwerkelijk data is (nieuwste eerst),
// zodat een extra seizoen (zoals de historie van 2025-2026, of ooit
// 2024-2025) vanzelf als knop verschijnt zodra de orders erin staan — geen
// nieuwe code nodig om een seizoen te laten "meedoen".
function verkoopAlleSeizoenen() {
  const vandaag = todayIso();
  const starts = new Set((window.PICKLIST_VERKOOP || []).map((o) => verkoopHuidigSeizoenStart(o.datum)));
  return [...starts]
    .sort((a, b) => b.localeCompare(a))
    .map((start) => {
      const seizoenJaar = Number(start.slice(0, 4));
      const eindVanSeizoen = `${seizoenJaar + 1}-06-30`;
      // Het lopende seizoen loopt maar tot vandaag — een vorig seizoen mag
      // gewoon tot en met 30 juni, daar verandert niets meer aan.
      const tot = eindVanSeizoen > vandaag ? vandaag : eindVanSeizoen;
      return { van: start, tot, label: `${seizoenJaar}-${seizoenJaar + 1}` };
    });
}

// Titel ("Verkopen 2026-2027") en het uitklapmenu ernaast om van seizoen te
// wisselen — vervangt de eerdere rij losse knoppen onder de datumvelden,
// die te veel ruimte innamen.
function renderVerkoopSeizoenDropdown() {
  const seizoenen = verkoopAlleSeizoenen();
  const toggle = document.querySelector("#verkoopSeizoenToggle");
  const dropdown = document.querySelector("#verkoopSeizoenDropdown");
  if (!verkoopActiefSeizoen) verkoopActiefSeizoen = verkoopHuidigSeizoenStart(todayIso());

  const actieveSeizoenJaar = Number(verkoopActiefSeizoen.slice(0, 4));
  document.querySelector("#verkoopTitelSeizoen").textContent = `${actieveSeizoenJaar}-${actieveSeizoenJaar + 1}`;

  if (seizoenen.length < 2) {
    toggle.hidden = true;
    dropdown.hidden = true;
    return;
  }
  toggle.hidden = false;
  dropdown.innerHTML = seizoenen
    .map((seizoen) => {
      const actief = seizoen.van === verkoopActiefSeizoen;
      return `<li><button type="button" class="${actief ? "is-actief" : ""}" data-van="${escapeHtml(seizoen.van)}" data-tot="${escapeHtml(seizoen.tot)}">${escapeHtml(seizoen.label)}</button></li>`;
    })
    .join("");
  dropdown.querySelectorAll("button").forEach((knop) => {
    // mousedown (not click) fires before the toggle's own blur/outside-click
    // handling, so the dropdown is still there to read from.
    knop.addEventListener("mousedown", (event) => {
      event.preventDefault();
      verkoopActiefSeizoen = knop.dataset.van;
      document.querySelector("#verkoopVanDatum").value = knop.dataset.van;
      document.querySelector("#verkoopTotDatum").value = knop.dataset.tot;
      sluitVerkoopSeizoenDropdown();
      // Blijf in de weergave waar je al in zat (tabel/kalender/regio) — een
      // seizoen kiezen hoeft je niet terug te zetten naar Tabel.
      renderVerkoopDialog();
    });
  });
}

function sluitVerkoopSeizoenDropdown() {
  document.querySelector("#verkoopSeizoenDropdown").hidden = true;
  document.querySelector("#verkoopSeizoenToggle").setAttribute("aria-expanded", "false");
}

async function verstuurNaarVerkoop(imp, buttonEl) {
  if (!imp.verkoopOrders || !imp.verkoopOrders.length) return;
  buttonEl.disabled = true;
  const datum = todayIso();
  try {
    const onbekend = {};
    imp.verkoopOrders.forEach((order) => {
      if (order.kanaal.startsWith("Onbekend: ")) onbekend[order.kanaal] = (onbekend[order.kanaal] || 0) + 1;
    });

    const response = await fetch("/api/verkoop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datum, rows: imp.verkoopOrders }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Versturen naar Verkopen mislukt.");

    window.PICKLIST_VERKOOP = result.orders;
    imp.verkoopVerstuurd = true;
    saveImportState();
    renderImportsList();

    let text = `Lijst "${imp.name}" naar Verkopen gestuurd: ${result.toegevoegd} orderregels verwerkt, ${result.overgeslagen} overgeslagen (al eerder geüpload).`;
    const onbekendeNamen = Object.keys(onbekend);
    if (onbekendeNamen.length) {
      const detail = onbekendeNamen.map((naam) => `${naam} (${onbekend[naam]}×)`).join(", ");
      text += ` Let op, onbekend kanaal: ${detail}.`;
    }
    setMessage(text);
  } catch (error) {
    buttonEl.disabled = false;
    setMessage(`Kan niet naar Verkopen sturen: ${error.message}`);
  }
}

let verkoopPakketnaamMap = null;
function verkoopPakketnaam(pakketnummer) {
  if (!verkoopPakketnaamMap) {
    verkoopPakketnaamMap = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry.pakketnaam]));
  }
  return verkoopPakketnaamMap.get(pakketnummer) || "—";
}

function verkoopGefilterdeOrders() {
  const van = document.querySelector("#verkoopVanDatum").value;
  const tot = document.querySelector("#verkoopTotDatum").value;
  const kanaal = verkoopActiefKanaal;
  const zoek = document.querySelector("#verkoopZoekInput").value.trim().toLowerCase();
  return (window.PICKLIST_VERKOOP || []).filter((order) => {
    // ISO "YYYY-MM-DD" strings compare chronologically as plain strings.
    if (van && order.datum < van) return false;
    if (tot && order.datum > tot) return false;
    if (kanaal && order.kanaal !== kanaal) return false;
    if (zoek) {
      const naam = verkoopPakketnaam(order.pakketnummer).toLowerCase();
      if (!order.pakketnummer.toLowerCase().includes(zoek) && !naam.includes(zoek)) return false;
    }
    return true;
  });
}

function verkoopExporteren() {
  // Pokon telt nergens mee in de export, tenzij de Pokon-tegel zelf actief
  // is (die zet de zoekterm op exact "Pokon") — dan is dat juist wat je wil.
  const pokonGeselecteerd = document.querySelector("#verkoopZoekInput").value.trim().toLowerCase() === "pokon";
  const orders = verkoopGefilterdeOrders()
    .filter((order) => pokonGeselecteerd || order.pakketnummer !== "Pokon")
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.ordernummer.localeCompare(b.ordernummer));
  const header = ["Ordernummer", "Datum", "Kanaal", "Pakketnummer", "Pakketnaam", "Aantal"];
  // Eén rij per stuk: gemigreerde historie heeft een aantal > 1 per regel
  // (een dagtotaal uit de oude Excel), losse orders hebben altijd aantal 1 —
  // in de export moet elke regel dus precies 1 stuk voorstellen.
  const rijen = [];
  orders.forEach((order) => {
    const naam = verkoopPakketnaam(order.pakketnummer);
    for (let i = 0; i < Math.round(order.aantal); i += 1) {
      rijen.push([order.ordernummer, order.datum, order.kanaal, order.pakketnummer, naam, 1]);
    }
  });
  const csv = [header, ...rijen]
    .map((rij) => rij.map((waarde) => `"${String(waarde).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const van = document.querySelector("#verkoopVanDatum").value || "alles";
  const tot = document.querySelector("#verkoopTotDatum").value || "alles";
  const kanaalDeel = verkoopActiefKanaal ? `${verkoopActiefKanaal.replace(/[^a-z0-9]+/gi, "-")}_` : "";
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `verkopen_${kanaalDeel}${van}_tot_${tot}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderVerkoopTiles() {
  const vandaag = todayIso();
  // "Totaal seizoen" en "Europa · Benelux" volgen het seizoen dat via het
  // seizoensmenu gekozen is (verkoopActiefSeizoen) — niet de Van-datum, want
  // die verandert ook door tegels als "Vandaag"/"Deze week" en die mogen het
  // bekeken seizoen niet omgooien.
  if (!verkoopActiefSeizoen) verkoopActiefSeizoen = verkoopHuidigSeizoenStart(vandaag);
  const seizoenStart = verkoopActiefSeizoen;
  const seizoenEindVolledig = `${Number(seizoenStart.slice(0, 4)) + 1}-06-30`;
  const seizoenTot = seizoenEindVolledig > vandaag ? vandaag : seizoenEindVolledig;
  const alleOrders = (window.PICKLIST_VERKOOP || [])
    .filter((o) => !verkoopActiefKanaal || o.kanaal === verkoopActiefKanaal)
    .filter((o) => o.datum >= seizoenStart && o.datum <= seizoenTot);
  // ALDI telt niet mee in "Totaal seizoen" (en dus ook niet in Vandaag/Deze
  // week) — dat krijgt een eigen tegel, zodat de twee elkaar niet overlappen.
  const pakketOrders = alleOrders.filter((o) => o.pakketnummer !== "Pokon" && regioVoorKanaal(o.kanaal) !== "ALDI");
  const pokonOrders = alleOrders.filter((o) => o.pakketnummer === "Pokon");
  const aldiOrders = alleOrders.filter((o) => o.pakketnummer !== "Pokon" && regioVoorKanaal(o.kanaal) === "ALDI");
  const totaalSeizoen = pakketOrders.reduce((sum, o) => sum + o.aantal, 0);
  const totaalVandaag = pakketOrders.filter((o) => o.datum === vandaag).reduce((sum, o) => sum + o.aantal, 0);
  const dezeWeek = verkoopWeekBereik(vandaag);
  const totaalDezeWeek = pakketOrders.filter((o) => o.datum >= dezeWeek.van && o.datum <= dezeWeek.tot).reduce((sum, o) => sum + o.aantal, 0);
  const europa = pakketOrders.filter((o) => regioVoorKanaal(o.kanaal) === "EUROPA").reduce((sum, o) => sum + o.aantal, 0);
  const benelux = pakketOrders.filter((o) => regioVoorKanaal(o.kanaal) === "BENELUX").reduce((sum, o) => sum + o.aantal, 0);
  const aldi = aldiOrders.reduce((sum, o) => sum + o.aantal, 0);
  const totaalPokon = pokonOrders.reduce((sum, o) => sum + o.aantal, 0);

  // "Vandaag"/"Deze week" bestaan niet in een ander seizoen dan het huidige
  // — klikbaar maken zou Van/Tot naar de échte huidige datum zetten, en dus
  // opeens data uit een heel ander (het actuele) seizoen ophalen terwijl de
  // titel op het bekeken seizoen blijft staan. Alleen klikbaar (en dus met
  // van/tot) als je toch al in het actuele seizoen zit.
  const bekijktHuidigSeizoen = seizoenStart === verkoopHuidigSeizoenStart(vandaag);

  // van/tot/zoek: clicking a tile jumps the Van/Tot fields below straight to
  // what that tile is showing, instead of making you set them by hand.
  const tegels = [
    {
      label: "Totaal seizoen",
      waarde: displayNumber(totaalSeizoen),
      badge: aldi ? { label: "ALDI", waarde: displayNumber(aldi) } : null,
      van: seizoenStart, tot: seizoenTot, view: "tabel", kanaal: "",
    },
    { label: "Vandaag", waarde: displayNumber(totaalVandaag), kanaal: "", ...(bekijktHuidigSeizoen ? { van: vandaag, tot: vandaag } : {}) },
    { label: "Deze week", waarde: displayNumber(totaalDezeWeek), kanaal: "", ...(bekijktHuidigSeizoen ? { van: dezeWeek.van, tot: dezeWeek.tot } : {}) },
    { label: "Europa · Benelux", waarde: `${displayNumber(europa)} · ${displayNumber(benelux)}`, van: seizoenStart, tot: seizoenTot, view: "regio", kanaal: "" },
    { label: "Pokon", waarde: displayNumber(totaalPokon), van: seizoenStart, tot: seizoenTot, zoek: "Pokon", kanaal: "" },
  ];
  const huidigeVan = document.querySelector("#verkoopVanDatum").value;
  const huidigeTot = document.querySelector("#verkoopTotDatum").value;
  const huidigeZoek = document.querySelector("#verkoopZoekInput").value;
  const tilesEl = document.querySelector("#verkoopTiles");
  tilesEl.innerHTML = tegels
    .map((tegel) => {
      const klikbaar = tegel.van !== undefined;
      const actief = klikbaar && tegel.van === huidigeVan && tegel.tot === huidigeTot && (tegel.zoek || "") === huidigeZoek
        && (tegel.kanaal === undefined || tegel.kanaal === verkoopActiefKanaal);
      const badge = tegel.badge
        ? `<div class="verkoop-tile-badge"><span class="verkoop-tile-badge-label">${escapeHtml(tegel.badge.label)}</span><span class="verkoop-tile-badge-waarde">${escapeHtml(tegel.badge.waarde)}</span></div>`
        : "";
      return `<div class="verkoop-tile${klikbaar ? " verkoop-tile-klikbaar" : ""}${actief ? " is-actief" : ""}"><span class="verkoop-tile-label">${escapeHtml(tegel.label)}</span><span class="verkoop-tile-value">${escapeHtml(tegel.waarde)}</span>${badge}</div>`;
    })
    .join("");
  [...tilesEl.children].forEach((el, index) => {
    const tegel = tegels[index];
    if (tegel.van === undefined) return;
    el.addEventListener("click", () => {
      document.querySelector("#verkoopVanDatum").value = tegel.van;
      document.querySelector("#verkoopTotDatum").value = tegel.tot;
      document.querySelector("#verkoopZoekInput").value = tegel.zoek || "";
      if (tegel.kanaal !== undefined) verkoopActiefKanaal = tegel.kanaal;
      verkoopView = tegel.view || "tabel";
      renderVerkoopDialog();
    });
  });
}

function verkoopVerschuifDatum(datumStr, aantalDagen) {
  const [jaar, maand, dag] = datumStr.split("-").map(Number);
  const d = new Date(jaar, maand - 1, dag + aantalDagen);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const VERKOOP_KLANT_KLEUREN = [
  "#2f7058", "#a05617", "#2576a6", "#9a5a9e", "#c0392b", "#8e6b23",
  "#3d7d3d", "#5f4b8b", "#1f6f6f", "#b5651d", "#4a6fa5", "#8a3b5a",
];

function renderVerkoopKlantFilters() {
  // Kanalen zonder minstens 1 order in het gekozen seizoen (bijv. een
  // webshop die niet meer wordt gebruikt) hoeven niet steeds als knop mee
  // te blijven staan. Volgt verkoopActiefSeizoen (het seizoensmenu), niet
  // de Van-datum — die verandert ook door bijv. de "Vandaag"-tegel.
  if (!verkoopActiefSeizoen) verkoopActiefSeizoen = verkoopHuidigSeizoenStart(todayIso());
  const seizoenStart = verkoopActiefSeizoen;
  const seizoenEind = `${Number(seizoenStart.slice(0, 4)) + 1}-06-30`;
  const kanalenDitSeizoen = new Set(
    (window.PICKLIST_VERKOOP || []).filter((o) => o.datum >= seizoenStart && o.datum <= seizoenEind).map((o) => o.kanaal)
  );
  const kanalen = [...kanalenDitSeizoen].sort((a, b) => a.localeCompare(b, "nl"));
  const container = document.querySelector("#verkoopKlantFilters");
  if (!kanalen.includes(verkoopActiefKanaal)) verkoopActiefKanaal = "";
  container.innerHTML = kanalen
    .map((kanaal, index) => {
      const kleur = VERKOOP_KLANT_KLEUREN[index % VERKOOP_KLANT_KLEUREN.length];
      const actief = kanaal === verkoopActiefKanaal;
      return `<button type="button" class="verkoop-klant-button${actief ? " is-actief" : ""}" data-kanaal="${escapeHtml(kanaal)}" style="--klant-kleur:${kleur}">${escapeHtml(kanaal)}</button>`;
    })
    .join("");
  container.querySelectorAll(".verkoop-klant-button").forEach((knop) => {
    knop.addEventListener("click", () => {
      const kanaal = knop.dataset.kanaal;
      verkoopActiefKanaal = verkoopActiefKanaal === kanaal ? "" : kanaal;
      renderVerkoopDialog();
    });
  });
}

function verkoopAggregeerPerPakket(orders) {
  // Een totaalrij per pakketnummer, over alle kanalen heen opgeteld -- de
  // export (verkoopExporteren) blijft juist per order/stuk ongeaggregeerd,
  // dat verschil is bewust: de tabel is een overzicht, de export is detail.
  const groepen = new Map();
  orders.forEach((order) => {
    groepen.set(order.pakketnummer, (groepen.get(order.pakketnummer) || 0) + order.aantal);
  });
  return [...groepen.entries()].map(([pakketnummer, aantal]) => ({
    pakketnummer,
    naam: verkoopPakketnaam(pakketnummer),
    aantal,
  }));
}

function renderVerkoopTable(orders) {
  const rijen = verkoopAggregeerPerPakket(orders);
  const { kolom, richting } = verkoopSort;
  rijen.sort((a, b) => {
    const factor = richting === "asc" ? 1 : -1;
    if (kolom === "aantal") return (a.aantal - b.aantal) * factor;
    return String(a[kolom]).localeCompare(String(b[kolom]), "nl", { numeric: true }) * factor;
  });
  document.querySelector("#verkoopTableBody").innerHTML = rijen
    .map((rij) => `<tr>
      <td>${escapeHtml(rij.pakketnummer)}</td>
      <td>${escapeHtml(rij.naam)}</td>
      <td class="verkoop-col-aantal">${displayNumber(rij.aantal)}</td>
    </tr>`)
    .join("");
  const totaal = orders.reduce((sum, order) => sum + order.aantal, 0);
  document.querySelector("#verkoopTotaalCel").textContent = displayNumber(totaal);
}

// De 12 maanden (juli t/m juni) van het seizoen dat bij seizoenStartJaar
// hoort — matcht hoe het oude Excel-werkblad één kolomgroep per maand had,
// maar nu per seizoen i.p.v. hardcoded op 2026-2027.
function verkoopSeizoenMaanden(seizoenStartJaar) {
  const maanden = [];
  for (let m = 7; m <= 12; m += 1) maanden.push([seizoenStartJaar, m]);
  for (let m = 1; m <= 6; m += 1) maanden.push([seizoenStartJaar + 1, m]);
  return maanden;
}
const VERKOOP_MAAND_NAMEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

function renderVerkoopKalender() {
  const pakketOrders = (window.PICKLIST_VERKOOP || []).filter((o) => o.pakketnummer !== "Pokon" && (!verkoopActiefKanaal || o.kanaal === verkoopActiefKanaal));
  const perDag = new Map();
  pakketOrders.forEach((order) => {
    perDag.set(order.datum, (perDag.get(order.datum) || 0) + order.aantal);
  });
  // Volgt verkoopActiefSeizoen (het seizoensmenu) i.p.v. de Van-datum, die
  // ook door andere tegels ("Vandaag" e.d.) wordt aangepast.
  if (!verkoopActiefSeizoen) verkoopActiefSeizoen = verkoopHuidigSeizoenStart(todayIso());
  const seizoenStartJaar = Number(verkoopActiefSeizoen.slice(0, 4));
  document.querySelector("#verkoopKalenderView").innerHTML = verkoopSeizoenMaanden(seizoenStartJaar)
    .map(([jaar, maand]) => {
      const dagenInMaand = new Date(jaar, maand, 0).getDate();
      let totaalMaand = 0;
      const rijen = Array.from({ length: dagenInMaand }, (_, i) => {
        const dag = i + 1;
        const datum = `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
        const waarde = perDag.get(datum) || 0;
        totaalMaand += waarde;
        const isWeekend = [0, 6].includes(new Date(jaar, maand - 1, dag).getDay());
        return `<tr${isWeekend ? ' class="verkoop-kalender-weekend"' : ""}><td>${dag}-${maand}-${jaar}</td><td>${waarde ? displayNumber(waarde) : ""}</td></tr>`;
      }).join("");
      // Pad every month out to 31 rows so "Totaal" lines up on the same
      // horizontal row across all 12 columns, regardless of month length.
      const vulRijen = Array.from({ length: 31 - dagenInMaand }, () => `<tr><td>&nbsp;</td><td></td></tr>`).join("");
      return `<div class="verkoop-kalender-maand">
        <div class="verkoop-kalender-maand-titel">${escapeHtml(VERKOOP_MAAND_NAMEN[maand - 1])} ${jaar}</div>
        <table><tbody>${rijen}${vulRijen}<tr class="verkoop-kalender-totaal"><td>Totaal</td><td>${displayNumber(totaalMaand)}</td></tr></tbody></table>
      </div>`;
    })
    .join("");
}

// Fixed display order per region, matching KANAAL_REGIO's entries — shown
// even at 0 so a channel with no sales yet still has its row, like the old
// Excel's "Verkopen per pakketnummer" region breakdown did.
const VERKOOP_KANAAL_REGIO_VOLGORDE = [
  ["Groupon FR", "EUROPA"], ["Groupon DE", "EUROPA"], ["Groupon IT", "EUROPA"], ["Groupon ES", "EUROPA"],
  ["Limango", "EUROPA"], ["Maison Privee", "EUROPA"], ["WestWing", "EUROPA"], ["Outspot", "EUROPA"],
  ["VeePee", "EUROPA"],
  ["Bol.com", "BENELUX"], ["Groupon NL", "BENELUX"], ["Groupon BE", "BENELUX"], ["iBood", "BENELUX"],
  ["Mediahuis", "BENELUX"], ["NewReturns", "BENELUX"], ["VakantieVeilingen", "BENELUX"], ["PVW", "BENELUX"],
  ["Voordeelvanger", "BENELUX"], ["Amazon", "BENELUX"], ["ESSIM", "BENELUX"], ["Dagknaller", "BENELUX"],
  ["ALDI Online", "ALDI"],
];

function renderVerkoopRegio() {
  // Zelfde Van/Tot/kanaal/zoek-filter als de tabelweergave — voorheen keek
  // dit altijd naar alle data ooit, dus veranderde er niets bij het kiezen
  // van een ander seizoen.
  const pakketOrders = verkoopGefilterdeOrders().filter((o) => o.pakketnummer !== "Pokon");
  const perKanaal = new Map();
  pakketOrders.forEach((order) => {
    perKanaal.set(order.kanaal, (perKanaal.get(order.kanaal) || 0) + order.aantal);
  });
  const gekendeKanalen = new Set(VERKOOP_KANAAL_REGIO_VOLGORDE.map(([naam]) => naam));
  const onbekendeKanalen = [...perKanaal.keys()]
    .filter((kanaal) => !gekendeKanalen.has(kanaal))
    .sort((a, b) => a.localeCompare(b, "nl"));

  const sectie = (titel, kanalen) => {
    let totaal = 0;
    // Kanalen zonder omzet in de actieve periode niet meer als lege rij
    // tonen — anders staat elk seizoensoverzicht vol met klanten die daar
    // toevallig niets besteld hebben.
    const rijen = kanalen
      .filter((kanaal) => perKanaal.has(kanaal))
      .map((kanaal) => {
        const waarde = perKanaal.get(kanaal) || 0;
        totaal += waarde;
        return `<tr><td>${escapeHtml(kanaal)}</td><td>${waarde ? displayNumber(waarde) : ""}</td></tr>`;
      }).join("");
    const html = `<div class="verkoop-regio-sectie">
      <div class="verkoop-regio-titel">${escapeHtml(titel)}</div>
      <table><thead><tr><th>Klant</th><th>Totaal</th></tr></thead>
        <tbody>${rijen}<tr class="verkoop-regio-totaal"><td>Totaal</td><td>${displayNumber(totaal)}</td></tr></tbody>
      </table>
    </div>`;
    return { html, totaal };
  };

  const europa = sectie("EUROPA", VERKOOP_KANAAL_REGIO_VOLGORDE.filter(([, regio]) => regio === "EUROPA").map(([naam]) => naam));
  const benelux = sectie("BENELUX", VERKOOP_KANAAL_REGIO_VOLGORDE.filter(([, regio]) => regio === "BENELUX").map(([naam]) => naam));
  const aldi = sectie("ALDI", VERKOOP_KANAAL_REGIO_VOLGORDE.filter(([, regio]) => regio === "ALDI").map(([naam]) => naam));
  // ALDI heeft alleen omzet in 2024-2025 — in seizoenen zonder Aldi-data
  // hoeft de sectie niet leeg getoond te worden.
  let html = europa.html + benelux.html + (aldi.totaal ? aldi.html : "");

  let eindTotaalRijen = `<tr><td>Europa</td><td>${displayNumber(europa.totaal)}</td></tr><tr><td>Benelux</td><td>${displayNumber(benelux.totaal)}</td></tr>${aldi.totaal ? `<tr><td>ALDI</td><td>${displayNumber(aldi.totaal)}</td></tr>` : ""}`;
  let grandTotaal = europa.totaal + benelux.totaal + aldi.totaal;
  if (onbekendeKanalen.length) {
    const onbekend = sectie("ONBEKEND KANAAL", onbekendeKanalen);
    html += onbekend.html;
    eindTotaalRijen += `<tr><td>Onbekend</td><td>${displayNumber(onbekend.totaal)}</td></tr>`;
    grandTotaal += onbekend.totaal;
  }
  html += `<div class="verkoop-regio-sectie verkoop-regio-eindtotaal">
    <div class="verkoop-regio-titel">TOTAAL</div>
    <table><thead><tr><th>Klant</th><th>Totaal</th></tr></thead>
      <tbody>${eindTotaalRijen}<tr class="verkoop-regio-totaal"><td>Totaal</td><td>${displayNumber(grandTotaal)}</td></tr></tbody>
    </table>
  </div>`;

  document.querySelector("#verkoopRegioView").innerHTML = html;
}

function renderVerkoopDialog() {
  renderVerkoopSeizoenDropdown();
  renderVerkoopTiles();
  renderVerkoopKlantFilters();
  const gefilterd = verkoopGefilterdeOrders();
  // Pokon telt overal elders (tegels, kalenderoverzicht) apart mee, niet bij
  // de pakketten — deze totaal-chip moet daarom hetzelfde uitsluiten.
  const totaalGefilterd = gefilterd.filter((o) => o.pakketnummer !== "Pokon").reduce((sum, order) => sum + order.aantal, 0);
  document.querySelector("#verkoopFilterTotaal").textContent = `Totaal (huidige filter): ${displayNumber(totaalGefilterd)}`;
  document.querySelectorAll(".verkoop-view-button").forEach((knop) => {
    knop.classList.toggle("is-actief", knop.dataset.view === verkoopView);
  });
  document.querySelector("#verkoopTabelView").hidden = verkoopView !== "tabel";
  document.querySelector("#verkoopKalenderView").hidden = verkoopView !== "kalender";
  document.querySelector("#verkoopRegioView").hidden = verkoopView !== "regio";
  if (verkoopView === "kalender") {
    renderVerkoopKalender();
  } else if (verkoopView === "regio") {
    renderVerkoopRegio();
  } else {
    renderVerkoopTable(gefilterd);
  }
}

function readOrders(text) {
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error("Het CSV-bestand is leeg.");
  const packageIndex = rows[0].findIndex((value) => value.trim() === "Package Number");
  if (packageIndex < 0) throw new Error('De kolom "Package Number" ontbreekt.');
  const counts = new Map();
  rows.slice(1).forEach((row) => {
    const packageNumber = (row[packageIndex] || "").trim();
    if (packageNumber) counts.set(packageNumber, (counts.get(packageNumber) || 0) + 1);
  });
  return counts;
}

// Per-order (pakketnummer, naam) paren, voor het opsporen van klanten die
// vaker dan 1x in de lijst voorkomen. Oudere exports zonder "Name"-kolom
// leveren gewoon een lege lijst — het dubbele-klanten-overzicht blijft dan
// leeg voor die lijst.
function readOrderNames(text) {
  const rows = parseDelimited(text);
  if (!rows.length) return [];
  const header = rows[0].map((value) => value.trim());
  const packageIndex = header.indexOf("Package Number");
  const nameIndex = header.indexOf("Name");
  if (packageIndex < 0 || nameIndex < 0) return [];
  // "Client"/"Shop" ontbreken soms in oudere exports — dan blijft kanaal leeg,
  // net zoals parseVerkoopExport dat ook al voor de Verkopen-data toestaat.
  const clientIndex = header.indexOf("Client");
  const shopIndex = header.indexOf("Shop");
  const result = [];
  rows.slice(1).forEach((row) => {
    const pakketnummer = (row[packageIndex] || "").trim();
    const naam = (row[nameIndex] || "").trim();
    if (!pakketnummer || !naam) return;
    const kanaal = clientIndex >= 0
      ? normalizeKanaal(row[clientIndex] || "", shopIndex >= 0 ? row[shopIndex] || "" : "")
      : "";
    result.push({ pakketnummer, naam, kanaal });
  });
  return result;
}

function calculate(orderCounts) {
  const knownPackages = new Set();
  const departments = Object.fromEntries(DEPARTMENTS.map((name) => [name, new Map()]));
  const nazendingKeys = Object.fromEntries(DEPARTMENTS.map((name) => [name, new Set()]));
  (window.PICKLIST_BOM || []).forEach((entry) => {
    knownPackages.add(entry.pakketnummer);
    const orders = orderCounts.get(entry.pakketnummer) || 0;
    if (!orders || !departments[entry.gebied]) return;
    const key = `${entry.item}\u0000${entry.soort}`;
    const current = departments[entry.gebied].get(key) || { ...entry, aantal: 0 };
    current.aantal += orders * entry.aantal_per_pakket;
    departments[entry.gebied].set(key, current);
  });
  activeNazendingen().forEach((nz) => {
    nz.entries.forEach((entry) => {
      if (!departments[entry.gebied]) return;
      const key = `${entry.item}\u0000${entry.soort}`;
      const current = departments[entry.gebied].get(key) || { ...entry, aantal: 0 };
      current.aantal += entry.aantal;
      departments[entry.gebied].set(key, current);
      nazendingKeys[entry.gebied].add(key);
    });
  });
  const unknown = [...orderCounts.entries()].filter(([pakketnummer]) => !knownPackages.has(pakketnummer));
  return { departments, unknown, nazendingKeys };
}

function displayNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

function displayTwoDecimals(value) {
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatShortDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

function uniqueImportName(baseName) {
  const existingNames = new Set(imports.map((imp) => imp.name));
  if (!existingNames.has(baseName)) return baseName;
  let counter = 2;
  while (existingNames.has(`${baseName} (${counter})`)) counter += 1;
  return `${baseName} (${counter})`;
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function groupEntries(entries) {
  return [...entries.values()]
    .sort((a, b) => a.volgorde - b.volgorde || a.item.localeCompare(b.item, "nl"))
    .reduce((groups, entry) => {
      const name = entry.groep || "Overig";
      let group = groups.at(-1);
      if (!group || group.name !== name) { group = { name, entries: [] }; groups.push(group); }
      group.entries.push(entry);
      return groups;
    }, []);
}

function nazendingRowAttrs(entry, nazendingKeys) {
  const key = `${entry.item}\u0000${entry.soort}`;
  return nazendingKeys && nazendingKeys.has(key) ? ' class="has-nazending" title="Bevat een nazending"' : "";
}

function renderDepartment(name, entries, nazendingKeys) {
  const section = document.createElement("section");
  section.className = "department";
  section.dataset.department = name;
  section.hidden = true;
  const total = [...entries.values()].reduce((sum, entry) => sum + entry.aantal, 0);
  section.innerHTML = `<header class="department-header"><div><h2>${name}</h2></div><div class="department-total">${displayNumber(total)} stuks</div></header>`;
  if (!entries.size) {
    section.classList.add("is-empty");
    section.insertAdjacentHTML("beforeend", '<p class="empty-department">Geen aantallen voor deze afdeling.</p>');
    return section;
  }
  if (name === "DOZEN") {
    const sorted = [...entries.values()].sort((a, b) => a.volgorde - b.volgorde);
    let totalPallets = 0;
    let totalBoxes = 0;
    const rows = sorted.map((entry) => {
      const divisor = BOXES_PER_PALLET[entry.item];
      const palletsValue = divisor ? entry.aantal / divisor : null;
      if (palletsValue !== null) totalPallets += palletsValue;
      totalBoxes += entry.aantal;
      const pallets = palletsValue !== null ? displayNumber(palletsValue) : "?";
      return `<tr${nazendingRowAttrs(entry, nazendingKeys)}><td>${escapeHtml(entry.item)}</td><td>${pallets}</td><td>${displayNumber(entry.aantal)}</td></tr>`;
    }).join("");
    const totalRow = `<tr class="dozen-total-row"><td>Totaal</td><td>${displayTwoDecimals(totalPallets)}</td><td>${displayNumber(totalBoxes)}</td></tr>`;
    section.insertAdjacentHTML("beforeend", `<div class="table-wrap"><table><thead><tr><th>Doosnummer</th><th>Pallets</th><th>Dozen</th></tr></thead><tbody>${rows}${totalRow}</tbody></table></div>`);
    return section;
  }
  groupEntries(entries).forEach((group) => {
    const subtotal = group.entries.reduce((sum, entry) => sum + entry.aantal, 0);
    const rows = group.entries.map((entry) => `<tr${nazendingRowAttrs(entry, nazendingKeys)}><td>${escapeHtml(entry.item)}</td><td>${escapeHtml(entry.soort)}</td><td>${displayNumber(entry.aantal)}</td></tr>`).join("");
    section.insertAdjacentHTML("beforeend", `<div class="group"><div class="group-title"><span>${escapeHtml(group.name)}</span><span>${displayNumber(subtotal)}</span></div><div class="table-wrap"><table><tbody>${rows}</tbody></table></div></div>`);
  });
  return section;
}

function renderPackages(orderCounts) {
  const section = document.createElement("section");
  section.className = "department";
  section.dataset.department = "PAKKETTEN";
  const packageInfo = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry]));
  // Derived from the actual BOM rather than PackageInfo.pokon: the two are
  // extracted separately for the original data and can disagree (found:
  // packages flagged "ja" with no POKON row in bom.csv, and vice versa).
  const pokonPakketten = new Set(
    (window.PICKLIST_BOM || []).filter((entry) => entry.gebied === "POKON").map((entry) => entry.pakketnummer)
  );
  const normalRows = [...orderCounts.entries()].map(([pakketnummer, aantal]) => ({ type: "normal", pakketnummer, aantal }));
  const nazendingRows = activeNazendingen().map((nz) => ({ type: "nazending", pakketnummer: nz.pakketnummer, nz }));
  const rows = [...normalRows, ...nazendingRows]
    .sort((a, b) => {
      const cmp = a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true });
      if (cmp !== 0) return cmp;
      if (a.type === b.type) return 0;
      return a.type === "normal" ? -1 : 1;
    })
    .map((row) => {
      if (row.type === "normal") {
        const info = packageInfo.get(row.pakketnummer) || {};
        const needsPokon = pokonPakketten.has(row.pakketnummer);
        return `<tr class="${needsPokon ? "needs-pokon" : ""}">
          <td class="package-number">${escapeHtml(row.pakketnummer)}</td>
          <td class="package-name">${escapeHtml(info.pakketnaam || "Onbekende pakketnaam")}</td>
          <td class="pokon-cell">${needsPokon ? "Pokon" : ""}</td>
          <td class="package-count"><input class="package-count-input" type="number" min="0" step="1" value="${row.aantal}" data-pakketnummer="${escapeHtml(row.pakketnummer)}" aria-label="Aantal voor pakket ${escapeHtml(row.pakketnummer)}"></td>
          <td class="box-cell">${escapeHtml(info.doosnummers || "—")}</td>
          <td><button type="button" class="pakketkaart-reprint-button" data-pakketnummer="${escapeHtml(row.pakketnummer)}" title="Kaart opnieuw afdrukken" aria-label="Kaart opnieuw afdrukken voor pakket ${escapeHtml(row.pakketnummer)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 14h12v7H6z"/></svg></button></td>
        </tr>`;
      }
      const nz = row.nz;
      const info = packageInfo.get(nz.pakketnummer) || {};
      const nzContent = nz.entries.filter((entry) => ["KOELING", "KAS", "KAMER"].includes(entry.gebied));
      const stukAantal = nzContent.reduce((sum, entry) => sum + entry.aantal, 0);
      const hasPokon = nz.entries.some((entry) => entry.gebied === "POKON");
      const doosEntries = nz.entries.filter((entry) => entry.gebied === "DOZEN");
      const doosnummers = doosEntries.map((entry) => entry.item).join(" + ");
      // The badge for a "volledig" klacht shows how many boxes it actually
      // ships in — not how many pakketten were bundled into it — since
      // that's what determines whether it reads as 1 pakket or more.
      const doosAantal = doosEntries.reduce((sum, entry) => sum + entry.aantal, 0);
      const isBundel = nz.soort === "bundel";
      // Bundelpakketten tonen het pakketnummer nooit groot, ongeacht volledig.
      const toontPakketnummer = nz.volledig && !isBundel;
      const countCell = toontPakketnummer
        ? `<span class="nazending-full-badge">${doosAantal}</span>`
        : `${displayNumber(stukAantal)} stuks`;
      return `<tr class="nazending-row${isBundel ? " is-bundel" : ""}">
        <td class="package-number">${toontPakketnummer ? escapeHtml(nz.pakketnummer) : ""}</td>
        <td class="package-name">${nzContent.length ? nazendingContentNaam(nzContent) : escapeHtml(nz.pakketnaam || info.pakketnaam || "Onbekend pakket")}<span class="nazending-badge${isBundel ? " nazending-badge-bundel" : ""}">${isBundel ? "Bundelpakket" : "Nazending"}</span></td>
        <td class="pokon-cell">${hasPokon ? "Pokon" : ""}</td>
        <td class="package-count">${countCell}</td>
        <td class="box-cell">${escapeHtml(doosnummers || "—")}</td>
        <td><button type="button" class="nazending-delete-button" data-id="${escapeHtml(nz.id)}" aria-label="${isBundel ? "Bundelpakket" : "Nazending"} verwijderen">×</button></td>
      </tr>`;
    })
    .join("");
  // Each box a nazending actually ships in is its own extra package to
  // prepare — a klacht bundling two pakketten in two separate dozen counts
  // as +2, one that shares a single doos (or drops it entirely) as +1 or +0.
  const nazendingBoxes = activeNazendingen().reduce((sum, nz) => sum + nz.entries
    .filter((entry) => entry.gebied === "DOZEN")
    .reduce((boxSum, entry) => boxSum + entry.aantal, 0), 0);
  const total = [...orderCounts.values()].reduce((sum, aantal) => sum + aantal, 0) + nazendingBoxes;
  section.innerHTML = `
    <header class="department-header pakketten-header">
      <div class="pakketten-title"><h2>E-COMMERCE BESTELLING</h2><p class="picklist-date">${formatLongDate(new Date())}</p></div>
      <div class="department-total badge">${displayNumber(total)} pakketten</div>
    </header>
    <div class="table-wrap"><table>
      <thead><tr><th>Pakketnummer</th><th>Pakketnaam</th><th>Pokon</th><th>Aantal</th><th>Doosnummer(s)</th><th></th></tr></thead>
      <tbody>${rows}<tr class="package-total-row"><td>Totaal</td><td colspan="2"></td><td class="package-grand-total">${displayNumber(total)}</td><td></td><td></td></tr></tbody>
    </table></div>`;
  section.querySelector("tbody").addEventListener("change", (event) => {
    const input = event.target.closest(".package-count-input");
    if (!input) return;
    handleCountChange(input.dataset.pakketnummer, Math.max(0, Math.floor(Number(input.value) || 0)), input);
  });
  section.querySelector("tbody").addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".nazending-delete-button");
    if (deleteButton) {
      nazendingen = nazendingen.filter((nz) => nz.id !== deleteButton.dataset.id);
      saveNazendingen();
      renderAll();
      return;
    }
    const reprintButton = event.target.closest(".pakketkaart-reprint-button");
    if (reprintButton) printSinglePakketkaart(reprintButton.dataset.pakketnummer);
  });
  return section;
}

function handleCountChange(pakketnummer, newValue, input) {
  const merged = mergedActiveOrderCounts();
  const oldValue = merged.get(pakketnummer) || 0;
  if (newValue === oldValue) return;
  if (newValue > oldValue) {
    addToActiveImports(pakketnummer, newValue - oldValue);
    saveImportState();
    renderAll();
    return;
  }
  // A redundant blur/change can refire while the diff menu for this exact
  // input is already open (seen with programmatic value changes) — ignore it
  // instead of rebuilding the menu and losing whatever the user just typed.
  if (input.dataset.diffPending === String(oldValue - newValue)) return;
  openCountDiffMenu(input, pakketnummer, oldValue - newValue);
}

function closeCountDiffMenu() {
  document.querySelectorAll(".count-diff-row").forEach((row) => row.remove());
  document.querySelectorAll(".package-count-input").forEach((el) => delete el.dataset.diffPending);
}

function openCountDiffMenu(input, pakketnummer, diff) {
  closeCountDiffMenu();
  input.dataset.diffPending = String(diff);
  const row = input.closest("tr");
  const heldImports = imports.filter((imp) => !imp.active);
  const existingButtons = heldImports
    .map((imp) => `<button type="button" class="count-diff-target" data-id="${escapeHtml(imp.id)}">${escapeHtml(imp.name)}</button>`)
    .join("");
  const diffRow = document.createElement("tr");
  diffRow.className = "count-diff-row";
  diffRow.innerHTML = `<td colspan="5"><div class="count-diff-menu">
    <span>Verschil (${diff}) verplaatsen naar wachtlijst:</span>
    ${existingButtons}
    <input type="text" class="count-diff-new-name" placeholder="Nieuwe naam…">
    <button type="button" class="count-diff-new-confirm">Aanmaken &amp; verplaatsen</button>
    <button type="button" class="count-diff-cancel">Negeren</button>
  </div></td>`;
  row.insertAdjacentElement("afterend", diffRow);
  diffRow.querySelectorAll(".count-diff-target").forEach((button) => {
    button.addEventListener("click", () => finalizeDecrease(pakketnummer, diff, button.dataset.id, null));
  });
  diffRow.querySelector(".count-diff-new-confirm").addEventListener("click", () => {
    const nameInput = diffRow.querySelector(".count-diff-new-name");
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    finalizeDecrease(pakketnummer, diff, null, name);
  });
  diffRow.querySelector(".count-diff-cancel").addEventListener("click", () => finalizeDecrease(pakketnummer, diff, null, null));
}

function finalizeDecrease(pakketnummer, diff, targetImportId, newName) {
  subtractFromActiveImports(pakketnummer, diff);
  if (targetImportId || newName) {
    const target = targetImportId ? imports.find((imp) => imp.id === targetImportId) : createHeldImport(newName);
    if (target) target.orderCounts.set(pakketnummer, (target.orderCounts.get(pakketnummer) || 0) + diff);
  }
  saveImportState();
  renderAll();
}

function buildPakketkaarten(orderCounts, { includeNazendingen = true, showStickers = false } = {}) {
  const packageInfo = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry]));
  const bomByPakket = new Map();
  (window.PICKLIST_BOM || []).forEach((entry) => {
    if (!bomByPakket.has(entry.pakketnummer)) bomByPakket.set(entry.pakketnummer, []);
    bomByPakket.get(entry.pakketnummer).push(entry);
  });
  const pakketnummers = [...orderCounts.keys()].sort((a, b) => a.localeCompare(b, "nl", { numeric: true }));
  pakketkaartenPanel.replaceChildren();
  pakketnummers.forEach((pakketnummer) => {
    const info = packageInfo.get(pakketnummer);
    const entries = (bomByPakket.get(pakketnummer) || []).filter((entry) => ["KOELING", "KAS", "KAMER"].includes(entry.gebied));
    entries.sort((a, b) => a.volgorde - b.volgorde);
    const totalCount = entries.reduce((sum, entry) => sum + entry.aantal_per_pakket, 0);
    const itemsHtml = entries
      .map((entry) => `<li>${displayNumber(entry.aantal_per_pakket)} x ${escapeHtml(entry.item)}${entry.soort ? ` – ${escapeHtml(entry.soort)}` : ""}</li>`)
      .join("");
    // Het aantal stickers is het aantal pakketten (orderCounts), niet het
    // aantal planten in de kaart-header (dat komt uit de BOM en staat vast).
    const stickerAantal = orderCounts.get(pakketnummer) || 0;
    const stickersHtml = showStickers ? `${displayNumber(stickerAantal)} ${stickerAantal === 1 ? "sticker" : "stickers"}` : "";
    const card = document.createElement("div");
    card.className = "pakketkaart";
    card.innerHTML = `
      <div class="pakketkaart-label">PAKKETNUMMER:</div>
      <div class="pakketkaart-nummer">${escapeHtml(pakketnummer)}</div>
      <div class="pakketkaart-naam"><span>${escapeHtml(info ? info.pakketnaam : "Onbekend pakket")}</span><span>x ${displayNumber(totalCount)}</span></div>
      <ul class="pakketkaart-items">${itemsHtml}</ul>
      <div class="pakketkaart-footer">
        <span class="pakketkaart-stickers">${stickersHtml}</span>
        <div class="pakketkaart-doos"><span class="pakketkaart-doos-label">DOOSNUMMER:</span><span class="pakketkaart-doos-nummer">${escapeHtml(info ? info.doosnummers : "—")}</span></div>
      </div>`;
    pakketkaartenPanel.append(card);
  });
  if (includeNazendingen) activeNazendingen().forEach((nz) => appendNazendingPakketkaarten(nz, showStickers));
}

// Splits a klacht into one card per physical doos: a sub-pakket whose own
// doos was unchecked has no record of which box it ships in besides "the
// one its bundle-mate kept", so its content folds into the first doos the
// klacht has. A klacht with no doos at all becomes a single "—" card.
function groupNazendingByDoos(nz) {
  const subPakketten = nz.pakketten || [{ pakketnummer: nz.pakketnummer, entries: nz.entries }];
  const withDoos = subPakketten.map((sub) => {
    const doosEntry = sub.entries.find((entry) => entry.gebied === "DOZEN");
    return {
      pakketnummer: sub.pakketnummer,
      doosnummer: doosEntry ? doosEntry.item : null,
      doosAantal: doosEntry ? doosEntry.aantal : 0,
      tracking: doosEntry ? doosEntry.tracking || "" : "",
      content: sub.entries.filter((entry) => ["KOELING", "KAS", "KAMER"].includes(entry.gebied)),
    };
  });
  const fallbackDoos = (withDoos.find((sub) => sub.doosnummer) || {}).doosnummer || null;
  const groups = new Map();
  withDoos.forEach((sub) => {
    const key = sub.doosnummer || fallbackDoos || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sub);
  });
  return [...groups.entries()].map(([doosnummer, subs]) => ({
    doosnummer,
    // Alleen subs met een eigen doosregel tellen mee — een sub zonder eigen
    // doos rijdt gratis mee in de box van zijn bundelmaat (zie hierboven),
    // en telt dus niet als extra sticker. Geen enkele doosregel: dan is het
    // nog altijd minstens 1 fysieke doos.
    doosAantal: subs.reduce((sum, sub) => sum + (sub.doosnummer ? sub.doosAantal : 0), 0) || 1,
    tracking: (subs.find((sub) => sub.tracking) || {}).tracking || "",
    pakketnummer: subs.map((sub) => sub.pakketnummer).join(" + "),
    content: subs.flatMap((sub) => sub.content).sort((a, b) => a.volgorde - b.volgorde),
  }));
}

// Nazending cards ship only part of their original package(s), so the
// nominal pakketnaam (e.g. "Camelia x 3") can overstate what's actually in
// this box. Build the header from the real content instead, so it always
// matches the itemized list and the x-total below it.
function nazendingContentNaam(content) {
  return content
    .map((entry) => `${displayNumber(entry.aantal)} x ${escapeHtml(entry.item)}${entry.soort ? ` – ${escapeHtml(entry.soort)}` : ""}`)
    .join(" + ");
}

function appendNazendingPakketkaarten(nz, showStickers = false) {
  const isBundelNz = nz.soort === "bundel";
  groupNazendingByDoos(nz).forEach((group) => {
    const totalCount = group.content.reduce((sum, entry) => sum + entry.aantal, 0);
    const itemsHtml = group.content
      .map((entry) => `<li>${displayNumber(entry.aantal)} x ${escapeHtml(entry.item)}${entry.soort ? ` – ${escapeHtml(entry.soort)}` : ""}</li>`)
      .join("");
    const stickersHtml = showStickers ? `${displayNumber(group.doosAantal)} ${group.doosAantal === 1 ? "sticker" : "stickers"}` : "";
    // Eén doosnummer met aantal > 1 (bijv. "EUR40 x3") is 3 fysieke dozen die
    // elk hun eigen trackingnummer nodig hebben — dus één regel per nummer.
    const trackingRegels = (group.tracking || "").split("\n").map((regel) => regel.trim()).filter(Boolean);
    const isBundel = isBundelNz;
    // Bundelpakketten tonen het pakketnummer nooit groot, ongeacht nz.volledig.
    const toontPakketnummer = nz.volledig && !isBundel;
    const card = document.createElement("div");
    // An incomplete klacht has no meaningful pakketnummer or nominal naam to
    // show (see nazendingContentNaam) — only the plants being picked matter,
    // so that summary bar is dropped and the item list becomes the headline.
    card.className = `pakketkaart ${isBundel ? "pakketkaart-bundel" : "pakketkaart-nazending"}${toontPakketnummer ? "" : " pakketkaart-incomplete"}`;
    card.innerHTML = `
      <div class="pakketkaart-label">${toontPakketnummer ? "PAKKETNUMMER: " : ""}<span class="pakketkaart-nazending-badge${isBundel ? " pakketkaart-badge-bundel" : ""}">${isBundel ? "Bundelpakket" : "Nazending"}</span></div>
      <div class="pakketkaart-nummer">${toontPakketnummer ? escapeHtml(group.pakketnummer) : ""}</div>
      ${toontPakketnummer ? `<div class="pakketkaart-naam"><span>${nazendingContentNaam(group.content)}</span><span>x ${displayNumber(totalCount)}</span></div>` : ""}
      <ul class="pakketkaart-items">${itemsHtml}</ul>
      ${isBundel && nz.klantnaam ? `<div class="pakketkaart-klantnaam">${escapeHtml(nz.klantnaam)}</div>` : ""}
      <div class="pakketkaart-footer">
        <span class="pakketkaart-stickers">${stickersHtml}</span>
        <div class="pakketkaart-doos"><span class="pakketkaart-doos-label">DOOSNUMMER:</span><span class="pakketkaart-doos-nummer">${escapeHtml(group.doosnummer)}</span></div>
      </div>
      ${trackingRegels.length ? `<div class="pakketkaart-tracking"><span class="pakketkaart-doos-label">TRACKING:</span> ${trackingRegels.map(escapeHtml).join("<br>")}</div>` : ""}`;
    pakketkaartenPanel.append(card);
  });
}

async function printPakketkaarten() {
  if (!imports.length && !nazendingen.length) return;
  const orderCounts = mergedActiveOrderCounts();
  // Een pakket dat uit alle actieve lijsten is verdwenen (lijst verwijderd of
  // uitgevinkt) telt niet meer als "al geprint" — komt het later terug via
  // een nieuwe lijst, dan moet de kaart gewoon weer meeprinten.
  [...printedPakketnummers].forEach((pakketnummer) => {
    if (!orderCounts.has(pakketnummer)) printedPakketnummers.delete(pakketnummer);
  });
  const nieuweOrderCounts = new Map([...orderCounts].filter(([pakketnummer]) => !printedPakketnummers.has(pakketnummer)));
  if (!nieuweOrderCounts.size && !activeNazendingen().length) {
    setMessage("Alle pakketkaarten voor de huidige lijsten zijn al geprint.");
    return;
  }
  const showStickers = await confirmDialog(
    "Het aantal pakketten (stickers) linksonder op de kaarten zetten?",
    "Ja, stickeraantal tonen",
    { cancelLabel: "Nee, weglaten", style: "primary", title: "Pakketkaarten printen" }
  );
  buildPakketkaarten(nieuweOrderCounts, { showStickers });
  orderCounts.forEach((_aantal, pakketnummer) => printedPakketnummers.add(pakketnummer));
  savePrintedPakketnummers();
  resetPrintStatusButton.disabled = false;
  document.body.classList.add("printing-pakketkaarten");
  window.print();
}

// Handmatige herdruk van één pakketkaart — bijv. wanneer een deel van een
// wachtlijst alsnog geleverd kan worden. Negeert bewust de "al geprint"-status
// en print alleen deze ene kaart, niet de rest van de al geprinte pakketten.
async function printSinglePakketkaart(pakketnummer) {
  const aantal = mergedActiveOrderCounts().get(pakketnummer);
  if (!aantal) return;
  const showStickers = await confirmDialog(
    `Het aantal pakketten (stickers) linksonder op de kaart voor ${pakketnummer} zetten?`,
    "Ja, stickeraantal tonen",
    { cancelLabel: "Nee, weglaten", style: "primary", title: "Pakketkaart printen" }
  );
  buildPakketkaarten(new Map([[pakketnummer, aantal]]), { includeNazendingen: false, showStickers });
  printedPakketnummers.add(pakketnummer);
  savePrintedPakketnummers();
  document.body.classList.add("printing-pakketkaarten");
  window.print();
}

window.addEventListener("afterprint", () => document.body.classList.remove("printing-pakketkaarten", "printing-klantoverzicht"));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

// Styled stand-in for the native confirm() — that one shows the page's own
// URL ("127.0.0.1:8765 meldt het volgende"), which reads as a browser
// warning rather than part of the app.
function confirmDialog(message, confirmLabel = "Verwijderen", { cancelLabel = "Annuleren", style = "danger", title = "Weet je het zeker?" } = {}) {
  const dialog = document.querySelector("#confirmDialog");
  document.querySelector("#confirmDialogTitle").textContent = title;
  document.querySelector("#confirmDialogMessage").textContent = message;
  const okButton = document.querySelector("#confirmDialogOk");
  const cancelButton = document.querySelector("#confirmDialogCancel");
  okButton.textContent = confirmLabel;
  okButton.className = `button button-${style}`;
  cancelButton.textContent = cancelLabel;
  return new Promise((resolve) => {
    const closeButton = document.querySelector("#closeConfirmDialog");
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(result);
    };
    okButton.addEventListener("click", () => finish(true), { once: true });
    cancelButton.addEventListener("click", () => finish(false), { once: true });
    closeButton.addEventListener("click", () => finish(false), { once: true });
    dialog.addEventListener("close", () => finish(false), { once: true });
    dialog.showModal();
  });
}

// Asks for a name when the date-based default would collide with an
// existing import; cancelling just falls back to the suggested name
// instead of blocking the import.
function promptImportName(suggestedName) {
  const dialog = document.querySelector("#importNameDialog");
  const input = document.querySelector("#importNameDialogInput");
  input.value = suggestedName;
  return new Promise((resolve) => {
    const okButton = document.querySelector("#importNameDialogOk");
    const cancelButton = document.querySelector("#importNameDialogCancel");
    const closeButton = document.querySelector("#closeImportNameDialog");
    let settled = false;
    const onKeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); okButton.click(); } };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      input.removeEventListener("keydown", onKeydown);
      dialog.close();
      resolve(result);
    };
    okButton.addEventListener("click", () => finish(input.value.trim() || suggestedName), { once: true });
    cancelButton.addEventListener("click", () => finish(suggestedName), { once: true });
    closeButton.addEventListener("click", () => finish(suggestedName), { once: true });
    dialog.addEventListener("close", () => finish(suggestedName), { once: true });
    input.addEventListener("keydown", onKeydown);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

function renderImportsList() {
  const totalCount = imports.length + nazendingen.length;
  const activeCount = imports.filter((imp) => imp.active).length + activeNazendingen().length;
  importsPanel.hidden = totalCount === 0;
  document.querySelector("#fileName").textContent = totalCount ? `${activeCount} van ${totalCount} actief` : "—";
  if (!totalCount) { importsList.replaceChildren(); return; }
  importsList.replaceChildren();
  imports.forEach((imp) => {
    const total = [...imp.orderCounts.values()].reduce((a, b) => a + b, 0);
    const verkoopKnopHtml = !imp.verkoopOrders
      ? ""
      : imp.verkoopVerstuurd
        ? `<span class="import-verkoop-status">✓ in Verkopen</span>`
        : `<button type="button" class="import-verkoop-button">Naar Verkopen →</button>`;
    const row = document.createElement("div");
    row.className = `import-row${imp.active ? "" : " is-held"}`;
    row.innerHTML = `
      <label class="import-active-toggle"><input type="checkbox" class="import-active-checkbox" ${imp.active ? "checked" : ""}><span>Meetellen</span></label>
      <input class="import-name-input" value="${escapeHtml(imp.name)}" aria-label="Naam van lijst">
      <span class="import-meta-row"><span class="import-order-total">${displayNumber(total)} orders · ${imp.orderCounts.size} pakketten</span>${verkoopKnopHtml}</span>
      <button type="button" class="import-delete-button" aria-label="Lijst verwijderen">×</button>`;
    row.querySelector(".import-active-checkbox").addEventListener("change", (event) => {
      imp.active = event.target.checked;
      closeCountDiffMenu();
      saveImportState();
      renderAll();
    });
    row.querySelector(".import-name-input").addEventListener("change", (event) => {
      imp.name = event.target.value.trim() || imp.name;
      event.target.value = imp.name;
      saveImportState();
    });
    const verkoopButton = row.querySelector(".import-verkoop-button");
    if (verkoopButton) verkoopButton.addEventListener("click", () => verstuurNaarVerkoop(imp, verkoopButton));
    row.querySelector(".import-delete-button").addEventListener("click", async () => {
      if (!(await confirmDialog(`Lijst "${imp.name}" verwijderen?`))) return;
      imports = imports.filter((entry) => entry.id !== imp.id);
      saveImportState();
      if (imports.length || nazendingen.length) renderAll(); else resetImport();
    });
    importsList.append(row);
  });
  // Klachten count/toggle together as one group — they're all "extra
  // stuff on top of the normal order" the same way, so one Meetellen
  // switch for all of them is simpler than one per klacht. Removing a
  // specific klacht is still possible, just per-item in the sublist below.
  if (nazendingen.length) {
    const allActive = nazendingen.every((nz) => nz.active !== false);
    const totalDoos = nazendingen.reduce((sum, nz) => sum + nz.entries
      .filter((entry) => entry.gebied === "DOZEN")
      .reduce((boxSum, entry) => boxSum + entry.aantal, 0), 0);
    const someActive = nazendingen.some((nz) => nz.active !== false);
    const bundelCount = nazendingen.filter((nz) => nz.soort === "bundel").length;
    const klachtCount = nazendingen.length - bundelCount;
    const groupLabel = bundelCount && klachtCount
      ? `Klachten & bundels (${nazendingen.length})`
      : bundelCount
        ? `Bundelpakketten (${nazendingen.length})`
        : `Klachten (${nazendingen.length})`;
    const groupRow = document.createElement("div");
    groupRow.className = `import-row${allActive ? "" : " is-held"}`;
    groupRow.innerHTML = `
      <label class="import-active-toggle"><input type="checkbox" class="import-active-checkbox" ${allActive ? "checked" : ""}><span>Meetellen</span></label>
      <span class="nazending-list-label">${groupLabel}</span>
      <span class="import-order-total">${displayNumber(totalDoos)} ${totalDoos === 1 ? "doos" : "dozen"}</span>`;
    const groupCheckbox = groupRow.querySelector(".import-active-checkbox");
    groupCheckbox.indeterminate = someActive && !allActive;
    groupCheckbox.addEventListener("change", (event) => {
      nazendingen.forEach((nz) => { nz.active = event.target.checked; });
      closeCountDiffMenu();
      saveNazendingen();
      renderAll();
    });
    const klachtenGroup = document.createElement("div");
    klachtenGroup.className = "imports-group";
    klachtenGroup.append(groupRow);

    const subList = document.createElement("div");
    subList.className = "nazending-sublist";
    nazendingen.forEach((nz) => {
      const nzActive = nz.active !== false;
      const subRow = document.createElement("div");
      subRow.className = `nazending-subrow${nzActive ? "" : " is-held"}`;
      const isBundel = nz.soort === "bundel";
      subRow.innerHTML = `
        <label class="nazending-subrow-toggle"><input type="checkbox" class="import-active-checkbox" ${nzActive ? "checked" : ""}><span>${escapeHtml(nz.pakketnummer)}</span><span class="nazending-badge${isBundel ? " nazending-badge-bundel" : ""}">${isBundel ? "Bundel" : "Klacht"}</span></label>
        <button type="button" class="nazending-delete-button" aria-label="${isBundel ? "Bundelpakket" : "Klacht"} verwijderen">×</button>`;
      subRow.querySelector(".import-active-checkbox").addEventListener("change", (event) => {
        nz.active = event.target.checked;
        closeCountDiffMenu();
        saveNazendingen();
        renderAll();
      });
      subRow.querySelector(".nazending-delete-button").addEventListener("click", async () => {
        if (!(await confirmDialog(`${isBundel ? "Bundelpakket" : "Klacht"} "${nz.pakketnummer}" verwijderen?`))) return;
        nazendingen = nazendingen.filter((entry) => entry.id !== nz.id);
        saveNazendingen();
        if (imports.length || nazendingen.length) renderAll(); else resetImport();
      });
      subList.append(subRow);
    });
    klachtenGroup.append(subList);
    importsList.append(klachtenGroup);
  }
}

function renderAll() {
  if (!imports.length && !nazendingen.length) {
    importsPanel.hidden = true;
    importsList.replaceChildren();
    results.hidden = true;
    emptyState.hidden = false;
    printButton.disabled = true;
    printPakketkaartenButton.disabled = true;
    resetPrintStatusButton.disabled = true;
    document.querySelector("#klantDuplicatenButton").disabled = true;
    return;
  }
  const orderCounts = mergedActiveOrderCounts();
  const calculated = calculate(orderCounts);
  renderImportsList();
  document.querySelector("#orderCount").textContent = [...orderCounts.values()].reduce((a, b) => a + b, 0);
  document.querySelector("#klachtCount").textContent = activeNazendingen().length;
  document.querySelector("#packageCount").textContent = orderCounts.size + activeNazendingen().length;
  document.querySelector("#runDate").textContent = new Intl.DateTimeFormat("nl-NL").format(new Date());
  const tabs = document.querySelector("#departmentTabs");
  const panels = document.querySelector("#departmentPanels");
  tabs.replaceChildren(); panels.replaceChildren();
  const views = ["PAKKETTEN", ...DEPARTMENTS];
  panels.append(renderPackages(orderCounts));
  const pokonDozenPage = document.createElement("div");
  pokonDozenPage.className = "pokon-dozen-page";
  views.forEach((name, index) => {
    const tab = document.createElement("button");
    tab.type = "button"; tab.className = "tab"; tab.role = "tab";
    tab.textContent = name; tab.dataset.department = name;
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.style.setProperty("--accent", { PAKKETTEN: "#163d32", KOELING: "#2576a6", KAS: "#4e8b45", KAMER: "#9a5a9e", POKON: "#d17b2a", DOZEN: "#6f6254" }[name]);
    tab.addEventListener("click", () => selectDepartment(name));
    tabs.append(tab);
    if (name === "POKON" || name === "DOZEN") {
      pokonDozenPage.append(renderDepartment(name, calculated.departments[name], calculated.nazendingKeys[name]));
      if (name === "DOZEN") panels.append(pokonDozenPage);
    } else if (name !== "PAKKETTEN") {
      panels.append(renderDepartment(name, calculated.departments[name], calculated.nazendingKeys[name]));
    }
  });
  const unknownPanel = document.querySelector("#unknownPanel");
  const unknownList = document.querySelector("#unknownList");
  unknownList.replaceChildren();
  calculated.unknown.forEach(([number, count]) => {
    const item = document.createElement("div");
    item.className = "unknown-entry";
    item.innerHTML = `<div><strong>${escapeHtml(number)}</strong><br><span>${count} order${count === 1 ? "" : "s"}</span></div>`;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Toevoegen aan database";
    addButton.addEventListener("click", () => openPackageForm(number));
    item.append(addButton);
    unknownList.append(item);
  });
  unknownPanel.hidden = calculated.unknown.length === 0;
  emptyState.hidden = true; results.hidden = false;
  printButton.disabled = orderCounts.size === 0 && activeNazendingen().length === 0;
  printPakketkaartenButton.disabled = orderCounts.size === 0 && activeNazendingen().length === 0;
  resetPrintStatusButton.disabled = printedPakketnummers.size === 0;
  document.querySelector("#klantDuplicatenButton").disabled = orderCounts.size === 0;
}

function selectDepartment(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.department === name)));
  document.querySelectorAll(".department").forEach((panel) => { panel.hidden = panel.dataset.department !== name; });
}

async function handleFile(file) {
  setMessage("");
  if (!file || !file.name.toLowerCase().endsWith(".csv")) { setMessage("Kies een CSV-bestand."); return; }
  try {
    const text = await file.text();
    const orderCounts = readOrders(text);
    const orderNames = readOrderNames(text);
    // Also parse the same file for Verkopen, so a lijst can be sent there
    // later without re-uploading — an older export format that's missing a
    // required column just means no "Naar Verkopen" button for this lijst.
    let verkoopOrders = null;
    try { verkoopOrders = parseVerkoopExport(text); } catch (_error) { verkoopOrders = null; }
    const baseName = formatShortDate(new Date());
    const name = imports.some((imp) => imp.name === baseName)
      ? await promptImportName(uniqueImportName(baseName))
      : baseName;
    imports.push({ id: makeImportId(), name, active: true, orderCounts, orderNames, verkoopOrders, verkoopVerstuurd: false });
    saveImportState();
    renderAll();
  } catch (error) { setMessage(`Kan bestand niet lezen: ${error.message}`); }
}

async function runBackup() {
  backupButton.disabled = true;
  backupStatus.classList.remove("is-error");
  backupStatus.textContent = "Bezig met back-uppen…";
  try {
    const response = await fetch("/api/backup", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Back-up mislukt.");
    const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    if (result.k_synced) {
      backupStatus.textContent = `Back-up gelukt (${time})`;
      setTimeout(() => {
        if (backupStatus.textContent === `Back-up gelukt (${time})`) backupStatus.textContent = "";
      }, 10000);
    } else {
      backupStatus.classList.add("is-error");
      backupStatus.textContent = `Gepusht naar GitHub, maar K:-synchronisatie mislukt: ${result.k_sync_error}`;
    }
  } catch (error) {
    backupStatus.classList.add("is-error");
    backupStatus.textContent = `Back-up mislukt: ${error.message}`;
  } finally {
    backupButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove("is-dragging"); }));
dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
printButton.addEventListener("click", () => window.print());
backupButton.addEventListener("click", runBackup);
printPakketkaartenButton.addEventListener("click", printPakketkaarten);
resetPrintStatusButton.addEventListener("click", async () => {
  // Er is geen betrouwbare manier om te weten of iemand het printvenster
  // heeft geannuleerd (browsers geven daar geen signaal voor), dus staat
  // hier gewoon een handmatige "terugzetten"-knop voor dat geval.
  const ok = await confirmDialog(
    "Alle pakketkaarten weer op 'nog niet geprint' zetten? De volgende keer printen komt dan alles opnieuw mee.",
    "Ja, terugzetten",
    { cancelLabel: "Annuleren", style: "primary" }
  );
  if (!ok) return;
  printedPakketnummers.clear();
  savePrintedPakketnummers();
  setMessage("Print-status is gewist — de volgende print bevat weer alle pakketkaarten.");
  renderAll();
});
document.querySelector("#addComponentButton").addEventListener("click", createComponentRow);
document.querySelector("#closePackageDialog").addEventListener("click", closePackageDialogAndReturn);
document.querySelector("#cancelPackageButton").addEventListener("click", closePackageDialogAndReturn);
packageForm.addEventListener("submit", saveNewPackage);
document.querySelector("#newPackagePokon").addEventListener("change", syncPokonAmountField);
document.querySelector("#newPackageNumber").addEventListener("input", syncPokonAmountField);
document.querySelector("#prevPackageButton").addEventListener("click", () => navigatePackage(-1));
document.querySelector("#nextPackageButton").addEventListener("click", () => navigatePackage(1));
document.querySelector("#copyPackageButton").addEventListener("click", copyCurrentPackage);
document.querySelector("#managePackagesButton").addEventListener("click", () => {
  document.querySelector("#managePackagesSearch").value = managePackagesSearchTerm;
  renderManagePackagesList(managePackagesSearchTerm);
  managePackagesDialog.showModal();
});
document.querySelector("#closeManagePackagesDialog").addEventListener("click", () => managePackagesDialog.close());
document.querySelector("#managePackagesSearch").addEventListener("input", (event) => {
  managePackagesSearchTerm = event.target.value;
  renderManagePackagesList(managePackagesSearchTerm);
});
document.querySelector("#addPackageFromManageButton").addEventListener("click", () => {
  managePackagesDialog.close();
  packageFormOpenedFromManageList = true;
  openPackageForm();
});
document.querySelector("#openVerkoopButton").addEventListener("click", () => {
  const vandaag = todayIso();
  document.querySelector("#verkoopVanDatum").value = vandaag;
  document.querySelector("#verkoopTotDatum").value = vandaag;
  verkoopView = "kalender";
  verkoopActiefKanaal = "";
  verkoopActiefSeizoen = verkoopHuidigSeizoenStart(vandaag);
  renderVerkoopDialog();
  verkoopDialog.showModal();
});
document.querySelector("#closeVerkoopDialog").addEventListener("click", () => verkoopDialog.close());
document.querySelector("#verkoopSeizoenToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const dropdown = document.querySelector("#verkoopSeizoenDropdown");
  const opent = dropdown.hidden;
  if (opent) {
    dropdown.hidden = false;
    document.querySelector("#verkoopSeizoenToggle").setAttribute("aria-expanded", "true");
  } else {
    sluitVerkoopSeizoenDropdown();
  }
});
document.addEventListener("click", (event) => {
  const dropdown = document.querySelector("#verkoopSeizoenDropdown");
  if (!dropdown.hidden && !dropdown.contains(event.target) && event.target !== document.querySelector("#verkoopSeizoenToggle")) {
    sluitVerkoopSeizoenDropdown();
  }
});
document.querySelector("#verkoopExportButton").addEventListener("click", verkoopExporteren);
["#verkoopVanDatum", "#verkoopTotDatum"].forEach((selector) => {
  document.querySelector(selector).addEventListener("change", renderVerkoopDialog);
});
["#verkoopVanDatum", "#verkoopTotDatum"].forEach((selector) => {
  const input = document.querySelector(selector);
  // A plain click on a date input only selects the segment under the
  // cursor (day/month/year) — open the native picker straight away instead,
  // so one click anywhere on the field is enough.
  input.addEventListener("click", () => {
    if (typeof input.showPicker === "function") input.showPicker();
  });
});
document.querySelector("#verkoopZoekInput").addEventListener("input", renderVerkoopDialog);
document.querySelectorAll(".verkoop-view-button").forEach((knop) => {
  knop.addEventListener("click", () => {
    verkoopView = knop.dataset.view;
    renderVerkoopDialog();
  });
});
document.querySelectorAll(".verkoop-table th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const kolom = th.dataset.sort;
    verkoopSort = {
      kolom,
      richting: verkoopSort.kolom === kolom && verkoopSort.richting === "desc" ? "asc" : "desc",
    };
    renderVerkoopDialog();
  });
});
function sluitNazendingDialog() {
  // Kwam je hier via een "Bundelen →"-knop vanuit Dubbele klanten, dan ga je
  // terug naar dat overzicht i.p.v. helemaal terug naar het hoofdscherm.
  const terugNaarDubbeleKlanten = Boolean(nazendingBrondata);
  nazendingDialog.close();
  if (terugNaarDubbeleKlanten) openKlantDuplicatenDialog();
}
document.querySelector("#closeNazendingDialog").addEventListener("click", sluitNazendingDialog);
document.querySelector("#cancelNazendingButton").addEventListener("click", sluitNazendingDialog);
document.querySelector("#addNazendingButton").addEventListener("click", () => openNazendingDialog("klacht"));
document.querySelector("#bundelButton").addEventListener("click", () => openNazendingDialog("bundel"));
document.querySelector("#klantDuplicatenButton").addEventListener("click", openKlantDuplicatenDialog);
document.querySelector("#closeKlantDuplicatenDialog").addEventListener("click", () => klantDuplicatenDialog.close());
document.querySelector("#cancelKlantDuplicatenButton").addEventListener("click", () => klantDuplicatenDialog.close());
klantDuplicatenSelectAllCheckbox.addEventListener("change", (event) => {
  const aangevinkt = event.target.checked;
  klantDuplicatenListEl.querySelectorAll(".klant-duplicaat-row input").forEach((checkbox) => { checkbox.checked = aangevinkt; });
  klantDuplicatenSelectAllCheckbox.indeterminate = false;
});
document.querySelector("#printKlantOverzichtButton").addEventListener("click", printKlantOverzicht);
document.querySelector("#verplaatsKlantDuplicatenButton").addEventListener("click", () => {
  const geselecteerd = [...klantDuplicatenListEl.querySelectorAll(".klant-duplicaat-row")]
    .filter((row) => row.querySelector("input").checked)
    .map((row) => row._entry);
  if (!geselecteerd.length) return;
  verplaatsNaarTeBundelen(geselecteerd);
  klantDuplicatenDialog.close();
});
nazendingPakketnummerInput.addEventListener("input", () => {
  loadNazendingComponents();
  renderNazendingPakketSuggestions();
});
nazendingPakketnummerInput.addEventListener("focus", renderNazendingPakketSuggestions);
nazendingPakketnummerInput.addEventListener("blur", hideNazendingPakketSuggestions);
wireDoosnummerSuggestions(document.querySelector("#newPackageBoxes"), document.querySelector("#newPackageBoxesSuggestions"));
wireDoosnummerSuggestions(document.querySelector("#newPackagePokonDoos"), document.querySelector("#newPackagePokonDoosSuggestions"));
document.querySelector("#saveNazendingButton").addEventListener("click", saveNazending);
addAnotherNazendingPakketButton.addEventListener("click", addAnotherNazendingPakket);

populatePokonOptions();

imports = loadImportState();
nazendingen = loadNazendingen();
printedPakketnummers = loadPrintedPakketnummers();
renderAll();
