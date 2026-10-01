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
    // Weken lopen van maandag t/m zondag, net als de "Deze week"-tegel.
    const maandag = plusDagen(vandaag, -((d.getDay() + 6) % 7));
    return [
      { label: "Vandaag", van: vandaag, tot: vandaag },
      { label: "Deze week", van: maandag, tot: plusDagen(maandag, 6) },
      { label: "Vorige week", van: plusDagen(maandag, -7), tot: plusDagen(maandag, -1) },
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
