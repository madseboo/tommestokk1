/* ============================================================================
   TOMMESTOKK1 — TESTDATA FOR BUTIKKSAMMENLIGNING
   ============================================================================
   ⚠ ALT I DENNE FILEN ER TESTDATA. Ingenting hentes live.
   Priser, lagerantall, avstander og varenumre er oppdiktet for å demonstrere
   beregningslogikken. NOBB-numre er prefikset "TEST-" nettopp for at de ikke
   skal forveksles med ekte NOBB-numre.

   Denne filen er den ENESTE som skal byttes ut når ekte datakilder kobles på.
   retail.js (logikken) og UI-et i index.html kjenner ikke innholdet her — de
   snakker kun med provider-grensesnittene i retail.js.
   ========================================================================= */
(function (root) {
  "use strict";

  /* ---------- Kjeder ---------- */
  const RETAILERS = [
    { id: "byggmax",  name: "Byggmax",   logo: null },
    { id: "monter",   name: "Montér",    logo: null },
    { id: "obsbygg",  name: "Obs BYGG",  logo: null },
    { id: "xlbygg",   name: "XL-BYGG",   logo: null },
    { id: "maxbo",    name: "Maxbo",     logo: null },
  ];

  /* ---------- Varehus (koordinater er omtrentlige testverdier) ---------- */
  const STORES = [
    { id:"byggmax_drobak",    retailerId:"byggmax", name:"Byggmax Drøbak",
      address:"Osloveien 12",       postalCode:"1440", city:"Drøbak",
      latitude:59.6650, longitude:10.6320, shippingFee:null },
    { id:"monter_vinterbro",  retailerId:"monter",  name:"Montér Vinterbro",
      address:"Vinterbroveien 3",   postalCode:"1407", city:"Vinterbro",
      latitude:59.7361, longitude:10.7861, shippingFee:790 },
    { id:"obsbygg_vinterbro", retailerId:"obsbygg", name:"Obs BYGG Vinterbro",
      address:"Vinterbrosenteret",  postalCode:"1407", city:"Vinterbro",
      latitude:59.7340, longitude:10.7820, shippingFee:890 },
    { id:"xlbygg_ski",        retailerId:"xlbygg",  name:"XL-BYGG Ski",
      address:"Kjeppestadveien 45", postalCode:"1400", city:"Ski",
      latitude:59.7195, longitude:10.8355, shippingFee:690 },
    { id:"maxbo_holter",      retailerId:"maxbo",   name:"Maxbo Holter",
      address:"Holterveien 8",      postalCode:"2034", city:"Holter",
      latitude:60.1069, longitude:11.0656, shippingFee:1290 },
  ];

  /* ---------- Postnummer (lite testoppslag, erstattes av ekte register) ---------- */
  const POSTAL_CODES = {
    "1440": { sted:"Drøbak",        latitude:59.6633, longitude:10.6294 },
    "1443": { sted:"Drøbak",        latitude:59.6700, longitude:10.6400 },
    "1445": { sted:"Heer",          latitude:59.6820, longitude:10.6390 },
    "1407": { sted:"Vinterbro",     latitude:59.7361, longitude:10.7861 },
    "1400": { sted:"Ski",           latitude:59.7195, longitude:10.8355 },
    "1430": { sted:"Ås",            latitude:59.6647, longitude:10.7861 },
    "1450": { sted:"Nesoddtangen",  latitude:59.8490, longitude:10.6560 },
    "2034": { sted:"Holter",        latitude:60.1069, longitude:11.0656 },
    "0150": { sted:"Oslo",          latitude:59.9111, longitude:10.7528 },
    "1384": { sted:"Asker",         latitude:59.8340, longitude:10.4350 },
  };

  /* ---------- Tidsstempler (faste, så demoen er forutsigbar) ---------- */
  const T = {
    fersk:   "2026-07-23T14:32:00+02:00",
    fersk2:  "2026-07-23T14:05:00+02:00",
    utdatert:"2026-07-09T09:15:00+02:00",   // >14 dager → skal merkes som utdatert
  };

  /* ==========================================================================
     PRODUKTER OG TILBUD
     Struktur: ett generisk materialbehov (id fra Catalog i index.html) →
     flere butikkprodukter. Hver variant har produktdata, butikktilbud og
     matchvurdering — nøyaktig de tre modellene i datamodellen.
     ========================================================================== */
  const KATALOG = [

    /* --- Terrassebjelke 48 × 148 C24 -------------------------------------- */
    { generic:"tbjelke_48x148_c24", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-4814-42", nobbNumber:"TEST-51002011", gtin:"TEST-7053001110011",
          name:"Konstruksjonsvirke 48 × 148 C24 trykkimpregnert", category:"terrassebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.2, width:148, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/48x148-c24" },
        tilbud:{ price:279, previousPrice:319, campaignPrice:null, stockQuantity:120, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.94, differences:["Kappet i 4,2 m — 10 stk dekker behovet"] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-C24-48148", nobbNumber:"TEST-51002012", gtin:null,
          name:"Terrassebjelke 48 × 148 C24 imp. NTR A", category:"terrassebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:148, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/48x148-c24" },
        tilbud:{ price:339, previousPrice:null, campaignPrice:null, stockQuantity:64, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-48148-C24", nobbNumber:"TEST-51002013", gtin:null,
          name:"Impregnert konstruksjonsvirke 48 × 148 C24", category:"terrassebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:148, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/48x148-c24" },
        tilbud:{ price:349, previousPrice:null, campaignPrice:329, stockQuantity:48, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-48148C24", nobbNumber:"TEST-51002014", gtin:null,
          name:"Terrassebjelke 48 × 148 C24 imp.", category:"terrassebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.2, width:148, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/48x148-c24" },
        tilbud:{ price:295, previousPrice:null, campaignPrice:null, stockQuantity:90, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-48148", nobbNumber:"TEST-51002015", gtin:null,
          name:"Konstruksjonsvirke 48 × 148 C24 imp.", category:"terrassebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:148, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/48x148-c24" },
        tilbud:{ price:365, previousPrice:null, campaignPrice:null, stockQuantity:30, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },
    ]},

    /* --- Bærebjelke 48 × 198 C24 ------------------------------------------ */
    { generic:"baerebjelke_48x198_c24", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-48198-48", nobbNumber:"TEST-51003011", gtin:null,
          name:"Konstruksjonsvirke 48 × 198 C24 trykkimpregnert", category:"baerebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:198, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/48x198-c24" },
        tilbud:{ price:415, previousPrice:null, campaignPrice:null, stockQuantity:40, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-C24-48198", nobbNumber:"TEST-51003012", gtin:null,
          name:"Bærebjelke 48 × 198 C24 imp. NTR A", category:"baerebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:5.4, width:198, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/48x198-c24" },
        tilbud:{ price:519, previousPrice:null, campaignPrice:null, stockQuantity:3, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-48198-C24", nobbNumber:"TEST-51003013", gtin:null,
          name:"Impregnert konstruksjonsvirke 48 × 198 C24", category:"baerebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:198, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/48x198-c24" },
        tilbud:{ price:459, previousPrice:null, campaignPrice:null, stockQuantity:4, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-48198C24", nobbNumber:"TEST-51003014", gtin:null,
          name:"Bærebjelke 48 × 198 C24 imp.", category:"baerebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:5.4, width:198, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/48x198-c24" },
        tilbud:{ price:495, previousPrice:null, campaignPrice:null, stockQuantity:18, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-48198", nobbNumber:"TEST-51003015", gtin:null,
          name:"Konstruksjonsvirke 48 × 198 C24 imp.", category:"baerebjelke",
          properties:{ kvalitet:"C24", behandling:"impregnert NTR A", tresort:"gran" },
          length:4.8, width:198, thickness:48, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/48x198-c24" },
        tilbud:{ price:485, previousPrice:null, campaignPrice:null, stockQuantity:14, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },
    ]},

    /* --- Stolpe 98 × 98 imp. ---------------------------------------------- */
    { generic:"stolpe_98x98_imp", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-9898-30", nobbNumber:"TEST-51004011", gtin:null,
          name:"Stolpe 98 × 98 trykkimpregnert", category:"stolpe",
          properties:{ behandling:"impregnert NTR A", tresort:"furu" },
          length:3.0, width:98, thickness:98, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/98x98" },
        tilbud:{ price:239, previousPrice:null, campaignPrice:null, stockQuantity:35, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-9898-24", nobbNumber:"TEST-51004012", gtin:null,
          name:"Impregnert stolpe 98 × 98 NTR A", category:"stolpe",
          properties:{ behandling:"impregnert NTR A", tresort:"furu" },
          length:2.4, width:98, thickness:98, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/98x98" },
        tilbud:{ price:229, previousPrice:null, campaignPrice:null, stockQuantity:44, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-9898", nobbNumber:"TEST-51004013", gtin:null,
          name:"Stolpe 98 × 98 imp.", category:"stolpe",
          properties:{ behandling:"impregnert NTR A", tresort:"furu" },
          length:3.0, width:98, thickness:98, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/98x98" },
        tilbud:{ price:265, previousPrice:null, campaignPrice:null, stockQuantity:20, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-9898", nobbNumber:"TEST-51004014", gtin:null,
          name:"Stolpe 98 × 98 imp. NTR A", category:"stolpe",
          properties:{ behandling:"impregnert NTR A", tresort:"furu" },
          length:2.4, width:98, thickness:98, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/98x98" },
        tilbud:{ price:219, previousPrice:null, campaignPrice:null, stockQuantity:52, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-9898", nobbNumber:"TEST-51004015", gtin:null,
          name:"Stolpe 98 × 98 imp.", category:"stolpe",
          properties:{ behandling:"impregnert NTR A", tresort:"furu" },
          length:3.0, width:98, thickness:98, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/98x98" },
        tilbud:{ price:279, previousPrice:null, campaignPrice:null, stockQuantity:12, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },
    ]},

    /* --- Justerbar stolpesko (bærende beslag — sikkerhetskritisk) ---------- */
    { generic:"stolpesko_98", varianter:[
      /* Byggmax: utsolgt → demonstrerer "Ikke på lager" */
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-STSKO-98", nobbNumber:"TEST-52001011", gtin:null,
          name:"Justerbar stolpesko 98 mm varmforsinket", category:"beslag",
          properties:{ materiale:"varmforsinket stål", justerbar:"ja" },
          length:null, width:98, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/stolpesko-98" },
        tilbud:{ price:169, previousPrice:null, campaignPrice:null, stockQuantity:0, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.93, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-STSKO-98", nobbNumber:"TEST-52001012", gtin:null,
          name:"Justerbar søylefot 98 mm varmforsinket", category:"beslag",
          properties:{ materiale:"varmforsinket stål", justerbar:"ja" },
          length:null, width:98, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/soylefot-98" },
        tilbud:{ price:199, previousPrice:null, campaignPrice:null, stockQuantity:36, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-STSKO", nobbNumber:"TEST-52001013", gtin:null,
          name:"Stolpesko justerbar 98 mm", category:"beslag",
          properties:{ materiale:"varmforsinket stål", justerbar:"ja" },
          length:null, width:98, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/stolpesko-98" },
        tilbud:{ price:189, previousPrice:null, campaignPrice:null, stockQuantity:24, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      /* XL-BYGG: kun fastmontert variant → alternativ i sikkerhetskritisk kategori */
      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-STSKO-FAST", nobbNumber:"TEST-52001014", gtin:null,
          name:"Stolpesko 98 mm fast (ikke justerbar)", category:"beslag",
          properties:{ materiale:"varmforsinket stål", justerbar:"nei" },
          length:null, width:98, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/stolpesko-fast" },
        tilbud:{ price:139, previousPrice:null, campaignPrice:null, stockQuantity:40, lastUpdated:T.fersk },
        match:{ matchType:"alternativ", matchScore:0.72,
          differences:["Fast innfesting — kan ikke høydejusteres på plass","Krever nøyaktig fundamenthøyde"] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-STSKO", nobbNumber:"TEST-52001015", gtin:null,
          name:"Justerbar stolpesko 98 mm", category:"beslag",
          properties:{ materiale:"varmforsinket stål", justerbar:"ja" },
          length:null, width:98, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/stolpesko-98" },
        tilbud:{ price:215, previousPrice:null, campaignPrice:null, stockQuantity:16, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },
    ]},

    /* --- Terrassebord 28 × 120 imp. (viser lengde-effekten på totalpris) --- */
    { generic:"terrassebord_28x120_imp", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-TB-28120-42", nobbNumber:"TEST-53001011", gtin:"TEST-7053001120014",
          name:"Terrassebord 28 × 120 × 4200 mm imp.", category:"terrassebord",
          properties:{ behandling:"impregnert NTR AB", profil:"glatt/rillet", tresort:"furu" },
          length:4.2, width:120, thickness:28, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/terrassebord-4200" },
        tilbud:{ price:115, previousPrice:135, campaignPrice:null, stockQuantity:210, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-TB-28120-48", nobbNumber:"TEST-53001012", gtin:null,
          name:"Terrassebord 28 × 120 × 4800 mm imp. NTR AB", category:"terrassebord",
          properties:{ behandling:"impregnert NTR AB", profil:"glatt/rillet", tresort:"furu" },
          length:4.8, width:120, thickness:28, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/terrassebord-4800" },
        tilbud:{ price:139, previousPrice:null, campaignPrice:null, stockQuantity:180, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.97, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-TB-28120-36", nobbNumber:"TEST-53001013", gtin:null,
          name:"Terrassebord 28 × 120 × 3600 mm imp.", category:"terrassebord",
          properties:{ behandling:"impregnert NTR AB", profil:"glatt/rillet", tresort:"furu" },
          length:3.6, width:120, thickness:28, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/terrassebord-3600" },
        tilbud:{ price:108, previousPrice:null, campaignPrice:null, stockQuantity:150, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:["Korte lengder gir flere skjøter"] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-TB-28120-48", nobbNumber:"TEST-53001014", gtin:null,
          name:"Terrassebord 28 × 120 × 4800 mm imp.", category:"terrassebord",
          properties:{ behandling:"impregnert NTR AB", profil:"glatt/rillet", tresort:"furu" },
          length:4.8, width:120, thickness:28, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/terrassebord-4800" },
        tilbud:{ price:145, previousPrice:145, campaignPrice:139, stockQuantity:120, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.97, differences:[] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-TB-28120-54", nobbNumber:"TEST-53001015", gtin:null,
          name:"Terrassebord 28 × 120 × 5400 mm imp.", category:"terrassebord",
          properties:{ behandling:"impregnert NTR AB", profil:"glatt/rillet", tresort:"furu" },
          length:5.4, width:120, thickness:28, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/terrassebord-5400" },
        tilbud:{ price:159, previousPrice:null, campaignPrice:null, stockQuantity:95, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },
    ]},

    /* --- Terrasseskruer A4 (viser pakningsstørrelse-effekten) -------------- */
    { generic:"terrasseskrue_48x75_a4", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-SKR-4875-200", nobbNumber:"TEST-54001011", gtin:null,
          name:"Terrasseskruer 4,8 × 75 mm A4 syrefast", category:"skrue",
          properties:{ materiale:"A4 syrefast", dimensjon:"4,8 × 75 mm" },
          length:null, width:null, thickness:null, salesUnit:"pk", packageQuantity:200,
          productUrl:"https://example.test/byggmax/terrasseskruer-200" },
        tilbud:{ price:279, previousPrice:null, campaignPrice:null, stockQuantity:24, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.94, differences:["Pakke à 200 stk (ikke 250)"] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-SKR-4875-250", nobbNumber:"TEST-54001012", gtin:null,
          name:"Terrasseskrue 4,8 × 75 A4, 250 stk", category:"skrue",
          properties:{ materiale:"A4 syrefast", dimensjon:"4,8 × 75 mm" },
          length:null, width:null, thickness:null, salesUnit:"pk", packageQuantity:250,
          productUrl:"https://example.test/monter/terrasseskrue-250" },
        tilbud:{ price:349, previousPrice:null, campaignPrice:null, stockQuantity:18, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.98, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-SKR-4875", nobbNumber:"TEST-54001013", gtin:null,
          name:"Terrasseskruer A4 4,8 × 75, 250 stk", category:"skrue",
          properties:{ materiale:"A4 syrefast", dimensjon:"4,8 × 75 mm" },
          length:null, width:null, thickness:null, salesUnit:"pk", packageQuantity:250,
          productUrl:"https://example.test/obsbygg/terrasseskruer" },
        tilbud:{ price:329, previousPrice:null, campaignPrice:null, stockQuantity:12, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.98, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-SKR-4875-300", nobbNumber:"TEST-54001014", gtin:null,
          name:"Terrasseskrue 4,8 × 75 A4, storpakke 300 stk", category:"skrue",
          properties:{ materiale:"A4 syrefast", dimensjon:"4,8 × 75 mm" },
          length:null, width:null, thickness:null, salesUnit:"pk", packageQuantity:300,
          productUrl:"https://example.test/xlbygg/terrasseskrue-300" },
        tilbud:{ price:419, previousPrice:null, campaignPrice:null, stockQuantity:9, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.94, differences:["Storpakke à 300 stk"] } },

      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-SKR-4875", nobbNumber:"TEST-54001015", gtin:null,
          name:"Terrasseskruer 4,8 × 75 A4, 250 stk", category:"skrue",
          properties:{ materiale:"A4 syrefast", dimensjon:"4,8 × 75 mm" },
          length:null, width:null, thickness:null, salesUnit:"pk", packageQuantity:250,
          productUrl:"https://example.test/maxbo/terrasseskruer" },
        tilbud:{ price:359, previousPrice:null, campaignPrice:null, stockQuantity:7, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.98, differences:[] } },
    ]},

    /* --- Vinkelbeslag 90° -------------------------------------------------- */
    { generic:"vinkelbeslag_90", varianter:[
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-VB-90", nobbNumber:"TEST-52002011", gtin:null,
          name:"Vinkelbeslag 90° 90 × 90 × 65 mm", category:"beslag",
          properties:{ materiale:"varmforsinket stål" },
          length:null, width:90, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/vinkelbeslag" },
        tilbud:{ price:11, previousPrice:null, campaignPrice:null, stockQuantity:200, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.95, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-VB-90", nobbNumber:"TEST-52002012", gtin:null,
          name:"Vinkelbeslag 90° varmforsinket", category:"beslag",
          properties:{ materiale:"varmforsinket stål" },
          length:null, width:90, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/vinkelbeslag" },
        tilbud:{ price:13, previousPrice:null, campaignPrice:null, stockQuantity:160, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-VB-90", nobbNumber:"TEST-52002013", gtin:null,
          name:"Vinkelbeslag 90°", category:"beslag",
          properties:{ materiale:"varmforsinket stål" },
          length:null, width:90, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/vinkelbeslag" },
        tilbud:{ price:12, previousPrice:null, campaignPrice:null, stockQuantity:140, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-VB-90", nobbNumber:"TEST-52002014", gtin:null,
          name:"Vinkelbeslag 90° varmforsinket", category:"beslag",
          properties:{ materiale:"varmforsinket stål" },
          length:null, width:90, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/vinkelbeslag" },
        tilbud:{ price:14, previousPrice:null, campaignPrice:null, stockQuantity:120, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      /* Maxbo: lagerstatus ukjent → demonstrerer "Lagerstatus ukjent" */
      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-VB-90", nobbNumber:"TEST-52002015", gtin:null,
          name:"Vinkelbeslag 90°", category:"beslag",
          properties:{ materiale:"varmforsinket stål" },
          length:null, width:90, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/vinkelbeslag" },
        tilbud:{ price:15, previousPrice:null, campaignPrice:null, stockQuantity:null, lastUpdated:T.utdatert },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },
    ]},

    /* --- Gjennomgående bolt M10 (festemiddel — sikkerhetskritisk) ---------- */
    { generic:"bolt_m10", varianter:[
      /* Byggmax: har noe, men ikke nok → "Trenger 18 – 12 på lager" */
      { store:"byggmax_drobak", produkt:{ retailerProductId:"BM-BOLT-M10", nobbNumber:"TEST-55001011", gtin:null,
          name:"Gjennomgående bolt M10 × 140 m/ mutter og skive", category:"festemiddel",
          properties:{ materiale:"varmforsinket", dimensjon:"M10" },
          length:null, width:null, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/byggmax/bolt-m10" },
        tilbud:{ price:13, previousPrice:null, campaignPrice:null, stockQuantity:12, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.94, differences:[] } },

      { store:"monter_vinterbro", produkt:{ retailerProductId:"MO-BOLT-M10", nobbNumber:"TEST-55001012", gtin:null,
          name:"Maskinbolt M10 × 140 varmforsinket m/ mutter og skive", category:"festemiddel",
          properties:{ materiale:"varmforsinket", dimensjon:"M10" },
          length:null, width:null, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/monter/bolt-m10" },
        tilbud:{ price:16, previousPrice:null, campaignPrice:null, stockQuantity:90, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"obsbygg_vinterbro", produkt:{ retailerProductId:"OB-BOLT-M10", nobbNumber:"TEST-55001013", gtin:null,
          name:"Bolt M10 m/ mutter og skive", category:"festemiddel",
          properties:{ materiale:"varmforsinket", dimensjon:"M10" },
          length:null, width:null, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/obsbygg/bolt-m10" },
        tilbud:{ price:15, previousPrice:null, campaignPrice:null, stockQuantity:60, lastUpdated:T.fersk2 },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      { store:"xlbygg_ski", produkt:{ retailerProductId:"XL-BOLT-M10", nobbNumber:"TEST-55001014", gtin:null,
          name:"Gjennomgående bolt M10 m/ mutter og skive", category:"festemiddel",
          properties:{ materiale:"varmforsinket", dimensjon:"M10" },
          length:null, width:null, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/xlbygg/bolt-m10" },
        tilbud:{ price:14, previousPrice:null, campaignPrice:null, stockQuantity:75, lastUpdated:T.fersk },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },

      /* Maxbo: pris mangler → demonstrerer "Pris mangler" */
      { store:"maxbo_holter", produkt:{ retailerProductId:"MX-BOLT-M10", nobbNumber:"TEST-55001015", gtin:null,
          name:"Bolt M10 m/ mutter og skive", category:"festemiddel",
          properties:{ materiale:"varmforsinket", dimensjon:"M10" },
          length:null, width:null, thickness:null, salesUnit:"stk", packageQuantity:1,
          productUrl:"https://example.test/maxbo/bolt-m10" },
        tilbud:{ price:null, previousPrice:null, campaignPrice:null, stockQuantity:40, lastUpdated:T.utdatert },
        match:{ matchType:"likeverdig", matchScore:0.96, differences:[] } },
    ]},
  ];

  /* ==========================================================================
     Normaliser til de tre modellene: RetailerProduct, StoreOffer, ProductMatch
     ========================================================================== */
  const storeById = Object.fromEntries(STORES.map(s => [s.id, s]));
  const PRODUCTS = [];
  const OFFERS = [];
  const MATCHES = [];

  KATALOG.forEach(post => {
    post.varianter.forEach(v => {
      const store = storeById[v.store];
      const productId = `${store.retailerId}:${v.produkt.retailerProductId}`;

      PRODUCTS.push(Object.assign({
        id: productId,
        retailerId: store.retailerId,
        imageUrl: null,
      }, v.produkt));

      OFFERS.push(Object.assign({
        storeId: v.store,
        retailerProductId: productId,
        dataSource: "mock:testdata",
        isLive: false,
      }, v.tilbud));

      MATCHES.push(Object.assign({
        genericMaterialId: post.generic,
        retailerProductId: productId,
      }, v.match));
    });
  });

  const MOCK = {
    meta: {
      dataSource: "mock:testdata",
      isLive: false,
      label: "Testdata – ikke sanntidsinformasjon",
      generatedAt: T.fersk,
    },
    retailers: RETAILERS,
    stores: STORES,
    postalCodes: POSTAL_CODES,
    products: PRODUCTS,
    offers: OFFERS,
    matches: MATCHES,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MOCK;
  root.TommestokkMockData = MOCK;

})(typeof globalThis !== "undefined" ? globalThis : this);
