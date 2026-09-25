const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mmpParseDatum, mmpVerzamelOrders, berekenMaisonPriveeSaldo, mmpFactuurOverzicht,
} = require("../webapp/dist/mmp_saldo.js");

const instellingen = { startdatum: "2026-09-26", pokon_toeslag: "6.01" };
const prijzen = [
  { pakketnummer: "1.1", prijs: 29.4 },
  { pakketnummer: "9.1", prijs: 10 },
];
const order = (ordernummer, datum, pakketnummer, aantal = 1) => ({ ordernummer, datum, pakketnummer, aantal });
const bereken = (orders, betaald, extra = {}) => berekenMaisonPriveeSaldo({
  orders, prijzen, betalingen: betaald.map((bedrag, i) => ({ id: String(i), datum: "2026-09-26", bedrag })),
  correcties: [], instellingen, ...extra,
});

test("precies genoeg saldo is OK (geen afrondingsfout)", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-26", "1.1"), order("3", "2026-09-26", "1.1")], [88.2]);
  assert.deepEqual(r.orders.map((o) => o.status), ["ok", "ok", "ok"]);
  assert.equal(r.saldo, 0);
  assert.equal(r.besteld, 88.2);
});

test("een cent te weinig laat de laatste order wachten", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-27", "1.1")], [58.79]);
  assert.deepEqual(r.orders.map((o) => o.status), ["ok", "wacht"]);
  assert.equal(r.orders[1].reden, "te weinig saldo");
  assert.equal(r.wachtend, 1);
  assert.equal(r.tekort, 0.01);
});

test("kleine order na een order die niet past wacht ook", () => {
  const r = bereken([order("1", "2026-09-26", "1.1"), order("2", "2026-09-27", "9.1")], [20]);
  assert.deepEqual(r.orders.map((o) => o.status), ["wacht", "wacht"]);
});

test("sorteert op datum en dan op ordernummer", () => {
  const r = bereken([order("20", "2026-09-27", "9.1"), order("3", "2026-09-27", "9.1"), order("9", "2026-09-26", "9.1")], [20]);
  assert.deepEqual(r.orders.map((o) => [o.ordernummer, o.status]), [["9", "ok"], ["3", "ok"], ["20", "wacht"]]);
});

test("ontbrekende prijs wacht, telt niet mee en blokkeert niet", () => {
  const r = bereken([order("1", "2026-09-26", "77.7"), order("2", "2026-09-27", "9.1")], [10]);
  assert.deepEqual(r.orders.map((o) => o.status), ["wacht", "ok"]);
  assert.equal(r.orders[0].reden, "prijs ontbreekt voor pakket 77.7");
  assert.equal(r.orders[0].bedrag, null);
  assert.deepEqual(r.ontbrekendePrijzen, ["77.7"]);
  assert.equal(r.besteld, 10);
  assert.equal(r.wachtend, 1);
});

test("correctie en order voor startdatum tellen niet mee", () => {
  const r = bereken([order("1", "2026-09-25", "9.1"), order("2", "2026-09-26", "9.1"), order("3", "2026-09-26", "9.1")], [10],
    { correcties: [{ ordernummer: "2", reden: "retour" }] });
  assert.deepEqual(r.orders.map((o) => o.ordernummer), ["3"]);
  assert.equal(r.saldo, 0);
});

test("pokon-variant krijgt toeslag, in beide notaties, en telt één keer", () => {
  const orders = mmpVerzamelOrders([
    [{ ordernummer: "5", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1", aantal: 1 },
     { ordernummer: "5-pokon", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "Pokon", aantal: 1 }],
    [{ ordernummer: "5", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1p" },
     { ordernummer: "6", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1p" }],
  ]);
  const r = bereken(orders, [100]);
  assert.deepEqual(r.orders.map((o) => [o.ordernummer, o.pakketnummer, o.pokon, o.bedrag]),
    [["5", "9.1", true, 16.01], ["6", "9.1", true, 16.01]]);
  assert.equal(r.besteld, 32.02);
});

test("mmpVerzamelOrders: alleen Maison Privee, eerste bron wint", () => {
  const orders = mmpVerzamelOrders([
    [{ ordernummer: "1", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1", aantal: 1 }],
    [{ ordernummer: "1", datum: "2026-09-30", kanaal: "Maison Privee", pakketnummer: "9.1" },
     { ordernummer: "2", datum: "2026-09-30", kanaal: "Bol.com", pakketnummer: "9.1" }],
  ]);
  assert.deepEqual(orders, [{ ordernummer: "1", datum: "2026-09-26", pakketnummer: "9.1", aantal: 1 }]);
});

test("negatieve betaling verlaagt ontvangen", () => {
  const r = bereken([order("1", "2026-09-26", "9.1")], [20, -15]);
  assert.equal(r.ontvangen, 5);
  assert.equal(r.orders[0].status, "wacht");
});

test("mmpParseDatum", () => {
  assert.equal(mmpParseDatum("2026-09-25 14:03:00", "x"), "2026-09-25");
  assert.equal(mmpParseDatum("25-09-2026 14:03", "x"), "2026-09-25");
  assert.equal(mmpParseDatum("5/9/2026", "x"), "2026-09-05");
  assert.equal(mmpParseDatum("", "2026-01-01"), "2026-01-01");
  assert.equal(mmpParseDatum("onzin", "2026-01-01"), "2026-01-01");
});

test("factuuroverzicht per pakket binnen periode, met pokon-toeslag als eigen regel", () => {
  const orders = mmpVerzamelOrders([[
    { ordernummer: "1", datum: "2026-09-26", kanaal: "Maison Privee", pakketnummer: "9.1" },
    { ordernummer: "2", datum: "2026-09-27", kanaal: "Maison Privee", pakketnummer: "9.1p" },
    { ordernummer: "3", datum: "2026-10-05", kanaal: "Maison Privee", pakketnummer: "1.1" },
    { ordernummer: "4", datum: "2026-09-27", kanaal: "Maison Privee", pakketnummer: "77.7" },
  ]]);
  const f = mmpFactuurOverzicht(bereken(orders, []), "2026-09-26", "2026-09-30", 6.01);
  assert.deepEqual(f.regels, [
    { pakketnummer: "9.1", aantal: 2, prijs: 10, totaal: 20 },
    { pakketnummer: "Pokon-toeslag", aantal: 1, prijs: 6.01, totaal: 6.01 },
  ]);
  assert.equal(f.totaal, 26.01);
  assert.equal(f.aantal, 2);
  assert.equal(f.zonderPrijs, 1);
});
