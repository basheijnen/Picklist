// Rekenwerk voor de periodekiezer in Verkopen (snelkeuzes en maandraster).
// Pure functies zonder DOM, zodat ze met `node --test` te testen zijn; in de
// browser komen ze als globals op window (dit script laadt vóór app.js).
(function (root) {
  const pad = (getal) => String(getal).padStart(2, "0");
  const iso = (datum) => `${datum.getFullYear()}-${pad(datum.getMonth() + 1)}-${pad(datum.getDate())}`;
  const naarDatum = (datumStr) => {
    const [jaar, maand, dag] = datumStr.split("-").map(Number);
    return new Date(jaar, maand - 1, dag);
  };
  const plusDagen = (datumStr, dagen) => {
    const datum = naarDatum(datumStr);
    datum.setDate(datum.getDate() + dagen);
    return iso(datum);
  };

  function periodeSnelkeuzes(vandaag) {
    const d = naarDatum(vandaag);
    const jaar = d.getFullYear();
    const maand = d.getMonth();
    return [
      { label: "Vandaag", van: vandaag, tot: vandaag },
      { label: "Gisteren", van: plusDagen(vandaag, -1), tot: plusDagen(vandaag, -1) },
      { label: "Laatste 7 dagen", van: plusDagen(vandaag, -6), tot: vandaag },
      { label: "Laatste 30 dagen", van: plusDagen(vandaag, -29), tot: vandaag },
      { label: "Deze maand", van: iso(new Date(jaar, maand, 1)), tot: iso(new Date(jaar, maand + 1, 0)) },
      { label: "Vorige maand", van: iso(new Date(jaar, maand - 1, 1)), tot: iso(new Date(jaar, maand, 0)) },
    ];
  }

  // 6 weken van maandag t/m zondag rond de gegeven maand (maand 1-12).
  function maandRaster(jaar, maand) {
    const eerste = new Date(jaar, maand - 1, 1);
    const start = new Date(jaar, maand - 1, 1 - ((eerste.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const datum = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        datum: iso(datum),
        dag: datum.getDate(),
        inMaand: datum.getMonth() === maand - 1,
        weekend: [0, 6].includes(datum.getDay()),
      };
    });
  }

  function verschuifMaand(jaar, maand, stap) {
    const datum = new Date(jaar, maand - 1 + stap, 1);
    return [datum.getFullYear(), datum.getMonth() + 1];
  }

  const api = { periodeSnelkeuzes, maandRaster, verschuifMaand };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
