const test = require("node:test");
const assert = require("node:assert/strict");
const { pokonHerkomst } = require("../webapp/dist/plant_verkoop.js");

const bom = [
  { pakketnummer: "249.2p", gebied: "POKON", item: "Pokon Mediterrane Planten Mest 1kg" },
  { pakketnummer: "249.2p", gebied: "KAS", item: "Trachelospermum" },
  { pakketnummer: "1.1p", gebied: "POKON", item: "Pokon Rozen Mest 1kg" },
  { pakketnummer: "1.1p", gebied: "POKON", item: "Pokon Tuinmest 1kg" },
];
const verkoop = [
  { ordernummer: "2024217001", pakketnummer: "249.2", kanaal: "Bol.com" },
  { ordernummer: "2024217001-pokon", pakketnummer: "Pokon", kanaal: "Bol.com" },
  { ordernummer: "2024217002", pakketnummer: "1.1", kanaal: "Amazon" },
  { ordernummer: "2024217002-pokon", pakketnummer: "Pokon", kanaal: "Amazon" },
  { ordernummer: "handmatig-Pokon-Bol.com-2026-07-06", pakketnummer: "Pokon", kanaal: "Bol.com" },
];
const perNummer = new Map(verkoop.map((o) => [o.ordernummer, o]));

test("Pokon-regel van een p-pakket: soort uit de BOM van dat p-pakket, met het basispakket", () => {
  assert.deepEqual(pokonHerkomst(verkoop[1], perNummer, bom), { soort: "Pokon Mediterrane Planten Mest 1kg", pakket: "249.2" });
});

test("meerdere Pokon-soorten in één pakket worden samengevoegd", () => {
  assert.deepEqual(pokonHerkomst(verkoop[3], perNummer, bom), { soort: "Pokon Rozen Mest 1kg + Pokon Tuinmest 1kg", pakket: "1.1" });
});

test("Pokon uit de oude administratie (geen gekoppelde order) is onbekend", () => {
  assert.deepEqual(pokonHerkomst(verkoop[4], perNummer, bom), { soort: "", pakket: "" });
});
