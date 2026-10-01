// Welke pakketkaarten nog geprint moeten worden. De "al geprint"-status hoort
// bij een lijst (lijst.geprint: pakketnummer → aantal bij de laatste print),
// niet los bij een pakketnummer: verwijder je de lijst van gisteren, dan gaat
// zijn status mee weg en print een pakket in de lijst van vandaag gewoon,
// ook als het toevallig hetzelfde aantal heeft als gisteren.
// Pure functies zonder DOM, zodat ze met `node --test` te testen zijn; in de
// browser komen ze als globals op window (dit script laadt vóór app.js).
(function (root) {
  function totalen(lijsten) {
    const totaal = new Map();
    lijsten.forEach((lijst) => lijst.orderCounts.forEach((aantal, pakketnummer) => {
      totaal.set(pakketnummer, (totaal.get(pakketnummer) || 0) + aantal);
    }));
    return totaal;
  }

  // Pakketten waarvan in minstens één lijst het aantal nieuw of anders is dan
  // bij de laatste print — met het totaal over alle lijsten, want dat aantal
  // stickers hoort op de kaart.
  function teBedrukkenPakketten(lijsten) {
    const totaal = totalen(lijsten);
    const teBedrukken = new Map();
    totaal.forEach((aantal, pakketnummer) => {
      const gewijzigd = lijsten.some((lijst) => lijst.orderCounts.has(pakketnummer)
        && lijst.geprint.get(pakketnummer) !== lijst.orderCounts.get(pakketnummer));
      if (gewijzigd) teBedrukken.set(pakketnummer, aantal);
    });
    return teBedrukken;
  }

  // Zonder pakketnummers: alles in deze lijsten geldt als geprint.
  function markeerGeprint(lijsten, pakketnummers = null) {
    const alleen = pakketnummers ? new Set(pakketnummers) : null;
    lijsten.forEach((lijst) => lijst.orderCounts.forEach((aantal, pakketnummer) => {
      if (!alleen || alleen.has(pakketnummer)) lijst.geprint.set(pakketnummer, aantal);
    }));
  }

  // Eenmalige overstap van de oude status (pakketnummer → geprint totaal):
  // alleen pakketten waarvan het totaal nog klopt tellen als geprint.
  function migreerOudeGeprintStatus(lijsten, oud) {
    const totaal = totalen(lijsten);
    const geprint = [...oud.entries()]
      .filter(([pakketnummer, aantal]) => totaal.has(pakketnummer) && totaal.get(pakketnummer) === aantal)
      .map(([pakketnummer]) => pakketnummer);
    markeerGeprint(lijsten, geprint);
  }

  const api = { teBedrukkenPakketten, markeerGeprint, migreerOudeGeprintStatus };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
