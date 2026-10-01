const test = require("node:test");
const assert = require("node:assert/strict");
const { teBedrukkenPakketten, markeerGeprint, migreerOudeGeprintStatus } = require("../webapp/dist/pakketkaart_print.js");

const lijst = (counts, geprint = {}) => ({
  orderCounts: new Map(Object.entries(counts)),
  geprint: new Map(Object.entries(geprint)),
});

test("nieuwe lijst: alle pakketten moeten geprint worden", () => {
  const vandaag = lijst({ "34.2": 1, "2.1": 3 });
  assert.deepEqual([...teBedrukkenPakketten([vandaag])], [["34.2", 1], ["2.1", 3]]);
});

test("na printen is er niets meer te printen", () => {
  const vandaag = lijst({ "34.2": 1, "2.1": 3 });
  markeerGeprint([vandaag]);
  assert.equal(teBedrukkenPakketten([vandaag]).size, 0);
});

test("lijst van gisteren verwijderd: zelfde pakket met zelfde aantal in nieuwe lijst wordt toch geprint (bug 34.2)", () => {
  const gisteren = lijst({ "34.2": 1, "232.1": 1 });
  markeerGeprint([gisteren]);
  // Gisteren verwijderd; vandaag alleen de nieuwe lijst.
  const vandaag = lijst({ "34.2": 1, "232.1": 1, "9.10": 2 });
  assert.deepEqual([...teBedrukkenPakketten([vandaag])], [["34.2", 1], ["232.1", 1], ["9.10", 2]]);
});

test("lijst van gisteren blijft staan: alleen nieuwe of gewijzigde pakketten, met het totaal aantal", () => {
  const gisteren = lijst({ "34.2": 1, "2.1": 3, "54.2": 1 });
  markeerGeprint([gisteren]);
  const vandaag = lijst({ "34.2": 1, "9.10": 2 });
  assert.deepEqual([...teBedrukkenPakketten([gisteren, vandaag])], [["34.2", 2], ["9.10", 2]]);
});

test("gewijzigd aantal binnen een geprinte lijst print opnieuw met het nieuwe aantal", () => {
  const vandaag = lijst({ "2.1": 3, "34.2": 1 });
  markeerGeprint([vandaag]);
  vandaag.orderCounts.set("2.1", 4);
  assert.deepEqual([...teBedrukkenPakketten([vandaag])], [["2.1", 4]]);
});

test("losse herdruk markeert alleen dat ene pakket als geprint", () => {
  const vandaag = lijst({ "34.2": 1, "2.1": 3 });
  markeerGeprint([vandaag], ["34.2"]);
  assert.deepEqual([...teBedrukkenPakketten([vandaag])], [["2.1", 3]]);
});

test("oude geprint-status (per pakketnummer) wordt overgenomen als het totaal klopt", () => {
  const a = lijst({ "34.2": 1, "2.1": 2 });
  const b = lijst({ "2.1": 1, "9.10": 5 });
  migreerOudeGeprintStatus([a, b], new Map([["34.2", 1], ["2.1", 3], ["9.10", 4], ["77.1", 1]]));
  // 34.2 (1 = 1) en 2.1 (3 = 2 + 1) waren geprint; 9.10 had een ander aantal.
  assert.deepEqual([...teBedrukkenPakketten([a, b])], [["9.10", 5]]);
});
