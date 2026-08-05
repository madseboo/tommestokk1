/* ============================================================================
   TOMMESTOKK1 — TESTER FOR BUTIKKSAMMENLIGNING
   ============================================================================
   Rene tester uten rammeverk. Kjøres i nettleser via tests.html, eller
   headless i en JS-motor. Alle forventede verdier er regnet for demoprosjektet
   «Terrasse 5,0 × 4,0 m (20 m²), postnummer 1440».
   ========================================================================= */
(function (root) {
  "use strict";

  const TR   = root.TommestokkRetail;
  const MOCK = root.TommestokkMockData;

  /* ---------- Bittelite testrammeverk ---------- */
  const tests = [];
  const test = (navn, fn) => tests.push({ navn, fn });
  function assert(betingelse, melding) {
    if (!betingelse) throw new Error(melding || "Forventet sann verdi");
  }
  function assertEq(faktisk, forventet, melding) {
    const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
    if (a !== b) throw new Error(`${melding || "Ikke likt"} — fikk ${a}, forventet ${b}`);
  }
  function assertClose(faktisk, forventet, slingring, melding) {
    if (Math.abs(faktisk - forventet) > slingring) {
      throw new Error(`${melding || "Utenfor slingringsmonn"} — fikk ${faktisk}, forventet ~${forventet}`);
    }
  }

  /* ---------- Fixtur: materiallisten fra Terrasse 5,0 × 4,0 m ----------
     Speiler nøyaktig det TE-modulen produserer med standardvalgene.
     quantity inneholder allerede svinn (som i kalkulatoren);
     need bærer råbehovet slik at pakke-/lengdelogikk kan regnes riktig. */
  const TERRASSE_20M2 = [
    { id:"tbjelke_48x148_c24", category:"terrassebjelke", title:"Terrassebjelke 48 × 148 C24 imp.",
      dimensions:"48x148", quality:"C24", treatment:"impregnert", quantity:38, unit:"lm", estPrice:45, lookup:{} },
    { id:"baerebjelke_48x198_c24", category:"baerebjelke", title:"Bærebjelke 48 × 198 C24 imp.",
      dimensions:"48x198", quality:"C24", treatment:"impregnert", quantity:16, unit:"lm", estPrice:65, lookup:{} },
    { id:"stolpe_98x98_imp", category:"stolpe", title:"Stolpe 98 × 98 imp.",
      dimensions:"98x98", treatment:"impregnert", quantity:6.3, unit:"lm", estPrice:75, lookup:{} },
    { id:"stolpesko_98", category:"beslag", title:"Justerbar stolpesko/søylefot",
      quantity:9, unit:"stk", estPrice:189, lookup:{} },
    { id:"terrassebord_28x120_imp", category:"terrassebord", title:"Terrassebord 28 × 120 imp.",
      dimensions:"28x120", treatment:"impregnert", quantity:173, unit:"lm", estPrice:30, lookup:{},
      need:{ quantity:160, unit:"lm", wastePercentage:8 } },
    { id:"terrasseskrue_48x75_a4", category:"skrue", title:"Terrasseskruer 4,8 × 75 A4 (pk à 250)",
      quantity:3, unit:"pk", estPrice:349, lookup:{},
      need:{ quantity:576, unit:"stk", wastePercentage:0 } },
    { id:"vinkelbeslag_90", category:"beslag", title:"Vinkelbeslag 90° m/ beslagskruer",
      quantity:27, unit:"stk", estPrice:12, lookup:{} },
    { id:"bolt_m10", category:"festemiddel", title:"Gjennomgående bolt M10 m/ mutter og skive",
      quantity:18, unit:"stk", estPrice:15, lookup:{} },
  ];

  /* Fast «nå» så tester på utdaterte data er forutsigbare. */
  const NAA = new Date("2026-07-23T15:00:00+02:00");

  function nyMotor() { return TR.createEngine(TR.createMockProvider(MOCK)); }
  function krav()     { return nyMotor().requirementsFrom(TERRASSE_20M2); }
  function butikk(id) { return MOCK.stores.find(s => s.id === id); }
  function origo()    { return nyMotor().resolveOrigin("1440").origin; }
  function alleTilbud() {
    const m = nyMotor();
    return m.quoteAll(krav(), { origin: origo(), now: NAA });
  }
  function tilbudFor(storeId) {
    return alleTilbud().quotes.find(q => q.store.id === storeId);
  }
  function linje(q, genericId) { return q.lines.find(l => l.genericId === genericId); }

  /* ==================== 1. Antall bord fra løpemeter ==================== */
  test("Regner antall bord fra løpemeter og produktlengde", () => {
    const q = tilbudFor("monter_vinterbro");
    const l = linje(q, "terrassebord_28x120_imp");
    // 173 lm (inkl. svinn) ÷ 4,8 m per bord = 36,04 → 37 bord
    assertEq(l.units, 37, "Antall bord");
    assertEq(l.productLength, 4.8, "Produktlengde");
    assertEq(l.unitsBasis, "lengde", "Beregningsgrunnlag");
  });

  /* ==================== 2. Avrunding til hele produkter ==================== */
  test("Runder alltid opp til hele produkter", () => {
    const q = tilbudFor("byggmax_drobak");
    // 173 ÷ 4,2 = 41,19 → 42 bord (aldri 41)
    assertEq(linje(q, "terrassebord_28x120_imp").units, 42, "Byggmax, 4,2 m bord");
    // 38 lm bjelke ÷ 4,2 = 9,05 → 10 stk
    assertEq(linje(q, "tbjelke_48x148_c24").units, 10, "Terrassebjelke");
    // 6,3 lm stolpe ÷ 3,0 = 2,1 → 3 stk
    assertEq(linje(q, "stolpe_98x98_imp").units, 3, "Stolpe");
  });

  /* ==================== 3. Avrunding til hele pakker ==================== */
  test("Runder opp til hele pakker etter butikkens pakningsstørrelse", () => {
    // Behovet er 576 skruer. Butikkene selger 200/250/300 per pakke.
    assertEq(linje(tilbudFor("byggmax_drobak"), "terrasseskrue_48x75_a4").units, 3, "200 per pk → 3");
    assertEq(linje(tilbudFor("monter_vinterbro"), "terrasseskrue_48x75_a4").units, 3, "250 per pk → 3");
    assertEq(linje(tilbudFor("xlbygg_ski"), "terrasseskrue_48x75_a4").units, 2, "300 per pk → 2");
    assertEq(linje(tilbudFor("xlbygg_ski"), "terrasseskrue_48x75_a4").unitsBasis, "pakning", "Grunnlag");
  });

  /* ==================== 4. Svinn ==================== */
  test("Bruker mengde inkludert svinn, og dobbelttelller ikke svinn", () => {
    const l = linje(tilbudFor("monter_vinterbro"), "terrassebord_28x120_imp");
    assertEq(l.baseQuantity, 160, "Råbehov før svinn");
    assertEq(l.wastePercentage, 8, "Svinnprosent");
    assertEq(l.totalNeed, 173, "Totalt behov = kalkulatorens mengde, ikke 160×1,08 igjen");
  });

  test("Varelinjer uten svinndata får 0 % og behov = mengde", () => {
    const l = linje(tilbudFor("monter_vinterbro"), "bolt_m10");
    assertEq(l.wastePercentage, 0, "Svinn");
    assertEq(l.baseQuantity, 18, "Råbehov");
    assertEq(l.totalNeed, 18, "Totalt behov");
  });

  /* ==================== 5. Prisberegning ==================== */
  test("Linjesum = antall enheter × pris per salgsenhet", () => {
    const l = linje(tilbudFor("monter_vinterbro"), "terrassebord_28x120_imp");
    assertEq(l.unitPrice, 139, "Pris per bord");
    assertEq(l.lineSum, 37 * 139, "Linjesum");
  });

  test("Kampanjepris brukes framfor ordinær pris", () => {
    const l = linje(tilbudFor("xlbygg_ski"), "terrassebord_28x120_imp");
    assertEq(l.unitPrice, 139, "Kampanjepris");
    assertEq(l.campaign, true, "Merket som kampanje");
    assertEq(l.previousPrice, 145, "Førpris beholdt");
  });

  test("Totalpris per butikk summerer alle varelinjer", () => {
    assertEq(tilbudFor("byggmax_drobak").total, 12886, "Byggmax");
    assertEq(tilbudFor("xlbygg_ski").total, 12954, "XL-BYGG");
    assertEq(tilbudFor("monter_vinterbro").total, 13576, "Montér");
    assertEq(tilbudFor("obsbygg_vinterbro").total, 13837, "Obs BYGG");
  });

  test("Lav stykkpris kan gi høyere totalpris (korte lengder)", () => {
    const obs = linje(tilbudFor("obsbygg_vinterbro"), "terrassebord_28x120_imp");
    const xl  = linje(tilbudFor("xlbygg_ski"), "terrassebord_28x120_imp");
    assert(obs.unitPrice < xl.unitPrice, "Obs har lavest stykkpris");
    assert(obs.lineSum > xl.lineSum, "…men høyest linjesum fordi bordene er kortere");
    assertEq([obs.units, xl.units], [49, 37], "49 korte bord mot 37 lange");
  });

  /* ==================== 6. Lagerdekning ==================== */
  test("Regner lagerdekning i prosent", () => {
    assertEq(tilbudFor("byggmax_drobak").coveragePct, 75, "6 av 8 varelinjer");
    assertEq(tilbudFor("monter_vinterbro").coveragePct, 100, "Alle varelinjer");
    assertEq(tilbudFor("maxbo_holter").coveragePct, 88, "7 av 8 (én ukjent)");
  });

  test("Komplett krever match, pris og nok lager på alle linjer", () => {
    assertEq(tilbudFor("monter_vinterbro").isComplete, true, "Montér er komplett");
    assertEq(tilbudFor("xlbygg_ski").isComplete, true, "XL-BYGG er komplett");
    assertEq(tilbudFor("byggmax_drobak").isComplete, false, "Byggmax mangler varer");
    assertEq(tilbudFor("maxbo_holter").isComplete, false, "Maxbo har ukjent lager og manglende pris");
  });

  /* ==================== 7. Rangering etter pris ==================== */
  test("Rangerer butikker etter samlet pris", () => {
    const r = alleTilbud();
    const rekkefolge = TR.Ranking.cheapest(r.quotes).map(q => q.store.id);
    assertEq(rekkefolge[0], "byggmax_drobak", "Billigst totalt");
    assertEq(rekkefolge[rekkefolge.length - 1], "maxbo_holter", "Dyrest totalt");
  });

  test("Billigste komplette butikk er ikke nødvendigvis den billigste", () => {
    const r = alleTilbud();
    const billigst = TR.Ranking.cheapest(r.quotes)[0];
    const billigstKomplett = TR.Ranking.cheapestComplete(r.quotes)[0];
    assertEq(billigst.store.id, "byggmax_drobak", "Billigst");
    assertEq(billigstKomplett.store.id, "xlbygg_ski", "Billigst komplett");
    assert(billigstKomplett.total > billigst.total, "Komplett koster mer her");
  });

  test("Regner prisforskjell fra billigste alternativ", () => {
    const r = alleTilbud();
    const xl = r.quotes.find(q => q.store.id === "xlbygg_ski");
    assertEq(TR.Ranking.diffFromCheapest(xl, r.quotes), 12954 - 12886, "XL mot Byggmax");
    const diffs = TR.Ranking.priceDiffs(r.quotes);
    assertEq(diffs.find(d => d.storeId === "byggmax_drobak").isCheapest, true, "Byggmax er billigst");
  });

  /* ==================== 8. Rangering etter avstand ==================== */
  test("Rangerer butikker etter avstand fra postnummer", () => {
    const r = alleTilbud();
    const rekkefolge = TR.Ranking.nearest(r.quotes).map(q => q.store.id);
    assertEq(rekkefolge[0], "byggmax_drobak", "Nærmest 1440 Drøbak");
    assertEq(rekkefolge[rekkefolge.length - 1], "maxbo_holter", "Lengst unna");
  });

  test("Regner avstand mellom to punkter", () => {
    const km = TR.haversineKm(origo(), butikk("byggmax_drobak"));
    assertClose(km, 0.3, 0.5, "Drøbak sentrum til Byggmax Drøbak");
    const langt = TR.haversineKm(origo(), butikk("maxbo_holter"));
    assert(langt > 45 && langt < 70, `Drøbak til Holter skal være ~50-60 km, fikk ${langt}`);
  });

  test("Nærmeste komplette butikk hopper over butikker som mangler varer", () => {
    const r = alleTilbud();
    const naermest = TR.Ranking.nearest(r.quotes)[0];
    const naermestKomplett = TR.Ranking.nearestComplete(r.quotes)[0];
    assertEq(naermest.store.id, "byggmax_drobak", "Nærmest totalt");
    assert(naermestKomplett.store.id !== "byggmax_drobak", "Nærmeste komplette er en annen butikk");
    assertEq(naermestKomplett.isComplete, true, "…og den er faktisk komplett");
  });

  /* ==================== 9. Manglende pris ==================== */
  test("Håndterer manglende pris uten å krasje", () => {
    const q = tilbudFor("maxbo_holter");
    const l = linje(q, "bolt_m10");
    assertEq(l.unitPrice, null, "Ingen pris");
    assertEq(l.lineSum, null, "Ingen linjesum");
    assertEq(l.issue, "mangler_pris", "Tilstand");
    assertEq(q.linesWithoutPrice, 1, "Telles på butikknivå");
    assertEq(q.priceIsPartial, true, "Totalen er ufullstendig");
    assert(q.total > 0, "Resten av listen er fortsatt priset");
  });

  /* ==================== 10. Ukjent lagerstatus ==================== */
  test("Håndterer ukjent lagerstatus som ikke-bekreftet", () => {
    const q = tilbudFor("maxbo_holter");
    const l = linje(q, "vinkelbeslag_90");
    assertEq(l.stockStatus, TR.LAGER.UKJENT, "Status");
    assertEq(l.stockText, "Lagerstatus ukjent", "Tekst, ikke bare farge");
    assertEq(l.sufficient, false, "Ukjent regnes ikke som bekreftet nok");
    assertEq(q.linesUnknownStock, 1, "Telles separat");
    assertEq(q.isComplete, false, "Butikken kan ikke kalles komplett");
  });

  /* ==================== 11. Produktmatching ==================== */
  test("Skiller mellom likeverdig og alternativt produkt", () => {
    const monter = linje(tilbudFor("monter_vinterbro"), "stolpesko_98");
    assertEq(monter.matchType, TR.MATCH_LIKEVERDIG, "Montér har likeverdig stolpesko");
    assertEq(monter.requiresApproval, false, "Ingen godkjenning nødvendig");

    const xl = linje(tilbudFor("xlbygg_ski"), "stolpesko_98");
    assertEq(xl.matchType, TR.MATCH_ALTERNATIV, "XL har kun fast variant");
    assert(xl.differences.length > 0, "Avvik er beskrevet");
  });

  test("Alternativt produkt i sikkerhetskritisk kategori krever godkjenning", () => {
    const xl = linje(tilbudFor("xlbygg_ski"), "stolpesko_98");
    assertEq(TR.isCritical("beslag"), true, "Beslag er kritisk kategori");
    assertEq(xl.requiresApproval, true, "Krever godkjenning");
    assertEq(tilbudFor("xlbygg_ski").linesNeedingApproval, 1, "Telles på butikknivå");
  });

  test("Identisk produkt gjenkjennes på NOBB-nummer", () => {
    const krav = TR.toRequirement({ id:"x", category:"plate", title:"Plate", quantity:1, unit:"stk",
      lookup:{ nobb:"40996704" } });
    const treff = TR.ProductMatcher.classify(krav, { nobbNumber:"40996704", properties:{} });
    assertEq(treff.matchType, TR.MATCH_IDENTISK, "Samme NOBB → identisk");
    assertEq(treff.matchScore, 1, "Full score");
  });

  test("Avvikende egenskaper gir alternativ match", () => {
    const krav = TR.toRequirement({ id:"y", category:"terrassebord", title:"Bord",
      dimensions:"28x120", treatment:"impregnert", quantity:10, unit:"lm", lookup:{} });
    const treff = TR.ProductMatcher.classify(krav,
      { nobbNumber:"ANNET", thickness:21, width:95, properties:{ behandling:"ubehandlet" } });
    assertEq(treff.matchType, TR.MATCH_ALTERNATIV, "Ulik dimensjon og behandling");
    assert(treff.differences.length >= 2, "Begge avvik beskrevet");
  });

  /* ==================== 12. Utilstrekkelig lager ==================== */
  test("Butikk med for lite på lager markeres tydelig", () => {
    const q = tilbudFor("byggmax_drobak");
    const bolt = linje(q, "bolt_m10");
    assertEq(bolt.stockStatus, TR.LAGER.IKKE_NOK, "Status");
    assertEq(bolt.stockText, "Ikke nok på lager", "Tekst");
    assertEq(bolt.shortfallText, "Trenger 18 – 12 på lager", "Differansetekst");
    assertEq(bolt.sufficient, false, "Ikke tilstrekkelig");

    const sko = linje(q, "stolpesko_98");
    assertEq(sko.stockStatus, TR.LAGER.IKKE_PA_LAGER, "Utsolgt");
    assertEq(sko.stockText, "Ikke på lager", "Tekst");
    assertEq(q.linesMissing, 2, "To manglende varelinjer");
  });

  test("Begrenset lager skilles fra god beholdning", () => {
    // Montér har nøyaktig 3 bærebjelker og behovet er 3.
    const l = linje(tilbudFor("monter_vinterbro"), "baerebjelke_48x198_c24");
    assertEq(l.units, 3, "Behov");
    assertEq(l.stockStatus, TR.LAGER.BEGRENSET, "Begrenset");
    assertEq(l.stockText, "Begrenset lager", "Tekst");
    assertEq(l.sufficient, true, "Men fortsatt nok");
  });

  test("Lagerstatus har alltid tekstlig beskrivelse", () => {
    Object.values(TR.LAGER).forEach(status => {
      assert(typeof TR.LAGER_TEKST[status] === "string" && TR.LAGER_TEKST[status].length > 0,
        `Mangler tekst for status ${status}`);
    });
  });

  /* ==================== Feiltilstander ==================== */
  test("Ugyldig postnummer gir tydelig feil", () => {
    const r = nyMotor().resolveOrigin("9999");
    assertEq(r.ok, false, "Ikke ok");
    assertEq(r.error, "ugyldig_postnummer", "Feilkode");
    assert(r.errorText.includes("9999"), "Feilmelding nevner postnummeret");
  });

  test("Gyldig postnummer gir posisjon", () => {
    const r = nyMotor().resolveOrigin("1440");
    assertEq(r.ok, true, "Ok");
    assertEq(r.origin.sted, "Drøbak", "Sted");
  });

  test("Tom handleliste gir feiltilstand", () => {
    const r = nyMotor().quoteAll([], {});
    assertEq(r.ok, false, "Ikke ok");
    assertEq(r.error, "tom_liste", "Feilkode");
  });

  test("Ingen butikker funnet gir feiltilstand", () => {
    const tomProvider = TR.createMockProvider(
      Object.assign({}, MOCK, { stores: [] }));
    const r = TR.createEngine(tomProvider).quoteAll(krav(), {});
    assertEq(r.ok, false, "Ikke ok");
    assertEq(r.error, "ingen_butikker", "Feilkode");
  });

  test("Produkt som ikke finnes i butikken gir ingen_match", () => {
    const utenMatcher = TR.createMockProvider(Object.assign({}, MOCK, { matches: [] }));
    const q = TR.quoteStore(utenMatcher, krav(), butikk("monter_vinterbro"), { now: NAA });
    assertEq(q.lines[0].matched, false, "Ikke matchet");
    assertEq(q.lines[0].issue, "ingen_match", "Tilstand");
    assertEq(q.isComplete, false, "Kan ikke være komplett");
    assertEq(q.coveragePct, 0, "Ingen dekning");
  });

  test("Utdaterte data merkes", () => {
    const q = tilbudFor("maxbo_holter");
    assert(q.linesStale > 0, "Maxbo har varelinjer med gamle data");
    const ferskt = tilbudFor("monter_vinterbro");
    assertEq(ferskt.linesStale, 0, "Montér har ferske data");
  });

  test("Når ingen butikk er komplett, finnes beste dekning", () => {
    // Fjern alle butikker unntatt de to som mangler varer.
    const redusert = Object.assign({}, MOCK, {
      stores: MOCK.stores.filter(s => ["byggmax_drobak", "maxbo_holter"].includes(s.id)),
    });
    const r = TR.createEngine(TR.createMockProvider(redusert))
      .quoteAll(krav(), { origin: origo(), now: NAA });
    assertEq(r.anyComplete, false, "Ingen komplette");
    assertEq(r.bestCoverage.store.id, "maxbo_holter", "Maxbo har best dekning (88 % mot 75 %)");
  });

  /* ==================== Datakilde og merking ==================== */
  test("Alle data er merket som testdata og ikke live", () => {
    const q = tilbudFor("monter_vinterbro");
    assertEq(q.isLive, false, "Ikke live");
    assertEq(q.dataSource, "mock:testdata", "Datakilde");
    assert(MOCK.meta.label.toLowerCase().includes("testdata"), "Merkelapp sier testdata");
    q.lines.forEach(l => {
      if (l.matched) assertEq(l.isLive, false, `Varelinje ${l.genericId} skal ikke være live`);
    });
  });

  test("Hver varelinje har tidspunkt for siste oppdatering", () => {
    tilbudFor("monter_vinterbro").lines.forEach(l => {
      if (l.matched) assert(!!l.lastUpdated, `Mangler tidsstempel: ${l.genericId}`);
    });
  });

  /* ==================== Provider-uavhengighet ==================== */
  test("Motoren fungerer med en annen provider (adapterlaget holder)", () => {
    // Minimal alternativ «feed» — samme grensesnitt, helt andre data.
    const enkelProvider = {
      meta: { dataSource:"test:annen-feed", isLive:false, label:"Annen testkilde" },
      getRetailers: () => [{ id:"r1", name:"Testkjeden" }],
      getStores: () => [{ id:"s1", retailerId:"r1", name:"Testbutikk",
        postalCode:"1440", latitude:59.66, longitude:10.63, shippingFee:null }],
      resolvePostalCode: nr => nr === "1440" ? { postnummer:"1440", sted:"Drøbak", latitude:59.66, longitude:10.63 } : null,
      getProduct: id => id === "p1"
        ? { id:"p1", retailerId:"r1", name:"Testbord 4 m", salesUnit:"stk", length:4, packageQuantity:1 } : null,
      getMatches: g => g === "terrassebord_28x120_imp"
        ? [{ genericMaterialId:g, retailerProductId:"p1", matchType:"likeverdig", matchScore:0.9, differences:[] }] : [],
      getOffer: () => ({ storeId:"s1", retailerProductId:"p1", price:100, campaignPrice:null,
        stockQuantity:500, lastUpdated:"2026-07-23T14:00:00+02:00", dataSource:"test:annen-feed", isLive:false }),
    };
    const motor = TR.createEngine(enkelProvider);
    const r = motor.quoteAll(motor.requirementsFrom(TERRASSE_20M2), { now: NAA });
    assertEq(r.ok, true, "Motoren kjører");
    const q = r.quotes[0];
    // 173 lm ÷ 4 m = 43,25 → 44 bord à 100 kr
    assertEq(linje(q, "terrassebord_28x120_imp").units, 44, "Beregning følger den nye provideren");
    assertEq(q.dataSource, "test:annen-feed", "Datakilde følger provideren");
  });

  /* ==================== Kjører ==================== */
  function run() {
    const resultater = tests.map(t => {
      try { t.fn(); return { navn: t.navn, ok: true }; }
      catch (e) { return { navn: t.navn, ok: false, feil: e.message }; }
    });
    const feilet = resultater.filter(r => !r.ok);
    return { totalt: resultater.length, bestått: resultater.length - feilet.length,
             feilet: feilet.length, resultater };
  }

  const API = { run, tests, TERRASSE_20M2 };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.TommestokkRetailTests = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
