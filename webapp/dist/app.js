const DEPARTMENTS = ["KOELING", "KAS", "KAMER", "POKON", "DOZEN"];
const BOXES_PER_PALLET = {
  "1": 100, "2": 54, "3": 54, "4": 27, "5": 34, "6": 16, "7": 70,
  "8": 60, "9": 40, "10": 36, "11": 21, "12": 36, "13": 16,
  "14": 72, "15": 144, "16": 25, "KB": 24, "EUR40": 30,
};

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const message = document.querySelector("#message");
const results = document.querySelector("#results");
const emptyState = document.querySelector("#emptyState");
const printButton = document.querySelector("#printButton");
const newImportButton = document.querySelector("#newImportButton");
const printPakketkaartenButton = document.querySelector("#printPakketkaartenButton");
const pakketkaartenPanel = document.querySelector("#pakketkaartenPanel");
const packageDialog = document.querySelector("#packageDialog");
const packageForm = document.querySelector("#packageForm");
const componentRows = document.querySelector("#componentRows");
const managePackagesDialog = document.querySelector("#managePackagesDialog");
const managePackagesList = document.querySelector("#managePackagesList");
const NEW_ITEMS_GROEP = "Nieuwe artikelen:";
const IMPORT_STORAGE_KEY = "picklist-current-import-v1";
let currentImport = null;
let editingPakketnummer = null;
let manageListForNav = [];

function saveImportState() {
  try {
    if (!currentImport) { localStorage.removeItem(IMPORT_STORAGE_KEY); return; }
    localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({
      fileLabel: currentImport.file.name,
      orderCounts: Object.fromEntries(currentImport.orderCounts),
    }));
  } catch (_error) {
    // localStorage unavailable (private browsing, quota, ...) — the session
    // just won't be remembered on reload, not fatal for the current run.
  }
}

function loadImportState() {
  try {
    const raw = localStorage.getItem(IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { file: { name: parsed.fileLabel }, orderCounts: new Map(Object.entries(parsed.orderCounts)) };
  } catch (_error) {
    return null;
  }
}

function resetImport() {
  currentImport = null;
  saveImportState();
  results.hidden = true;
  emptyState.hidden = false;
  printButton.disabled = true;
  newImportButton.disabled = true;
  printPakketkaartenButton.disabled = true;
  message.textContent = "";
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
    <label>Aantal<input class="component-amount" type="number" min="0.01" step="0.01" value="1" required></label>
    <label>Waar?<select class="component-area" required><option>KOELING</option><option>KAS</option><option>KAMER</option></select></label>
    <label>Categorie<select class="component-groep"></select></label>
    <button class="remove-component" type="button" aria-label="Regel verwijderen">×</button>`;
  const areaSelect = row.querySelector(".component-area");
  const groepSelect = row.querySelector(".component-groep");
  populateGroepOptions(areaSelect.value, groepSelect);
  areaSelect.addEventListener("change", () => populateGroepOptions(areaSelect.value, groepSelect));
  row.querySelector(".remove-component").addEventListener("click", () => {
    if (componentRows.children.length > 1) row.remove();
  });
  componentRows.append(row);
}

function syncPokonAmountField() {
  const pokonSelect = document.querySelector("#newPackagePokon");
  const amountField = document.querySelector("#newPackagePokonAmount");
  if (pokonSelect.value) {
    amountField.disabled = false;
    if (!amountField.value) amountField.value = 1;
  } else {
    amountField.disabled = true;
    amountField.value = "";
  }
}

function updatePackageNavButtons(pakketnummer) {
  const nav = document.querySelector(".package-nav");
  const prevButton = document.querySelector("#prevPackageButton");
  const nextButton = document.querySelector("#nextPackageButton");
  const index = manageListForNav.indexOf(pakketnummer);
  const show = Boolean(editingPakketnummer) && index !== -1 && manageListForNav.length > 1;
  nav.hidden = !show;
  if (show) {
    prevButton.disabled = index <= 0;
    nextButton.disabled = index >= manageListForNav.length - 1;
  }
}

function navigatePackage(step) {
  const index = manageListForNav.indexOf(editingPakketnummer);
  if (index === -1) return;
  const nextIndex = index + step;
  if (nextIndex < 0 || nextIndex >= manageListForNav.length) return;
  openEditPackageForm(manageListForNav[nextIndex]);
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

function renderManagePackagesList(filter = "") {
  const term = filter.trim().toLowerCase();
  const packages = [...(window.PICKLIST_PACKAGES || [])]
    .filter((entry) => !term || entry.pakketnummer.toLowerCase().includes(term) || entry.pakketnaam.toLowerCase().includes(term))
    .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true }));
  manageListForNav = packages.map((entry) => entry.pakketnummer);
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

async function saveNewPackage(event) {
  event.preventDefault();
  const pakketnummer = document.querySelector("#newPackageNumber").value.trim();
  const pakketnaam = document.querySelector("#newPackageName").value.trim();
  const doosnummers = document.querySelector("#newPackageBoxes").value.trim();
  const pokonName = document.querySelector("#newPackagePokon").value;
  const pokonAmount = Number(document.querySelector("#newPackagePokonAmount").value || 1);
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
  formMessage.textContent = "Opslaan...";
  const submitButton = packageForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const url = editingPakketnummer ? `/api/pakketten/${encodeURIComponent(editingPakketnummer)}` : "/api/pakketten";
    const method = editingPakketnummer ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pakketnummer, pakketnaam, doosnummers,
        pokon: pokonName ? { naam: pokonName, aantal: pokonAmount } : null,
        components,
      }),
    });
    const result = await response.json();
    if (!response.ok) { formMessage.textContent = result.error || "Opslaan mislukt."; return; }
    if (editingPakketnummer) {
      window.PICKLIST_PACKAGES = window.PICKLIST_PACKAGES.filter((entry) => entry.pakketnummer !== editingPakketnummer);
      window.PICKLIST_BOM = window.PICKLIST_BOM.filter((entry) => entry.pakketnummer !== editingPakketnummer);
    }
    window.PICKLIST_PACKAGES.push(result.package);
    window.PICKLIST_BOM.push(...result.bom);
    packageDialog.close();
    message.textContent = editingPakketnummer
      ? `Pakket ${pakketnummer} is bijgewerkt.`
      : `Pakket ${pakketnummer} is opgeslagen in bom.csv/package_info.csv.`;
    if (currentImport) showResults(currentImport.file, currentImport.orderCounts, calculate(currentImport.orderCounts));
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

function calculate(orderCounts) {
  const knownPackages = new Set();
  const departments = Object.fromEntries(DEPARTMENTS.map((name) => [name, new Map()]));
  (window.PICKLIST_BOM || []).forEach((entry) => {
    knownPackages.add(entry.pakketnummer);
    const orders = orderCounts.get(entry.pakketnummer) || 0;
    if (!orders || !departments[entry.gebied]) return;
    const key = `${entry.item}\u0000${entry.soort}`;
    const current = departments[entry.gebied].get(key) || { ...entry, aantal: 0 };
    current.aantal += orders * entry.aantal_per_pakket;
    departments[entry.gebied].set(key, current);
  });
  const unknown = [...orderCounts.entries()].filter(([pakketnummer]) => !knownPackages.has(pakketnummer));
  return { departments, unknown };
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

function renderDepartment(name, entries) {
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
      return `<tr><td>${escapeHtml(entry.item)}</td><td>${pallets}</td><td>${displayNumber(entry.aantal)}</td></tr>`;
    }).join("");
    const totalRow = `<tr class="dozen-total-row"><td>Totaal</td><td>${displayTwoDecimals(totalPallets)}</td><td>${displayNumber(totalBoxes)}</td></tr>`;
    section.insertAdjacentHTML("beforeend", `<div class="table-wrap"><table><thead><tr><th>Doosnummer</th><th>Pallets</th><th>Dozen</th></tr></thead><tbody>${rows}${totalRow}</tbody></table></div>`);
    return section;
  }
  groupEntries(entries).forEach((group) => {
    const subtotal = group.entries.reduce((sum, entry) => sum + entry.aantal, 0);
    const rows = group.entries.map((entry) => `<tr><td>${escapeHtml(entry.item)}</td><td>${escapeHtml(entry.soort)}</td><td>${displayNumber(entry.aantal)}</td></tr>`).join("");
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
  const rows = [...orderCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "nl", { numeric: true }))
    .map(([pakketnummer, aantal]) => {
      const info = packageInfo.get(pakketnummer) || {};
      const needsPokon = pokonPakketten.has(pakketnummer);
      return `<tr class="${needsPokon ? "needs-pokon" : ""}">
        <td class="package-number">${escapeHtml(pakketnummer)}</td>
        <td class="package-name">${escapeHtml(info.pakketnaam || "Onbekende pakketnaam")}</td>
        <td class="pokon-cell">${needsPokon ? "Pokon" : ""}</td>
        <td class="package-count"><input class="package-count-input" type="number" min="0" step="1" value="${aantal}" data-pakketnummer="${escapeHtml(pakketnummer)}" aria-label="Aantal voor pakket ${escapeHtml(pakketnummer)}"></td>
        <td class="box-cell">${escapeHtml(info.doosnummers || "—")}</td>
      </tr>`;
    })
    .join("");
  const total = [...orderCounts.values()].reduce((sum, aantal) => sum + aantal, 0);
  section.innerHTML = `
    <header class="department-header pakketten-header">
      <div class="pakketten-title"><h2>E-COMMERCE BESTELLING</h2><p class="picklist-date">${formatLongDate(new Date())}</p></div>
      <div class="department-total badge">${displayNumber(total)} pakketten</div>
    </header>
    <div class="table-wrap"><table>
      <thead><tr><th>Pakketnummer</th><th>Pakketnaam</th><th>Pokon</th><th>Aantal</th><th>Doosnummer(s)</th></tr></thead>
      <tbody>${rows}<tr class="package-total-row"><td>Totaal</td><td colspan="2"></td><td class="package-grand-total">${displayNumber(total)}</td><td></td></tr></tbody>
    </table></div>`;
  section.querySelector("tbody").addEventListener("change", (event) => {
    const input = event.target.closest(".package-count-input");
    if (!input) return;
    adjustOrderCount(input.dataset.pakketnummer, Math.max(0, Math.floor(Number(input.value) || 0)));
  });
  return section;
}

function adjustOrderCount(pakketnummer, newValue) {
  if (!currentImport) return;
  if (newValue > 0) currentImport.orderCounts.set(pakketnummer, newValue);
  else currentImport.orderCounts.delete(pakketnummer);
  saveImportState();
  showResults(currentImport.file, currentImport.orderCounts, calculate(currentImport.orderCounts));
}

function buildPakketkaarten(orderCounts) {
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
    const card = document.createElement("div");
    card.className = "pakketkaart";
    card.innerHTML = `
      <div class="pakketkaart-label">PAKKETNUMMER:</div>
      <div class="pakketkaart-nummer">${escapeHtml(pakketnummer)}</div>
      <div class="pakketkaart-naam"><span>${escapeHtml(info ? info.pakketnaam : "Onbekend pakket")}</span><span>x ${displayNumber(totalCount)}</span></div>
      <ul class="pakketkaart-items">${itemsHtml}</ul>
      <div class="pakketkaart-doos"><span class="pakketkaart-doos-label">DOOSNUMMER:</span><span class="pakketkaart-doos-nummer">${escapeHtml(info ? info.doosnummers : "—")}</span></div>`;
    pakketkaartenPanel.append(card);
  });
}

function printPakketkaarten() {
  if (!currentImport) return;
  buildPakketkaarten(currentImport.orderCounts);
  document.body.classList.add("printing-pakketkaarten");
  window.print();
}

window.addEventListener("afterprint", () => document.body.classList.remove("printing-pakketkaarten"));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function showResults(file, orderCounts, calculated) {
  document.querySelector("#fileName").textContent = file.name;
  document.querySelector("#orderCount").textContent = [...orderCounts.values()].reduce((a, b) => a + b, 0);
  document.querySelector("#packageCount").textContent = orderCounts.size;
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
      pokonDozenPage.append(renderDepartment(name, calculated.departments[name]));
      if (name === "DOZEN") panels.append(pokonDozenPage);
    } else if (name !== "PAKKETTEN") {
      panels.append(renderDepartment(name, calculated.departments[name]));
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
  emptyState.hidden = true; results.hidden = false; printButton.disabled = false; newImportButton.disabled = false; printPakketkaartenButton.disabled = false;
}

function selectDepartment(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.department === name)));
  document.querySelectorAll(".department").forEach((panel) => { panel.hidden = panel.dataset.department !== name; });
}

async function handleFile(file) {
  message.textContent = "";
  if (!file || !file.name.toLowerCase().endsWith(".csv")) { message.textContent = "Kies een CSV-bestand."; return; }
  try {
    const newCounts = readOrders(await file.text());
    let orderCounts, fileLabel;
    if (currentImport) {
      orderCounts = new Map(currentImport.orderCounts);
      newCounts.forEach((aantal, pakketnummer) => orderCounts.set(pakketnummer, (orderCounts.get(pakketnummer) || 0) + aantal));
      fileLabel = `${currentImport.file.name} + ${file.name}`;
    } else {
      orderCounts = newCounts;
      fileLabel = file.name;
    }
    currentImport = { file: { name: fileLabel }, orderCounts };
    saveImportState();
    showResults(currentImport.file, orderCounts, calculate(orderCounts));
  } catch (error) { message.textContent = `Kan bestand niet lezen: ${error.message}`; }
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove("is-dragging"); }));
dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
printButton.addEventListener("click", () => window.print());
newImportButton.addEventListener("click", resetImport);
printPakketkaartenButton.addEventListener("click", printPakketkaarten);
document.querySelector("#addComponentButton").addEventListener("click", createComponentRow);
document.querySelector("#closePackageDialog").addEventListener("click", () => packageDialog.close());
document.querySelector("#cancelPackageButton").addEventListener("click", () => packageDialog.close());
packageForm.addEventListener("submit", saveNewPackage);
document.querySelector("#newPackagePokon").addEventListener("change", syncPokonAmountField);
document.querySelector("#prevPackageButton").addEventListener("click", () => navigatePackage(-1));
document.querySelector("#nextPackageButton").addEventListener("click", () => navigatePackage(1));
document.querySelector("#managePackagesButton").addEventListener("click", () => {
  document.querySelector("#managePackagesSearch").value = "";
  renderManagePackagesList();
  managePackagesDialog.showModal();
});
document.querySelector("#closeManagePackagesDialog").addEventListener("click", () => managePackagesDialog.close());
document.querySelector("#managePackagesSearch").addEventListener("input", (event) => renderManagePackagesList(event.target.value));
document.querySelector("#addPackageFromManageButton").addEventListener("click", () => {
  managePackagesDialog.close();
  openPackageForm();
});

populatePokonOptions();

const restoredImport = loadImportState();
if (restoredImport) {
  currentImport = restoredImport;
  showResults(restoredImport.file, restoredImport.orderCounts, calculate(restoredImport.orderCounts));
}
