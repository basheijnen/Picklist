const test = require("node:test");
const assert = require("node:assert/strict");
const { normaliseerPotmaat, verkoopPerPlant } = require("../webapp/dist/plant_verkoop.js");

const bom = [
  { pakketnummer: "2.1", gebied: "KAS", item: "Ficus Carica - P9", soort: "", aantal_per_pakket: 1 },
  { pakketnummer: "2.1", gebied: "KAS", item: "Olea Europaea - P9", soort: "", aantal_per_pakket: 1 },
  { pakketnummer: "2.1", gebied: "DOZEN", item: "1", soort: "", aantal_per_pakket: 1 },
  { pakketnummer: "2.6", gebied: "KAS", item: "Ficus Carica - P9", soort: "", aantal_per_pakket: 4 },
  { pakketnummer: "2.6p", gebied: "KAS", item: "Ficus Carica - P9", soort: "", aantal_per_pakket: 4 },
  { pakketnummer: "2.6p", gebied: "POKON", item: "Pokon Mediterrane Planten Mest 1kg", soort: "", aantal_per_pakket: 1 },
  { pakketnummer: "1.3", gebied: "KOELING", item: "Parade", soort: "CL Pink", aantal_per_pakket: 1 },
  { pakketnummer: "200.0", gebied: "KAS", item: "Lavendel", soort: "", aantal_per_pakket: 2 },
  { pakketnummer: "209.5", gebied: "KAS", item: "Lavendel", soort: "", aantal_per_pakket: 3 },
];
const potmaten = { "2.1": "P9", "2.6": "P9", "1.3": "gerolde kluit", "200.0": "C2", "209.5": "P17" };
const order = (pakketnummer, aantal = 1) => ({ pakketnummer, aantal });
const rij = (resultaat, plant, potmaat) => resultaat.rijen.find((r) => r.plant === plant && r.potmaat === potmaat);

test("voorbeeld: 2.1 drie keer en 2.6 twee keer verkocht geeft 11 Ficus Carica P9", () => {
  const r = verkoopPerPlant([order("2.1", 3), order("2.6", 2)], bom, potmaten);
  assert.equal(rij(r, "Ficus Carica - P9", "P9").aantal, 11);
  assert.equal(rij(r, "Olea Europaea - P9", "P9").aantal, 3);
});

test("dozen en Pokon tellen niet mee als plant", () => {
  const r = verkoopPerPlant([order("2.1"), order("2.6p"), order("Pokon", 5), order("P003", 2)], bom, potmaten);
  assert.deepEqual(r.rijen.map((x) => x.plant).sort(), ["Ficus Carica - P9", "Olea Europaea - P9"]);
  assert.deepEqual(r.onbekend, []);
});

test("p-pakket gebruikt de potmaat van het basispakket", () => {
  const r = verkoopPerPlant([order("2.6p", 2)], bom, potmaten);
  assert.equal(rij(r, "Ficus Carica - P9", "P9").aantal, 8);
});

test("soort komt achter de plantnaam", () => {
  const r = verkoopPerPlant([order("1.3", 2)], bom, potmaten);
  assert.equal(rij(r, "Parade CL Pink", "gerolde kluit").aantal, 2);
});

test("C2 en P17 tellen samen op één regel", () => {
  const r = verkoopPerPlant([order("200.0"), order("209.5")], bom, potmaten);
  assert.equal(r.rijen.length, 1);
  assert.equal(rij(r, "Lavendel", "P17 / C2").aantal, 5);
});

test("pakket zonder potmaat krijgt een streepje", () => {
  const r = verkoopPerPlant([order("2.1")], bom, {});
  assert.equal(rij(r, "Ficus Carica - P9", "–").aantal, 1);
});

test("pakketten met onbekende inhoud worden apart teruggegeven", () => {
  const r = verkoopPerPlant([order("901.3", 2), order("901.3"), order("950.1")], bom, potmaten);
  assert.deepEqual(r.rijen, []);
  assert.deepEqual(r.onbekend, [{ pakketnummer: "901.3", aantal: 3 }, { pakketnummer: "950.1", aantal: 1 }]);
});

test("normaliseerPotmaat: spaties weg, C2=P17, C3=P19, de rest letterlijk", () => {
  assert.equal(normaliseerPotmaat("P9  "), "P9");
  assert.equal(normaliseerPotmaat("C2"), "P17 / C2");
  assert.equal(normaliseerPotmaat("p17"), "P17 / C2");
  assert.equal(normaliseerPotmaat("C3"), "P19 / C3");
  assert.equal(normaliseerPotmaat("P19"), "P19 / C3");
  assert.equal(normaliseerPotmaat("P10,5"), "P10,5");
  assert.equal(normaliseerPotmaat("gerolde kluit"), "gerolde kluit");
  assert.equal(normaliseerPotmaat(""), "–");
  assert.equal(normaliseerPotmaat(undefined), "–");
});
