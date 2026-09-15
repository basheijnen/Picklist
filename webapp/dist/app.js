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
const packageDialog = document.querySelector("#packageDialog");
const packageForm = document.querySelector("#packageForm");
const componentRows = document.querySelector("#componentRows");
let currentImport = null;

function createComponentRow() {
  const row = document.createElement("div");
  row.className = "component-row";
  row.innerHTML = `
    <label>Plant / artikel<input class="component-item" required placeholder="Naam"></label>
    <label>Soort<input class="component-kind" placeholder="Optioneel"></label>
    <label>Aantal<input class="component-amount" type="number" min="0.01" step="0.01" value="1" required></label>
    <label>Waar?<select class="component-area" required><option>KOELING</option><option>KAS</option><option>KAMER</option></select></label>
    <button class="remove-component" type="button" aria-label="Regel verwijderen">×</button>`;
  row.querySelector(".remove-component").addEventListener("click", () => {
    if (componentRows.children.length > 1) row.remove();
  });
  componentRows.append(row);
}

function openPackageForm(pakketnummer = "") {
  packageForm.reset();
  componentRows.replaceChildren();
  createComponentRow();
  document.querySelector("#newPackageNumber").value = pakketnummer;
  document.querySelector("#packageFormMessage").textContent = "";
  packageDialog.showModal();
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
  if ((window.PICKLIST_PACKAGES || []).some((entry) => entry.pakketnummer === pakketnummer)) {
    formMessage.textContent = `Pakketnummer ${pakketnummer} bestaat al.`;
    return;
  }
  const components = [...componentRows.querySelectorAll(".component-row")].map((row) => ({
    gebied: row.querySelector(".component-area").value,
    item: row.querySelector(".component-item").value.trim(),
    soort: row.querySelector(".component-kind").value.trim(),
    aantal_per_pakket: Number(row.querySelector(".component-amount").value),
  }));
  if (!pakketnummer || !pakketnaam || !doosnummers || components.some((entry) => !entry.item || !(entry.aantal_per_pakket > 0))) {
    formMessage.textContent = "Vul alle verplichte velden en geldige aantallen in.";
    return;
  }
  formMessage.textContent = "Opslaan...";
  const submitButton = packageForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const response = await fetch("/api/pakketten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pakketnummer, pakketnaam, doosnummers,
        pokon: pokonName ? { naam: pokonName, aantal: pokonAmount } : null,
        components,
      }),
    });
    const result = await response.json();
    if (!response.ok) { formMessage.textContent = result.error || "Opslaan mislukt."; return; }
    window.PICKLIST_PACKAGES.push(result.package);
    window.PICKLIST_BOM.push(...result.bom);
    packageDialog.close();
    message.textContent = `Pakket ${pakketnummer} is opgeslagen in bom.csv/package_info.csv.`;
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
    section.insertAdjacentHTML("beforeend", `<div class="group"><div class="group-title"><span>${escapeHtml(group.name)}</span><span>${displayNumber(subtotal)}</span></div><div class="table-wrap"><table><thead><tr><th>Item</th><th>Soort</th><th>Aantal</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  });
  return section;
}

function renderPackages(orderCounts) {
  const section = document.createElement("section");
  section.className = "department";
  section.dataset.department = "PAKKETTEN";
  const packageInfo = new Map((window.PICKLIST_PACKAGES || []).map((entry) => [entry.pakketnummer, entry]));
  const rows = [...orderCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "nl", { numeric: true }))
    .map(([pakketnummer, aantal]) => {
      const info = packageInfo.get(pakketnummer) || {};
      const needsPokon = info.pokon === "ja";
      return `<tr class="${needsPokon ? "needs-pokon" : ""}">
        <td class="package-number">${escapeHtml(pakketnummer)}</td>
        <td class="package-name">${escapeHtml(info.pakketnaam || "Onbekende pakketnaam")}</td>
        <td class="pokon-cell">${needsPokon ? "Pokon" : ""}</td>
        <td class="package-count">${displayNumber(aantal)}</td>
        <td class="box-cell">${escapeHtml(info.doosnummers || "—")}</td>
      </tr>`;
    })
    .join("");
  const total = [...orderCounts.values()].reduce((sum, aantal) => sum + aantal, 0);
  section.innerHTML = `
    <header class="department-header">
      <div><h2>Picklist</h2><p class="picklist-date">${formatLongDate(new Date())}</p></div>
      <div class="department-total">${displayNumber(total)} pakketten</div>
    </header>
    <div class="table-wrap"><table>
      <thead><tr><th>Pakketnummer</th><th>Pakketnaam</th><th>Pokon</th><th>Aantal</th><th>Doosnummer(s)</th></tr></thead>
      <tbody>${rows}<tr class="package-total-row"><td>Totaal</td><td colspan="2"></td><td class="package-grand-total">${displayNumber(total)}</td><td></td></tr></tbody>
    </table></div>`;
  return section;
}

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
  views.forEach((name, index) => {
    const tab = document.createElement("button");
    tab.type = "button"; tab.className = "tab"; tab.role = "tab";
    tab.textContent = name; tab.dataset.department = name;
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.style.setProperty("--accent", { PAKKETTEN: "#163d32", KOELING: "#2576a6", KAS: "#4e8b45", KAMER: "#9a5a9e", POKON: "#d17b2a", DOZEN: "#6f6254" }[name]);
    tab.addEventListener("click", () => selectDepartment(name));
    tabs.append(tab);
    if (name !== "PAKKETTEN") panels.append(renderDepartment(name, calculated.departments[name]));
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
  emptyState.hidden = true; results.hidden = false; printButton.disabled = false;
}

function selectDepartment(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.department === name)));
  document.querySelectorAll(".department").forEach((panel) => { panel.hidden = panel.dataset.department !== name; });
}

async function handleFile(file) {
  message.textContent = "";
  if (!file || !file.name.toLowerCase().endsWith(".csv")) { message.textContent = "Kies een CSV-bestand."; return; }
  try {
    const orderCounts = readOrders(await file.text());
    currentImport = { file, orderCounts };
    showResults(file, orderCounts, calculate(orderCounts));
  } catch (error) { message.textContent = `Kan bestand niet lezen: ${error.message}`; }
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove("is-dragging"); }));
dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
printButton.addEventListener("click", () => window.print());
document.querySelector("#addPackageButton").addEventListener("click", () => openPackageForm());
document.querySelector("#addComponentButton").addEventListener("click", createComponentRow);
document.querySelector("#closePackageDialog").addEventListener("click", () => packageDialog.close());
document.querySelector("#cancelPackageButton").addEventListener("click", () => packageDialog.close());
packageForm.addEventListener("submit", saveNewPackage);

populatePokonOptions();
