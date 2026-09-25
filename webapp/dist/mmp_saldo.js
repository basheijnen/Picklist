// Saldoberekening voor de vooruitbetaling van Ma Maison Privée. Pure
// functies zonder DOM, zodat ze met `node --test` te testen zijn; in de
// browser komen ze als globals op window (dit script laadt vóór app.js).
(function (root) {
  const MMP_KANAAL = "Maison Privee";

  function naarCenten(bedrag) { return Math.round(Number(bedrag) * 100); }
  function naarEuro(centen) { return centen / 100; }

  function mmpParseDatum(tekst, fallback) {
    const waarde = String(tekst || "").trim();
    let m = waarde.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = waarde.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return fallback;
  }

  // Voegt orders uit meerdere bronnen (verkoopdata, ingeladen lijsten,
  // wachtlijst) samen op ordernummer; de eerste bron wint.
  function mmpVerzamelOrders(bronnen) {
    const gezien = new Map();
    bronnen.forEach((bron) => (bron || []).forEach((order) => {
      if (order.kanaal !== MMP_KANAAL || gezien.has(order.ordernummer)) return;
      gezien.set(order.ordernummer, {
        ordernummer: order.ordernummer, datum: order.datum,
        pakketnummer: order.pakketnummer, aantal: Number(order.aantal) || 1,
      });
    }));
    return [...gezien.values()];
  }

  // Zet de twee notaties van een Pokon-variant om naar één order per
  // ordernummer: "9.1p" en ("9.1" + een "<nr>-pokon"-regel) → {pakketnummer: "9.1", pokon: true}.
  function normaliseerOrders(orders) {
    const perNummer = new Map();
    const pokonNummers = new Set();
    orders.forEach((order) => {
      if (order.pakketnummer === "Pokon" && order.ordernummer.endsWith("-pokon")) {
        pokonNummers.add(order.ordernummer.slice(0, -"-pokon".length));
        return;
      }
      const variant = String(order.pakketnummer).match(/^(.+?)[pP]$/);
      perNummer.set(order.ordernummer, {
        ordernummer: order.ordernummer, datum: order.datum,
        pakketnummer: variant ? variant[1] : order.pakketnummer,
        pokon: Boolean(variant), aantal: Number(order.aantal) || 1,
      });
    });
    pokonNummers.forEach((nr) => { if (perNummer.has(nr)) perNummer.get(nr).pokon = true; });
    return [...perNummer.values()];
  }

  function berekenMaisonPriveeSaldo({ orders, prijzen, betalingen, correcties, instellingen }) {
    const startdatum = instellingen.startdatum;
    const toeslagCenten = naarCenten(instellingen.pokon_toeslag || 0);
    const prijsCenten = new Map(prijzen.map((p) => [p.pakketnummer, naarCenten(p.prijs)]));
    const uitgesloten = new Set(correcties.map((c) => c.ordernummer));
    const ontvangenCenten = betalingen.reduce((som, b) => som + naarCenten(b.bedrag), 0);

    const meetellend = normaliseerOrders(orders)
      .filter((o) => o.datum >= startdatum && !uitgesloten.has(o.ordernummer))
      .sort((a, b) => a.datum.localeCompare(b.datum)
        || a.ordernummer.localeCompare(b.ordernummer, "nl", { numeric: true }));

    let besteldCenten = 0;
    let okCenten = 0;
    let geblokkeerd = false;
    const ontbrekend = new Set();
    const resultaat = meetellend.map((o) => {
      if (!prijsCenten.has(o.pakketnummer)) {
        ontbrekend.add(o.pakketnummer);
        return { ...o, bedrag: null, status: "wacht", reden: `prijs ontbreekt voor pakket ${o.pakketnummer}` };
      }
      const bedragCenten = (prijsCenten.get(o.pakketnummer) + (o.pokon ? toeslagCenten : 0)) * o.aantal;
      besteldCenten += bedragCenten;
      if (!geblokkeerd && okCenten + bedragCenten <= ontvangenCenten) {
        okCenten += bedragCenten;
        return { ...o, bedrag: naarEuro(bedragCenten), status: "ok", reden: "" };
      }
      geblokkeerd = true;
      return { ...o, bedrag: naarEuro(bedragCenten), status: "wacht", reden: "te weinig saldo" };
    });

    return {
      ontvangen: naarEuro(ontvangenCenten),
      besteld: naarEuro(besteldCenten),
      saldo: naarEuro(ontvangenCenten - besteldCenten),
      tekort: naarEuro(Math.max(0, besteldCenten - ontvangenCenten)),
      wachtend: resultaat.filter((o) => o.status === "wacht").length,
      ontbrekendePrijzen: [...ontbrekend].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })),
      orders: resultaat,
    };
  }

  function mmpFactuurOverzicht(saldo, van, tot, pokonToeslag) {
    const inPeriode = saldo.orders.filter((o) => o.datum >= van && o.datum <= tot);
    const perPakket = new Map();
    let pokonAantal = 0;
    let zonderPrijs = 0;
    inPeriode.forEach((o) => {
      if (o.bedrag === null) { zonderPrijs += 1; return; }
      const prijsCenten = Math.round(o.bedrag * 100 / o.aantal) - (o.pokon ? naarCenten(pokonToeslag) : 0);
      const regel = perPakket.get(o.pakketnummer) || { pakketnummer: o.pakketnummer, aantal: 0, prijsCenten };
      regel.aantal += o.aantal;
      perPakket.set(o.pakketnummer, regel);
      if (o.pokon) pokonAantal += o.aantal;
    });
    const regels = [...perPakket.values()]
      .sort((a, b) => a.pakketnummer.localeCompare(b.pakketnummer, "nl", { numeric: true }))
      .map((r) => ({ pakketnummer: r.pakketnummer, aantal: r.aantal, prijs: naarEuro(r.prijsCenten), totaal: naarEuro(r.prijsCenten * r.aantal) }));
    if (pokonAantal) {
      regels.push({ pakketnummer: "Pokon-toeslag", aantal: pokonAantal, prijs: Number(pokonToeslag), totaal: naarEuro(naarCenten(pokonToeslag) * pokonAantal) });
    }
    const totaalCenten = regels.reduce((som, r) => som + naarCenten(r.totaal), 0);
    const aantal = [...perPakket.values()].reduce((som, r) => som + r.aantal, 0);
    return { regels, totaal: naarEuro(totaalCenten), aantal, zonderPrijs };
  }

  const api = { MMP_KANAAL, mmpParseDatum, mmpVerzamelOrders, berekenMaisonPriveeSaldo, mmpFactuurOverzicht };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
