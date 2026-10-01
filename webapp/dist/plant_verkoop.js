// Verkochte pakketten terugrekenen naar losse planten (Verkopen → Per plant).
// Pure functies zonder DOM, zodat ze met `node --test` te testen zijn; in de
// browser komen ze als globals op window (dit script laadt vóór app.js).
(function (root) {
  const GEEN_POTMAAT = "–";
  // Container- en potmaat die hetzelfde zijn, tellen op één regel.
  const GELIJKE_POTMATEN = { P17: "P17 / C2", C2: "P17 / C2", P19: "P19 / C3", C3: "P19 / C3" };
  const GEEN_PLANT_GEBIEDEN = new Set(["DOZEN", "POKON"]);

  function normaliseerPotmaat(potmaat) {
    const waarde = String(potmaat || "").trim().replace(/\s+/g, " ");
    if (!waarde) return GEEN_POTMAAT;
    return GELIJKE_POTMATEN[waarde.toUpperCase()] || waarde;
  }

  function basisPakket(pakketnummer) {
    return pakketnummer.replace(/^(\d+\.\d+|T\d+)[Pp]$/, "$1");
  }

  // Losse Pokon-verkopen ("Pokon", "P003") zijn geen plantenpakket.
  function isPokonVerkoop(pakketnummer) {
    return pakketnummer === "Pokon" || /^[Pp]\d+$/.test(pakketnummer);
  }

  function verkoopPerPlant(orders, bom, potmaten) {
    const inhoud = new Map();
    bom.forEach((regel) => {
      if (GEEN_PLANT_GEBIEDEN.has(regel.gebied)) return;
      if (!inhoud.has(regel.pakketnummer)) inhoud.set(regel.pakketnummer, []);
      inhoud.get(regel.pakketnummer).push(regel);
    });
    const bekendePakketten = new Set(bom.map((regel) => regel.pakketnummer));

    const perPlant = new Map();
    const onbekend = new Map();
    orders.forEach((order) => {
      const pakketnummer = order.pakketnummer;
      if (isPokonVerkoop(pakketnummer)) return;
      const basis = basisPakket(pakketnummer);
      const sleutel = bekendePakketten.has(pakketnummer) ? pakketnummer : basis;
      if (!bekendePakketten.has(sleutel)) {
        onbekend.set(pakketnummer, (onbekend.get(pakketnummer) || 0) + order.aantal);
        return;
      }
      const potmaat = normaliseerPotmaat(potmaten[pakketnummer] || potmaten[basis]);
      (inhoud.get(sleutel) || []).forEach((regel) => {
        const plant = [regel.item, regel.soort].map((deel) => String(deel || "").trim()).filter(Boolean).join(" ");
        const key = `${plant}\u0000${potmaat}`;
        const huidig = perPlant.get(key) || { plant, potmaat, aantal: 0 };
        huidig.aantal += order.aantal * Number(regel.aantal_per_pakket);
        perPlant.set(key, huidig);
      });
    });

    return {
      rijen: [...perPlant.values()],
      onbekend: [...onbekend.entries()]
        .map(([pakketnummer, aantal]) => ({ pakketnummer, aantal }))
        .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true })),
    };
  }

  // Welke Pokon een losse "Pokon"-verkoopregel was: bij het inlezen wordt
  // een p-pakket (bijv. 249.2p) gesplitst in het pakket (249.2) en een regel
  // "<ordernummer>-pokon". Via die order vinden we het pakket, en via de BOM
  // van het p-pakket de soort. Regels uit de oude administratie hebben geen
  // gekoppelde order: dan blijven soort en pakket leeg (onbekend).
  function pokonHerkomst(order, ordersPerNummer, bom) {
    const basisOrder = order.ordernummer.endsWith("-pokon")
      ? ordersPerNummer.get(order.ordernummer.slice(0, -"-pokon".length))
      : null;
    if (!basisOrder) return { soort: "", pakket: "" };
    const soorten = bom
      .filter((regel) => regel.gebied === "POKON" && regel.pakketnummer === `${basisOrder.pakketnummer}p`)
      .map((regel) => regel.item);
    return { soort: [...new Set(soorten)].join(" + "), pakket: basisOrder.pakketnummer };
  }

  const api = { normaliseerPotmaat, verkoopPerPlant, pokonHerkomst };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
