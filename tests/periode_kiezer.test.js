const test = require("node:test");
const assert = require("node:assert/strict");
const { periodeSnelkeuzes, maandRaster, verschuifMaand } = require("../webapp/dist/periode_kiezer.js");

test("snelkeuzes rond woensdag 1 oktober 2026", () => {
  const keuzes = Object.fromEntries(periodeSnelkeuzes("2026-10-01").map((k) => [k.label, [k.van, k.tot]]));
  assert.deepEqual(keuzes, {
    Vandaag: ["2026-10-01", "2026-10-01"],
    Gisteren: ["2026-09-30", "2026-09-30"],
    "Laatste 7 dagen": ["2026-09-25", "2026-10-01"],
    "Laatste 30 dagen": ["2026-09-02", "2026-10-01"],
    "Deze maand": ["2026-10-01", "2026-10-31"],
    "Vorige maand": ["2026-09-01", "2026-09-30"],
  });
});

test("vorige maand over de jaargrens", () => {
  const keuzes = Object.fromEntries(periodeSnelkeuzes("2027-01-15").map((k) => [k.label, [k.van, k.tot]]));
  assert.deepEqual(keuzes["Vorige maand"], ["2026-12-01", "2026-12-31"]);
  assert.deepEqual(keuzes["Laatste 30 dagen"], ["2026-12-17", "2027-01-15"]);
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
