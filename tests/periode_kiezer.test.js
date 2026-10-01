const test = require("node:test");
const assert = require("node:assert/strict");
const { periodeSnelkeuzes, maandRaster, verschuifMaand } = require("../webapp/dist/periode_kiezer.js");

test("snelkeuzes rond woensdag 1 oktober 2026", () => {
  const keuzes = Object.fromEntries(periodeSnelkeuzes("2026-10-01").map((k) => [k.label, [k.van, k.tot]]));
  assert.deepEqual(keuzes, {
    Vandaag: ["2026-10-01", "2026-10-01"],
    "Deze week": ["2026-09-28", "2026-10-04"],
    "Vorige week": ["2026-09-21", "2026-09-27"],
    "Deze maand": ["2026-10-01", "2026-10-31"],
    "Vorige maand": ["2026-09-01", "2026-09-30"],
  });
});

test("vorige maand en weken rond de jaargrens", () => {
  const keuzes = Object.fromEntries(periodeSnelkeuzes("2027-01-15").map((k) => [k.label, [k.van, k.tot]]));
  assert.deepEqual(keuzes["Vorige maand"], ["2026-12-01", "2026-12-31"]);
  // Vrijdag 15-1-2027: deze week ma 11 t/m zo 17, vorige week ma 4 t/m zo 10.
  assert.deepEqual(keuzes["Deze week"], ["2027-01-11", "2027-01-17"]);
  assert.deepEqual(keuzes["Vorige week"], ["2027-01-04", "2027-01-10"]);
});

test("maandraster van september 2026 begint op maandag 31 augustus en heeft 6 weken", () => {
  const raster = maandRaster(2026, 9);
  assert.equal(raster.length, 42);
  assert.deepEqual(raster[0], { datum: "2026-08-31", dag: 31, inMaand: false, weekend: false });
  assert.deepEqual(raster[1], { datum: "2026-09-01", dag: 1, inMaand: true, weekend: false });
  assert.equal(raster[5].weekend, true);
  assert.equal(raster[6].datum, "2026-09-06");
  assert.equal(raster.filter((cel) => cel.inMaand).length, 30);
});

test("maand verschuiven over de jaargrens", () => {
  assert.deepEqual(verschuifMaand(2026, 12, 1), [2027, 1]);
  assert.deepEqual(verschuifMaand(2026, 1, -1), [2025, 12]);
});
