"use strict";

/* ========================= Felles ========================= */
const $   = id => document.getElementById(id);
const fmt = n  => n.toLocaleString("nb-NO");
const fm1 = n  => n.toLocaleString("nb-NO",{minimumFractionDigits:1,maximumFractionDigits:1});
const kr  = n  => Math.round(n).toLocaleString("nb-NO") + " kr";
const STD_LENGDER = [3.0, 3.6, 4.2, 4.8, 5.4, 6.0];

function kapp(behov, antall){
  const res = {};
  const enkel = STD_LENGDER.find(L => L >= behov - 1e-9);
  if (enkel){ res[enkel] = antall; return {biter:res, skjoter:0}; }
  let n6 = Math.floor(behov/6.0), rest = +(behov - n6*6.0).toFixed(3);
  const per = Array(n6).fill(6.0);
  if (rest > 0.01) per.push(STD_LENGDER.find(L=>L>=rest) || 6.0);
  per.forEach(L => res[L]=(res[L]||0)+antall);
  return {biter:res, skjoter:per.length-1};
}
const kappTekst = k => Object.entries(k.biter).map(([L,n])=>`${n} × ${String(L).replace(".",",")} m`).join(" + ");

async function copy(txt, statusEl){
  try{ await navigator.clipboard.writeText(txt); statusEl.textContent="Kopiert ✓"; }
  catch{ statusEl.textContent="Kunne ikke kopiere — merk teksten manuelt."; }
  setTimeout(()=>statusEl.textContent="",2500);
}

/** Leser rå inndata fra et verktøys skjemafelt (input/select) + valgte segment-knapper,
 *  til bruk som "inndata" ved lagring i prosjekt. Ingen endring i kalkulatorene selv. */
function readForm(viewId){
  const root = $("view-"+viewId), data = {};
  root.querySelectorAll("input[id], select[id]").forEach(el=>{
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  root.querySelectorAll("[role=group] button[aria-pressed=true]").forEach(btn=>{
    const key = Object.keys(btn.dataset)[0];
    if (key) data["valg_"+key] = btn.dataset[key];
  });
  return data;
}

/* ========================================================================
   PRODUKTARKITEKTUR
   Alle kalkulatorene bygger Product[] i stedet for HTML direkte.
   Flyt:  Kalkulator → Product[] (via Catalog) → Renderer → HTML
   Dette gjør at samme liste senere kan brukes til utskrift, PDF, CSV,
   prisoppslag, butikklenker og API — uten å endre kalkulatorene.
   ======================================================================== */

/* ---------- Del 1: Standardisert produktmodell ---------- */
const Product = {
  create(spec){
    return {
      id: spec.id,
      category: spec.category || "",
      title: spec.title || spec.id,
      dimensions: spec.dimensions || null,
      quality: spec.quality || null,
      treatment: spec.treatment || null,
      quantity: spec.quantity ?? 0,
      unit: spec.unit || "stk",
      note: spec.note || "",                 // forklaring til kunden (kappliste, montering)
      estPrice: spec.estPrice ?? null,        // veiledende pris per enhet, redigerbar
      sourceTool: spec.sourceTool || null,    // hvilket verktøy produktet kom fra
      /* Råbehov før svinn, når kalkulatoren kjenner det. quantity over inneholder
         ALLEREDE svinn — need brukes kun til å vise regnestykket og til å regne
         mot butikkenes faktiske pakningsstørrelser. {quantity, unit, wastePercentage} */
      need: spec.need || null,
      lookup: {
        nobb: spec.lookup?.nobb || "",
        ean: spec.lookup?.ean || "",
        manufacturer: spec.lookup?.manufacturer || "",
        manufacturerPartNumber: spec.lookup?.manufacturerPartNumber || "",
      },
    };
  }
};

/* ---------- Del 2: Produktdatabase ----------
   Ett oppslag per vare. Flere verktøy kan referere samme id
   (f.eks. "stolpe_98x98_imp" brukes både i Terrasse og Rekkverk,
   og "bolt_m10" er felles festemiddel-katalogpost). */
const Catalog = (()=>{
  const DB = {
    /* --- Terrasse: bjelker --- */
    tbjelke_48x148_c24:   {category:"terrassebjelke", title:"Terrassebjelke 48 × 148 C24 imp.", dimensions:"48x148", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:45},
    tbjelke_48x173_c24:   {category:"terrassebjelke", title:"Terrassebjelke 48 × 173 C24 imp.", dimensions:"48x173", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:55},
    tbjelke_48x198_c24:   {category:"terrassebjelke", title:"Terrassebjelke 48 × 198 C24 imp.", dimensions:"48x198", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:65},
    tbjelke_48x223_c24:   {category:"terrassebjelke", title:"Terrassebjelke 48 × 223 C24 imp.", dimensions:"48x223", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:78},
    baerebjelke_48x198_c24:{category:"baerebjelke", title:"Bærebjelke 48 × 198 C24 imp.", dimensions:"48x198", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:65},
    baerebjelke_48x223_c24:{category:"baerebjelke", title:"Bærebjelke 48 × 223 C24 imp.", dimensions:"48x223", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:78},
    /* --- Terrasse / Rekkverk: stolper (delt katalogpost) --- */
    stolpe_48x98_imp:     {category:"stolpe", title:"Stolpe 48 × 98 imp.", dimensions:"48x98", treatment:"impregnert", unit:"lm", defaultPrice:42},
    stolpe_98x98_imp:     {category:"stolpe", title:"Stolpe 98 × 98 imp.", dimensions:"98x98", treatment:"impregnert", unit:"lm", defaultPrice:75},
    stolpesko_98:         {category:"beslag", title:"Justerbar stolpesko/søylefot", unit:"stk", defaultPrice:189},
    /* --- Terrasse: bord og skruer --- */
    terrassebord_28x120_imp:{category:"terrassebord", title:"Terrassebord 28 × 120 imp.", dimensions:"28x120", treatment:"impregnert", unit:"lm", defaultPrice:30},
    terrassebord_21x95_imp: {category:"terrassebord", title:"Terrassebord 21 × 95 imp.",  dimensions:"21x95",  treatment:"impregnert", unit:"lm", defaultPrice:20},
    terrasseskrue_48x75_a4:{category:"skrue", title:"Terrasseskruer 4,8 × 75 A4 (pk à 250)", unit:"pk", defaultPrice:349},
    terrasseskrue_42x55_a4:{category:"skrue", title:"Terrasseskruer 4,2 × 55 A4 (pk à 250)", unit:"pk", defaultPrice:349},
    bjelkesko_48:         {category:"beslag", title:"Bjelkesko 48 mm m/ beslagskruer", unit:"stk", defaultPrice:25},
    vinkelbeslag_90:      {category:"beslag", title:"Vinkelbeslag 90° m/ beslagskruer", unit:"stk", defaultPrice:12},
    bolt_m10:             {category:"festemiddel", title:"Gjennomgående bolt M10 m/ mutter og skive", unit:"stk", defaultPrice:15},
    /* --- Rekkverk --- */
    rekkverk_svill_48x73: {category:"svill", title:"Svill 48 × 73 imp. (topp og bunn)", dimensions:"48x73", treatment:"impregnert", unit:"lm", defaultPrice:25},
    spile_21x45_imp:      {category:"spile", title:"Spile 21 × 45 imp.", dimensions:"21x45", treatment:"impregnert", unit:"lm", defaultPrice:14},
    spile_21x70_imp:      {category:"spile", title:"Spile 21 × 70 imp.", dimensions:"21x70", treatment:"impregnert", unit:"lm", defaultPrice:19},
    spile_21x95_imp:      {category:"spile", title:"Spile 21 × 95 imp.", dimensions:"21x95", treatment:"impregnert", unit:"lm", defaultPrice:24},
    rekkverk_toppbord_28x120_imp:{category:"handloper", title:"Toppbord 28 × 120 imp. (håndløper)", dimensions:"28x120", treatment:"impregnert", unit:"lm", defaultPrice:30},
    treskrue_42x55_a4:    {category:"skrue", title:"Treskruer 4,2 × 55 A4 (pk à 250)", unit:"pk", defaultPrice:329},
    konstruksjonsskrue_6x90:{category:"skrue", title:"Konstruksjonsskruer 6 × 90 (pk à 100)", unit:"pk", defaultPrice:279},
    /* --- DryppStop (Plastmo, med reelle NOBB/artikkelnummer) --- */
    dryppstop_plate:  {category:"plate",  title:"DryppStop plate 60 × 160 cm",         dimensions:"60x160", unit:"stk", defaultPrice:239, lookup:{manufacturerPartNumber:"4158316", nobb:"40996704"}},
    dryppstop_prof300:{category:"profil", title:"DryppStop alu-profil 300 cm",         dimensions:"300",    unit:"stk", defaultPrice:229, lookup:{manufacturerPartNumber:"4100916", nobb:"43109621"}},
    dryppstop_prof150:{category:"profil", title:"DryppStop alu-profil 150 cm",         dimensions:"150",    unit:"stk", defaultPrice:129, lookup:{manufacturerPartNumber:"4100915", nobb:"40996928"}},
    dryppstop_skjot:  {category:"profil", title:"DryppStop skjøteprofil 15 cm",        dimensions:"15",     unit:"stk", defaultPrice:49,  lookup:{manufacturerPartNumber:"4100920", nobb:"51566086"}},
    dryppstop_beslag: {category:"beslag", title:"DryppStop beslag 300 cm",             dimensions:"300",    unit:"stk", defaultPrice:199, lookup:{manufacturerPartNumber:"4100930", nobb:"60025517"}},
    dryppstop_skruer: {category:"skrue",  title:"DryppStop skruer 4×30 (pose à 100)",  unit:"pose", defaultPrice:379, lookup:{manufacturerPartNumber:"4110981", nobb:"43290955"}},
    dryppstop_fuge:   {category:"fuge",   title:"DryppStop fugemasse / Danalim 685",   unit:"tube", defaultPrice:139, lookup:{manufacturerPartNumber:"4100935", nobb:"57389738"}},
    dryppstop_bakkant:{category:"beslag", title:"Bakkantbeslag mot vegg (per 2 m)",    unit:"stk",  defaultPrice:149},
    /* --- Parkett & laminat --- */
    parkett_klikk_14:     {category:"gulv", title:"Parkett klikk 14 mm — fritt produktvalg", dimensions:"14", unit:"pk", defaultPrice:750},
    laminat_klikk_8:      {category:"gulv", title:"Laminat klikk 8 mm — fritt produktvalg", dimensions:"8", unit:"pk", defaultPrice:400},
    fiskebein_klikk:      {category:"gulv", title:"Fiskebeinsgulv klikk (A/B-bord) — fritt produktvalg", unit:"pk", defaultPrice:1100},
    gulvunderlag_foam:    {category:"underlag", title:"Gulvunderlag skum/kombi (rull à 15 m²)", unit:"rull", defaultPrice:349},
    fuktsperre_02mm:      {category:"underlag", title:"Fuktsperre PE-folie 0,2 mm (rull à 39 m²)", unit:"rull", defaultPrice:299},
    gulvlist_12x58:       {category:"list", title:"Gulvlist furu 12 × 58 hvitmalt", dimensions:"12x58", unit:"lm", defaultPrice:35},
    overgangslist_terskel:{category:"list", title:"Overgangslist/terskel justerbar", unit:"stk", defaultPrice:249},
    t_profil_ekspansjon:  {category:"list", title:"T-profil for ekspansjonsfuge", unit:"stk", defaultPrice:329},
    avstandskiler:        {category:"tilbehor", title:"Avstandskiler/monteringskiler (pk à 30)", unit:"pk", defaultPrice:79},
    /* --- Kledning --- */
    kledning_rekt_19x148:  {category:"kledning", title:"Kledningsbord rektangulær 19 × 148 — fritt valg av behandling", dimensions:"19x148", unit:"lm", defaultPrice:30},
    kledning_dfals_19x148: {category:"kledning", title:"Kledningsbord dobbeltfals 19 × 148 — fritt valg av behandling", dimensions:"19x148", unit:"lm", defaultPrice:34},
    sloyfe_23x48:          {category:"lekt", title:"Sløyfe 23 × 48 (lufting bak kledning)", dimensions:"23x48", unit:"lm", defaultPrice:12},
    lekt_30x48:            {category:"lekt", title:"Lekt 30 × 48 (spikerslag for kledning)", dimensions:"30x48", unit:"lm", defaultPrice:16},
    kledningsspiker_28x75: {category:"skrue", title:"Kledningsspiker 2,8 × 75 varmforsinket (pk à 1 kg ≈ 110 stk)", unit:"pk", defaultPrice:189},
    museband_alu:          {category:"beslag", title:"Musebånd perforert aluminium", unit:"lm", defaultPrice:35},
    /* --- Levegg --- */
    levegg_bord_19:        {category:"kledning", title:"Leveggsbord 19 mm — fritt produktvalg", unit:"lm", defaultPrice:26},
    losholt_48x98:         {category:"svill", title:"Losholt/spikerslag 48 × 98 imp.", dimensions:"48x98", unit:"lm", defaultPrice:42},
    jordspyd_98:           {category:"beslag", title:"Jordspyd/stolpespyd 98 × 98", unit:"stk", defaultPrice:249},
    /* --- Pergola (generisk konstruksjonsvirke, delbart med fremtidige verktøy) --- */
    kvirke_48x98_c24:      {category:"konstruksjonsvirke", title:"Konstruksjonsvirke 48 × 98 C24 imp.",  dimensions:"48x98",  quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:38},
    kvirke_48x148_c24:     {category:"konstruksjonsvirke", title:"Konstruksjonsvirke 48 × 148 C24 imp.", dimensions:"48x148", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:55},
    kvirke_48x198_c24:     {category:"konstruksjonsvirke", title:"Konstruksjonsvirke 48 × 198 C24 imp.", dimensions:"48x198", quality:"C24", treatment:"impregnert", unit:"lm", defaultPrice:65},
    /* --- Maling utvendig (enhet: liter — spann-fordeling står i noten) --- */
    utemaling_dekkende:    {category:"maling", title:"Utendørs maling, dekkende — fritt produktvalg", unit:"liter", defaultPrice:189},
    oljedekkbeis:          {category:"maling", title:"Oljedekkbeis — fritt produktvalg", unit:"liter", defaultPrice:165},
    beis_transparent:      {category:"maling", title:"Beis/transparent treolje — fritt produktvalg", unit:"liter", defaultPrice:155},
    grunningsolje:         {category:"maling", title:"Grunningsolje/heftgrunn", unit:"liter", defaultPrice:120},
    husvask_konsentrat:    {category:"maling", title:"Husvask/kraftvask konsentrat (flaske à 1 L)", unit:"stk", defaultPrice:149},
    malerutstyr_sett:      {category:"tilbehor", title:"Malerutstyr — ruller, pensler, skaft, presenning", unit:"sett", defaultPrice:399},
    /* --- Belegningsstein & grus (masser i tonn — bigbag ≈ 1000 kg) --- */
    belegningsstein_6cm:   {category:"stein", title:"Belegningsstein 6 cm (kjørbar) — fritt valg av stein og farge", unit:"m²", defaultPrice:349},
    belegningsstein_5cm:   {category:"stein", title:"Belegningsstein/heller 5 cm (gangareal) — fritt valg", unit:"m²", defaultPrice:299},
    pukk_0_32:             {category:"masse", title:"Pukk 0–32 mm til bærelag", unit:"tonn", defaultPrice:350},
    settesand_0_8:         {category:"masse", title:"Settesand 0–8 mm", unit:"tonn", defaultPrice:450},
    fugesand_25kg:         {category:"masse", title:"Fugesand 0–2 mm (sekk à 25 kg)", unit:"sekk", defaultPrice:89},
    fiberduk_25m2:         {category:"duk", title:"Fiberduk klasse 3 (rull à 25 m²)", unit:"rull", defaultPrice:399},
    kantstein_betong:      {category:"stein", title:"Kantstein/kantsikring betong", unit:"lm", defaultPrice:149},
    /* --- Plen --- */
    ferdigplen_rull:       {category:"hage", title:"Ferdigplen (rull à 1 m², 40 × 250 cm)", unit:"m²", defaultPrice:69},
    gressfro_blanding:     {category:"hage", title:"Gressfrø plenblanding — fritt produktvalg", unit:"kg", defaultPrice:199},
    vekstjord:             {category:"masse", title:"Vekstjord/anleggsjord (bigbag ≈ 1 m³)", unit:"m³", defaultPrice:650},
    plengjodsel:           {category:"hage", title:"Plengjødsel/startgjødsel", unit:"kg", defaultPrice:35},
    hagekalk:              {category:"hage", title:"Hagekalk", unit:"kg", defaultPrice:12},
    /* --- Gjerde --- */
    gjerde_bord_19:        {category:"kledning", title:"Gjerdebord/spile 19 mm — fritt produktvalg", unit:"lm", defaultPrice:22},
    portbeslag_gang:       {category:"beslag", title:"Portbeslag gangport — hengsler, vrider og lås", unit:"sett", defaultPrice:549},
    portbeslag_kjore:      {category:"beslag", title:"Portbeslag kjøreport — kraftige hengsler, slå og bakkeboltlås", unit:"sett", defaultPrice:1290},
    /* --- Maling innvendig (enhet: liter/kg) --- */
    innemaling_vegg:       {category:"maling", title:"Interiørmaling vegg — fritt produktvalg", unit:"liter", defaultPrice:159},
    takmaling:             {category:"maling", title:"Takmaling helmatt — fritt produktvalg", unit:"liter", defaultPrice:149},
    grunning_inne:         {category:"maling", title:"Grunning/primer for gips og ubehandlet", unit:"liter", defaultPrice:129},
    sparkel_inne:          {category:"maling", title:"Sparkel/fyllmasse (spann à 2,5 kg)", unit:"spann", defaultPrice:169},
    maskeringstape:        {category:"tilbehor", title:"Maskeringstape og tildekkingsplast", unit:"sett", defaultPrice:129},
    /* --- Flis til bad --- */
    fliser_bad:            {category:"flis", title:"Fliser — fritt valg av type, farge og format", unit:"m²", defaultPrice:399},
    flislim_20kg:          {category:"flis", title:"Flislim (sekk à 20 kg)", unit:"sekk", defaultPrice:229},
    fugemasse_5kg:         {category:"flis", title:"Fugemasse (pose à 5 kg)", unit:"pose", defaultPrice:189},
    smoremembran:          {category:"membran", title:"Smøremembran (spann, dekker ca. 5 m² i 2 strøk)", unit:"spann", defaultPrice:749},
    membranremse:          {category:"membran", title:"Membran forsterkningsremse (hjørner og skjøter)", unit:"lm", defaultPrice:39},
    membranprimer:         {category:"membran", title:"Membranprimer/grunning", unit:"liter", defaultPrice:199},
    vatromssilikon:        {category:"flis", title:"Våtromssilikon/sanitærsilikon (patron)", unit:"tube", defaultPrice:129},
    flisekryss:            {category:"tilbehor", title:"Flisekryss og kiler (pk)", unit:"pk", defaultPrice:99},
    tannsparkel_flis:      {category:"tilbehor", title:"Tannsparkel/limkam", unit:"stk", defaultPrice:159},
  };

  function get(id){ return DB[id]; }
  function all(){ return Object.entries(DB).map(([id,v])=>({id, ...v})); }
  /** Bygg et Product fra en katalogpost + mengde fra en kalkulator. */
  function make(id, quantity, extra={}){
    const base = DB[id];
    if (!base) console.warn("Tommestokk1: ukjent produkt-id i katalogen →", id);
    return Product.create({
      id, quantity,
      category: base?.category, title: base?.title || id,
      dimensions: base?.dimensions, quality: base?.quality, treatment: base?.treatment,
      unit: base?.unit || "stk",
      estPrice: extra.estPrice ?? base?.defaultPrice ?? 0,
      note: extra.note || "",
      sourceTool: extra.sourceTool || null,
      need: extra.need || null,
      lookup: base?.lookup || {},
    });
  }
  return {get, all, make, DB};
})();

/* ---------- Del 4: Butikkmotor ----------
   Kun registrering av butikker foreløpig — ingen integrasjon. */
const Stores = (()=>{
  const list = [
    {id:"monter",     name:"Montér"},
    {id:"obsbygg",    name:"Obs BYGG"},
    {id:"byggmakker", name:"Byggmakker"},
    {id:"maxbo",      name:"Maxbo"},
    {id:"byggmax",    name:"Byggmax"},
    {id:"bauhaus",    name:"Bauhaus"},
  ];
  function all(){ return list; }
  function get(id){ return list.find(s=>s.id===id); }
  /** Fremtidige butikker registreres her — kalkulatorene trenger ikke endres. */
  function register(store){ list.push(store); }
  return {all, get, register};
})();

/* ---------- Del 5: Prisoppslag ----------
   STUB: returnerer kun mockdata (Product.estPrice). Byttes senere ut med
   ekte API-kall/scraping per butikk — signaturen skal ikke endres. */
const PriceLookup = (()=>{
  function lookupPrices(products, storeId){
    return products.map(p=>({
      id: p.id, price: p.estPrice ?? null, url: "", available: true, store: storeId,
    }));
  }
  /** "Billigste kombinasjon": stub som senere skal spørre alle butikker
   *  og velge billigst pris per vare. Returnerer i dag samme mockdata. */
  function lookupCheapestCombo(products){
    return products.map(p=>({
      id: p.id, price: p.estPrice ?? null, url: "", available: true, store: null,
    }));
  }
  return {lookupPrices, lookupCheapestCombo};
})();

/* ---------- Del 3: Renderer ----------
   Kalkulatorene kaller ALDRI innerHTML direkte på materiallisten lenger.
   De bygger Product[], og Renderer gjør om til HTML/tekst/CSV. */
const Renderer = (()=>{
  function priceOf(p, overrides){ return overrides?.[p.id] ?? p.estPrice ?? 0; }
  function total(products, overrides={}){
    return products.reduce((sum,p)=>sum + priceOf(p,overrides)*p.quantity, 0);
  }
  function renderRows(products, overrides={}){
    return products.map(p=>{
      const price = priceOf(p,overrides), sum = price*p.quantity;
      const nobb = p.lookup?.nobb ? `<span class="art">NOBB ${p.lookup.nobb}</span>` : "";
      return `<tr><td>${p.title}${p.note?`<span class="art">${p.note}</span>`:""}${nobb}</td>
        <td class="num"><span class="qty-badge">${fmt(p.quantity)}</span> <span class="art" style="display:inline">${p.unit}</span></td>
        <td class="num"><input class="price" type="number" min="0" step="1" value="${price}" data-key="${p.id}" aria-label="Pris ${p.title}"></td>
        <td class="num">${kr(sum)}</td></tr>`;
    }).join("");
  }
  function renderSumRow(products, overrides={}){
    return `<tr class="sum"><td colspan="3">Estimert totalpris (veiledende)</td><td class="num">${kr(total(products,overrides))}</td></tr>`;
  }
  function toPlainText(products, headerLines=[], overrides={}){
    return [...headerLines, "",
      ...products.map(p=>`• ${p.quantity} ${p.unit} — ${p.title}${p.note?` (${p.note})`:""}`),
      "", `Estimert totalpris: ${kr(total(products,overrides))} (veiledende)`].join("\n");
  }
  function toCSV(products, overrides={}){
    const head = ["Vare","Dimensjon","Antall","Enhet","Pris","Sum","NOBB"];
    const lines = [head.join(";")];
    products.forEach(p=>{
      const price = priceOf(p,overrides);
      lines.push([p.title, p.dimensions||"", p.quantity, p.unit, price, price*p.quantity, p.lookup?.nobb||""].join(";"));
    });
    return lines.join("\n");
  }
  return {total, renderRows, renderSumRow, toPlainText, toCSV};
})();

/* ---------- Del 6: "Finn priser"-modal (UI, ingen prisoppslag ennå) ---------- */
const PriceModal = (()=>{
  let current = {products:[], label:""};
  function open(products, label){
    current = {products, label};
    $("priceModalTitle").textContent = `Finn priser — ${label}`;
    $("priceModalSub").textContent = `${products.length} varelinjer i handlelisten. Velg butikk for å sammenligne.`;
    $("priceModalResult").classList.remove("show");
    $("priceModalStores").innerHTML = Stores.all().map(s=>
      `<button class="store-pick" type="button" data-store="${s.id}">${s.name}</button>`
    ).join("") + `<button class="store-pick combo" type="button" data-store="__combo">🏆 Billigste kombinasjon</button>`;
    $("priceModalStores").querySelectorAll("[data-store]").forEach(b=>
      b.addEventListener("click",()=>showResult(b.dataset.store))
    );
    $("priceModal").classList.add("open");
  }
  function showResult(storeId){
    const isCombo = storeId === "__combo";
    const results = isCombo
      ? PriceLookup.lookupCheapestCombo(current.products)
      : PriceLookup.lookupPrices(current.products, storeId);
    const byId = Object.fromEntries(results.map(r=>[r.id, r]));
    let total = 0;
    $("priceModalRows").innerHTML = current.products.map(p=>{
      const r = byId[p.id] || {price:p.estPrice};
      const sum = (r.price||0)*p.quantity; total += sum;
      return `<tr><td>${p.title}</td><td class="num">${fmt(p.quantity)} ${p.unit}</td>
        <td class="num">${r.price!=null?kr(r.price):"—"}</td><td class="num">${kr(sum)}</td></tr>`;
    }).join("") + `<tr class="sum"><td colspan="3">Sum${isCombo?" (billigste kombinasjon)":""}</td><td class="num">${kr(total)}</td></tr>`;
    $("priceModalResult").classList.add("show");
  }
  function close(){ $("priceModal").classList.remove("open"); }
  function init(){
    $("priceModalClose").addEventListener("click", close);
    $("priceModal").addEventListener("click", e=>{ if(e.target.id==="priceModal") close(); });
    document.addEventListener("keydown", e=>{ if(e.key==="Escape") close(); });
  }
  return {open, close, init};
})();
PriceModal.init();

/* ========================================================================
   SHOPCOMPARE — «Hvor vil du handle?»
   UI-laget for butikksammenligning. Kjenner ikke testdataene: alle data og
   all beregning kommer fra retail.js via provideren, slik at datakilden kan
   byttes uten at denne modulen endres.

   Monteres per verktøy:  ShopCompare.mount("te", ()=>TE.products)
   ======================================================================== */
const ShopCompare = (()=>{
  const TR = window.TommestokkRetail;
  const harMotor = !!(TR && window.TommestokkMockData);
  const motor = harMotor ? TR.createEngine(TR.createMockProvider(window.TommestokkMockData)) : null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const instanser = {};

  /* ---------- Lagerstatus: alltid tekst, farge kun som støtte ---------- */
  function lagerBadge(linje){
    const kart = {
      [TR.LAGER.PA_LAGER]:      "ok",
      [TR.LAGER.BEGRENSET]:     "warn",
      [TR.LAGER.IKKE_NOK]:      "stop",
      [TR.LAGER.IKKE_PA_LAGER]: "stop",
      [TR.LAGER.UKJENT]:        "info",
    };
    return `<span class="badge ${kart[linje.stockStatus]}">${esc(linje.stockText)}</span>`;
  }

  /* ---------- Ett varehus-kort ---------- */
  function storeCard(q, ctx){
    const { billigst, referanse } = ctx;
    const diff = q.total - billigst.total;
    const erBilligst = diff === 0;

    const diffTekst = erBilligst
      ? (referanse
          ? `<span class="badge best">Billigst</span> ${esc(TR.fmt.kr(referanse.total - q.total))} billigere enn ${esc(referanse.store.name)}`
          : `<span class="badge best">Billigst</span>`)
      : `${esc(TR.fmt.kr(diff))} dyrere enn ${esc(billigst.store.name)}`;

    const dekning = `${q.linesInStock} av ${q.lineCount} varelinjer på lager (${q.coveragePct} %)`;
    const status = q.linesMissing > 0
      ? `<span class="badge stop">${q.linesMissing} vare${q.linesMissing===1?"":"r"} mangler</span>`
      : (q.linesUnknownStock > 0
          ? `<span class="badge info">${q.linesUnknownStock} med ukjent lager</span>`
          : `<span class="badge ok">Hele listen på lager</span>`);

    const godkjenning = q.linesNeedingApproval > 0
      ? `<li><span class="k">Merk</span><span class="badge warn">${q.linesNeedingApproval} vare${q.linesNeedingApproval===1?"":"r"} krever godkjenning</span></li>` : "";
    const prisMangler = q.linesWithoutPrice > 0
      ? `<li><span class="k">Pris</span><span class="badge warn">Ufullstendig — ${q.linesWithoutPrice} vare mangler pris</span></li>` : "";
    const frakt = q.shippingFee != null
      ? `<li><span class="k">Frakt</span><span>fra ${esc(TR.fmt.kr(q.shippingFee))} ved levering</span></li>` : "";
    const utdatert = q.linesStale > 0
      ? `<li><span class="k">Datakvalitet</span><span class="badge warn">${q.linesStale} varelinje(r) med utdaterte data</span></li>` : "";

    return `<article class="store-card${erBilligst && q.isComplete ? " is-best":""}${q.isComplete?"":" is-blocked"}">
      <div class="store-top">
        <div>
          <span class="chain">${esc(q.retailer ? q.retailer.name : "")}</span>
          <h3>${esc(q.store.name)}</h3>
        </div>
        <div class="store-price">${esc(TR.fmt.kr(q.total))}
          <small>${q.priceIsPartial ? "ufullstendig sum" : "hele handlelisten"}</small></div>
      </div>
      <ul class="store-facts">
        <li><span class="k">Lagerdekning</span><span>${esc(dekning)}</span></li>
        <li><span class="k">Status</span>${status}</li>
        <li><span class="k">Avstand</span><span>${esc(TR.fmt.km(q.distanceKm))}</span></li>
        <li><span class="k">Pris</span><span>${diffTekst}</span></li>
        ${frakt}${godkjenning}${prisMangler}${utdatert}
      </ul>
      <p class="datakilde">Testdata — ikke sanntidsinformasjon · sist oppdatert ${esc(TR.fmt.klokke(q.lastUpdated))}</p>
      <div class="actions">
        <button class="btn secondary" type="button" data-open-store="${esc(q.store.id)}"
          aria-label="Se handleliste for ${esc(q.store.name)}">Se handleliste</button>
      </div>
    </article>`;
  }

  /* ---------- Én varelinje ---------- */
  function lineRow(l){
    if (!l.matched){
      return `<details class="shop-line">
        <summary><span><span class="line-name">${esc(l.name)}</span>
          <span class="line-meta">${esc(l.category)}${l.dimensions?` · ${esc(l.dimensions)}`:""}</span></span>
          <span class="line-sum"><span class="badge stop">Ikke matchet</span></span></summary>
        <div class="line-facts">
          <div><span class="k">Beregnet behov</span><span class="v">${esc(TR.fmt.num(l.totalNeed))} ${esc(l.totalNeedUnit)}</span></div>
          <div><span class="k">Status</span><span class="v">${esc(l.issueText)}</span></div>
        </div></details>`;
    }
    const p = l.produkt;
    const enhetsnavn = l.packageQuantity > 1 ? `pakke à ${l.packageQuantity}` : l.salesUnit;
    const godkjenning = l.requiresApproval
      ? `<div class="approve-box"><b>Krever godkjenning.</b> Alternativt produkt i en konstruksjons- eller
          sikkerhetskritisk kategori: ${esc(l.differences.join(". "))}. Kontroller at det er egnet før kjøp —
          systemet bytter ikke slike varer automatisk.</div>` : "";
    const avvik = !l.requiresApproval && l.differences.length
      ? `<div><span class="k">Avvik</span><span class="v">${esc(l.differences.join(". "))}</span></div>` : "";

    return `<details class="shop-line">
      <summary>
        <span><span class="line-name">${esc(p.name)}</span>
          <span class="line-meta">${esc(l.category)}${l.dimensions?` · ${esc(l.dimensions)}`:""} ·
            ${l.units} ${esc(enhetsnavn)} · ${esc(l.stockText)}</span></span>
        <span class="line-sum">${esc(TR.fmt.kr(l.lineSum))}</span>
      </summary>
      <div class="line-facts">
        <div><span class="k">Beregnet behov</span><span class="v">${esc(TR.fmt.num(l.baseQuantity))} ${esc(l.baseUnit)}</span></div>
        <div><span class="k">Svinn</span><span class="v">${l.wastePercentage} %</span></div>
        <div><span class="k">Totalt behov</span><span class="v">${esc(TR.fmt.num(l.totalNeed))} ${esc(l.totalNeedUnit)}</span></div>
        <div><span class="k">Antall å kjøpe</span><span class="v"><b>${l.units} ${esc(enhetsnavn)}</b></span></div>
        <div><span class="k">Regnestykke</span><span class="v">${esc(l.unitsForklaring)}</span></div>
        ${l.productLength?`<div><span class="k">Produktlengde</span><span class="v">${esc(TR.fmt.num(l.productLength))} m</span></div>`:""}
        <div><span class="k">Pris per ${esc(l.salesUnit)}</span><span class="v">${esc(TR.fmt.kr(l.unitPrice))}${l.campaign?` <span class="badge warn">Kampanje</span>`:""}</span></div>
        <div><span class="k">Linjesum</span><span class="v"><b>${esc(TR.fmt.kr(l.lineSum))}</b></span></div>
        <div><span class="k">Lagerantall</span><span class="v">${l.stockQuantity==null?"ukjent":l.stockQuantity+" stk"}</span></div>
        <div><span class="k">Lagerstatus</span><span class="v">${lagerBadge(l)}</span></div>
        ${l.shortfallText?`<div><span class="k">Mangler</span><span class="v">${esc(l.shortfallText)}</span></div>`:""}
        ${l.issueText?`<div><span class="k">Merknad</span><span class="v">${esc(l.issueText)}</span></div>`:""}
        <div><span class="k">Produktmatch</span><span class="v">${esc(l.matchType)}</span></div>
        ${avvik}
        <div><span class="k">Varenummer</span><span class="v">${esc(p.retailerProductId)}${p.nobbNumber?` · NOBB ${esc(p.nobbNumber)}`:""}</span></div>
        <div><span class="k">Sist kontrollert</span><span class="v">${esc(TR.fmt.datoTid(l.lastUpdated))}${l.stale?` <span class="badge warn">Utdatert</span>`:""}</span></div>
        ${godkjenning}
        ${p.productUrl?`<a class="line-link" href="${esc(p.productUrl)}" target="_blank" rel="noopener">Åpne produktside ↗</a>`:""}
      </div>
    </details>`;
  }

  /* ---------- Full handleliste for ett varehus ---------- */
  function storeDetail(q){
    const rekkefolge = { [TR.LAGER.IKKE_PA_LAGER]:0, [TR.LAGER.IKKE_NOK]:1, [TR.LAGER.UKJENT]:2,
                         [TR.LAGER.BEGRENSET]:3, [TR.LAGER.PA_LAGER]:4 };
    const linjer = q.lines.slice().sort((a,b)=>
      (a.matched?1:0)-(b.matched?1:0) ||
      (rekkefolge[a.stockStatus]??9)-(rekkefolge[b.stockStatus]??9));

    const advarsel = !q.isComplete
      ? `<div class="alert warn"><b>Ikke alt kan kjøpes her.</b>
          ${q.linesInStock} av ${q.lineCount} varelinjer er på lager${q.linesWithoutPrice?`, og ${q.linesWithoutPrice} vare mangler pris`:""}${q.linesUnknownStock?`. ${q.linesUnknownStock} varelinje har ukjent lagerstatus`:""}.
          De aktuelle varelinjene ligger øverst i listen.</div>`
      : `<div class="alert ok"><b>Hele handlelisten er på lager her</b> etter testdataene.${q.linesNeedingApproval?` Merk at ${q.linesNeedingApproval} varelinje krever din godkjenning.`:""}</div>`;

    return `<div class="shop-detail">
      <div class="actions" style="margin:0 0 1rem">
        <button class="btn secondary" type="button" data-shopback="1">← Tilbake til varehusene</button>
      </div>
      <div class="store-top">
        <div><span class="chain">${esc(q.retailer?q.retailer.name:"")}</span>
          <h3>${esc(q.store.name)}</h3>
          <span class="hint">${esc(q.store.address)}, ${esc(q.store.postalCode)} ${esc(q.store.city)} · ${esc(TR.fmt.km(q.distanceKm))}</span></div>
        <div class="store-price">${esc(TR.fmt.kr(q.total))}
          <small>${q.priceIsPartial?"ufullstendig sum":"hele handlelisten"}</small></div>
      </div>
      ${advarsel}
      <div class="stats" style="margin-top:1rem">
        <div class="stat"><b>${q.lineCount}</b><small>varelinjer</small></div>
        <div class="stat"><b>${q.coveragePct} %</b><small>lagerdekning</small></div>
        <div class="stat"><b>${q.linesMissing}</b><small>mangler</small></div>
        ${q.shippingFee!=null?`<div class="stat"><b>${esc(TR.fmt.kr(q.shippingFee))}</b><small>frakt fra</small></div>`:""}
      </div>
      <div class="shop-lines">${linjer.map(lineRow).join("")}</div>
      <p class="datakilde">Testdata — ikke sanntidsinformasjon. Alle priser og lagertall i denne listen
        er oppdiktet. Sist «oppdatert» ${esc(TR.fmt.datoTid(q.lastUpdated))}.</p>
    </div>`;
  }

  /* ---------- Velg varehus ---------- */
  function pickerView(res){
    return `<div>
      <p class="shop-summary">Velg kjede eller varehus for å se hele materiallisten med pris og
        lagerstatus der. Sammenligningen gjelder én butikk av gangen.</p>
      <div class="store-picker">
        ${res.quotes.map(q=>`<button class="store-pick" type="button" data-open-store="${esc(q.store.id)}">
          <b>${esc(q.store.name)}</b><br>
          <span class="hint">${esc(q.retailer?q.retailer.name:"")} · ${esc(q.store.postalCode)} ${esc(q.store.city)}<br>
          ${esc(TR.fmt.km(q.distanceKm))} · ${esc(TR.fmt.kr(q.total))}${q.isComplete?"":" · mangler varer"}</span>
        </button>`).join("")}
      </div>
      <p class="datakilde">${res.quotes.length} varehus i testdataene. En ekte integrasjon vil hente
        varehus ut fra postnummeret ditt.</p>
    </div>`;
  }

  /* ---------- Hovedvisning ---------- */
  function render(prefix){
    const inst = instanser[prefix];
    const vert = $(`${prefix}-shopResult`);
    if (!vert) return;
    if (!harMotor){
      vert.innerHTML = `<div class="alert warn">Butikksammenligningen kunne ikke lastes
        (retail.js mangler). Materiallisten over fungerer som før.</div>`;
      return;
    }

    const krav = motor.requirementsFrom(inst.getProducts() || []);
    if (!krav.length){
      vert.innerHTML = `<div class="alert">Fyll inn mål over for å få en materialliste å sammenligne.</div>`;
      return;
    }

    const postnr = $(`${prefix}-shopPostnr`).value.trim();
    const stedFelt = $(`${prefix}-shopSted`);
    const origo = motor.resolveOrigin(postnr);
    if (!origo.ok){
      if (stedFelt) stedFelt.textContent = "";
      vert.innerHTML = `<div class="alert warn"><b>Ugyldig postnummer.</b> ${esc(origo.errorText)}.
        Testdataene dekker blant annet 1440 Drøbak, 1407 Vinterbro, 1400 Ski, 1430 Ås og 2034 Holter.</div>`;
      return;
    }
    if (stedFelt) stedFelt.textContent = `${origo.origin.sted} — avstander regnes herfra`;

    const res = motor.quoteAll(krav, {origin: origo.origin});
    if (!res.ok){
      vert.innerHTML = `<div class="alert warn">${esc(res.errorText)}.</div>`;
      return;
    }

    if (inst.apenButikk){
      const q = res.quotes.find(x=>x.store.id===inst.apenButikk);
      if (q){ vert.innerHTML = storeDetail(q); return; }
      inst.apenButikk = null;
    }

    if (inst.modus === "velg"){ vert.innerHTML = pickerView(res); return; }

    const etterPris = TR.Ranking.cheapest(res.quotes);
    const billigst = etterPris[0];
    const ctx = {billigst, referanse: etterPris[1] || null};
    const sortert = inst.modus === "naermest" ? TR.Ranking.nearest(res.quotes) : etterPris;

    let topp;
    if (!res.anyComplete){
      const best = res.bestCoverage;
      topp = `<div class="alert warn"><b>Ingen butikker har hele handlelisten på lager.</b>
        ${esc(best.store.name)} har best dekning med ${best.linesInStock} av ${best.lineCount} varelinjer.</div>`;
    } else if (inst.modus === "naermest"){
      const naermest = sortert[0];
      const naermestKomplett = TR.Ranking.nearestComplete(res.quotes)[0];
      topp = naermest.isComplete
        ? `<div class="alert ok"><b>${esc(naermest.store.name)}</b> er nærmest og har hele listen på lager.</div>`
        : `<div class="alert"><b>${esc(naermest.store.name)}</b> er nærmest, men mangler
            ${naermest.linesMissing} varelinje(r). Nærmeste varehus med alt på lager er
            <b>${esc(naermestKomplett.store.name)}</b> (${esc(TR.fmt.km(naermestKomplett.distanceKm))},
            ${esc(TR.fmt.kr(naermestKomplett.total - billigst.total))} dyrere enn billigste alternativ).</div>`;
    } else {
      const billigstKomplett = TR.Ranking.cheapestComplete(res.quotes)[0];
      topp = billigst.isComplete
        ? `<div class="alert ok"><b>${esc(billigst.store.name)}</b> er billigst og har hele listen på lager.</div>`
        : `<div class="alert"><b>${esc(billigst.store.name)}</b> er billigst, men mangler
            ${billigst.linesMissing} varelinje(r). Billigste varehus med alt på lager er
            <b>${esc(billigstKomplett.store.name)}</b> til ${esc(TR.fmt.kr(billigstKomplett.total))}
            — ${esc(TR.fmt.kr(billigstKomplett.total - billigst.total))} mer.</div>`;
    }

    vert.innerHTML = topp +
      `<p class="shop-summary">${krav.length} varelinjer sammenlignet hos ${res.quotes.length} varehus.
        Hele listen prises hos én butikk av gangen — varene fordeles ikke mellom kjeder i denne versjonen.</p>` +
      `<div class="store-list">${sortert.map(q=>storeCard(q, ctx)).join("")}</div>`;
  }

  /* ---------- Montering ---------- */
  function mount(prefix, getProducts){
    if (!$(`${prefix}-shopResult`)) return;
    instanser[prefix] = {modus:"billigst", apenButikk:null, getProducts};

    document.querySelectorAll(`#${prefix}-shop [data-shopmode]`).forEach(b=>
      b.addEventListener("click",()=>{
        instanser[prefix].modus = b.dataset.shopmode;
        instanser[prefix].apenButikk = null;
        document.querySelectorAll(`#${prefix}-shop [data-shopmode]`)
          .forEach(x=>x.setAttribute("aria-pressed", x===b));
        render(prefix);
      }));

    $(`${prefix}-shopPostnr`).addEventListener("input", ()=>render(prefix));

    $(`${prefix}-shopResult`).addEventListener("click", e=>{
      const apne = e.target.closest("[data-open-store]");
      if (apne){ instanser[prefix].apenButikk = apne.dataset.openStore; render(prefix); return; }
      if (e.target.closest("[data-shopback]")){ instanser[prefix].apenButikk = null; render(prefix); }
    });

    render(prefix);
  }

  /** Kalles av kalkulatoren når materiallisten er regnet på nytt. */
  function refresh(prefix){ if (instanser[prefix]) render(prefix); }

  return {mount, refresh};
})();
window.ShopCompare = ShopCompare;   // eksponeres eksplisitt: const skaper ikke window-egenskap

/* ========================================================================
   AUTH — innlogging med engangskode på e-post (Supabase Auth, åpen registrering)
   Kode i stedet for klikkbar lenke: lenker "brukes opp" ofte av e-post-
   leverandørers sikkerhetsskanning (særlig Gmail) før brukeren selv klikker.
   ======================================================================== */
const SUPABASE_URL = "https://edutnmtttkhuhkemnnmo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2_sgCwLsDxXvm-1M1FAVLw_tTbCpb6s";

const AUTH = (()=>{
  const sb = SUPABASE_URL.startsWith("http")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  let user = null;
  const listeners = [];

  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(fn=>fn(user)); }

  function syncHeader(){
    $("authLoginBtn").style.display = user ? "none" : "";
    $("authUserBox").style.display = user ? "flex" : "none";
    if (user) $("authUserEmail").textContent = user.email;
  }

  function showStep1(){
    $("authStep1").style.display = ""; $("authStep2").style.display = "none";
    $("authErrorNote").style.display = "none";
  }
  function showStep2(email){
    $("authSentEmail").textContent = email;
    $("authStep1").style.display = "none"; $("authStep2").style.display = "";
    $("authErrorNote").style.display = "none";
    $("authCode").value = "";
  }

  function openLoginModal(){
    $("authEmail").value = "";
    showStep1();
    $("authModal").classList.add("open");
  }
  function closeLoginModal(){ $("authModal").classList.remove("open"); }

  async function signOut(){ if(sb) await sb.auth.signOut(); }

  async function sendCode(email){
    if (!sb){
      $("authErrorNote").textContent = "Supabase er ikke konfigurert ennå — sett SUPABASE_URL/SUPABASE_ANON_KEY.";
      $("authErrorNote").style.display = "block";
      return false;
    }
    if (!email) return false;
    const {error} = await sb.auth.signInWithOtp({ email });
    if (error){
      $("authErrorNote").textContent = "Kunne ikke sende kode: " + error.message;
      $("authErrorNote").style.display = "block";
      return false;
    }
    return true;
  }

  function init(){
    $("authLoginBtn").addEventListener("click", openLoginModal);
    $("authModalClose").addEventListener("click", closeLoginModal);
    $("authModal").addEventListener("click", e=>{ if(e.target.id==="authModal") closeLoginModal(); });
    $("authLogoutBtn").addEventListener("click", signOut);

    $("authSendBtn").addEventListener("click", async ()=>{
      const email = $("authEmail").value.trim();
      if (!email) return;
      $("authSendBtn").disabled = true;
      const ok = await sendCode(email);
      $("authSendBtn").disabled = false;
      if (ok) showStep2(email);
    });

    $("authResendBtn").addEventListener("click", async ()=>{
      const email = $("authSentEmail").textContent;
      $("authResendBtn").disabled = true;
      await sendCode(email);
      $("authResendBtn").disabled = false;
    });

    $("authVerifyBtn").addEventListener("click", async ()=>{
      if (!sb) return;
      const email = $("authSentEmail").textContent;
      const code = $("authCode").value.trim();
      if (!code) return;
      $("authVerifyBtn").disabled = true;
      const {error} = await sb.auth.verifyOtp({ email, token: code, type: "email" });
      $("authVerifyBtn").disabled = false;
      if (error){
        $("authErrorNote").textContent = "Feil kode: " + error.message;
        $("authErrorNote").style.display = "block";
        return;
      }
      closeLoginModal();
    });

    if (!sb){
      console.warn("Tommestokk1: Supabase er ikke konfigurert ennå — sett SUPABASE_URL/SUPABASE_ANON_KEY.");
      return;
    }
    sb.auth.onAuthStateChange((_event, session)=>{
      user = session?.user || null;
      syncHeader(); notify();
    });
    sb.auth.getSession().then(({data})=>{
      user = data.session?.user || null;
      syncHeader(); notify();
    });
  }

  return {init, onChange, signOut, openLoginModal, getUser:()=>user, get sb(){ return sb; }};
})();
AUTH.init();

/* ========================================================================
   PROSJEKTER — "Lagre i prosjekt" og prosjektoversikt på forsiden
   ======================================================================== */
const Projects = (()=>{
  const TOOL_LABELS = {terrasse:"Terrasse", dryppstop:"DryppStop undertak", rekkverk:"Rekkverk", parkett:"Parkett og laminat", kledning:"Kledning", levegg:"Levegg", pergola:"Pergola", utemaling:"Maling utvendig", belegningsstein:"Belegningsstein og grus", plen:"Plen", gjerde:"Gjerde", innemaling:"Maling innvendig", flis:"Flis til bad"};
  let pending = null; // {verktoy, label, inndata, resultat}

  async function list(){
    const {data, error} = await AUTH.sb.from("projects")
      .select("id,navn,opprettet_at").order("opprettet_at",{ascending:false});
    if (error){ console.warn(error); return []; }
    return data;
  }

  async function create(navn){
    const {data, error} = await AUTH.sb.from("projects")
      .insert({navn, user_id: AUTH.getUser().id}).select().single();
    if (error) throw error;
    return data;
  }

  async function saveCalculation(projectId, verktoy, inndata, resultat){
    const {error} = await AUTH.sb.from("calculations")
      .insert({project_id: projectId, verktoy, inndata, resultat});
    if (error) throw error;
  }

  async function countByProject(){
    const {data, error} = await AUTH.sb.from("calculations").select("project_id");
    if (error) return {};
    const counts = {};
    data.forEach(r=>counts[r.project_id]=(counts[r.project_id]||0)+1);
    return counts;
  }

  async function deleteProject(id){
    const {error} = await AUTH.sb.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async function deleteCalculation(id){
    const {error} = await AUTH.sb.from("calculations").delete().eq("id", id);
    if (error) throw error;
  }

  async function updateCalculation(id, resultat){
    const {error} = await AUTH.sb.from("calculations").update({resultat}).eq("id", id);
    if (error) throw error;
  }

  async function listCalculations(projectId){
    const {data, error} = await AUTH.sb.from("calculations")
      .select("id,verktoy,inndata,resultat,opprettet_at")
      .eq("project_id", projectId).order("opprettet_at",{ascending:false});
    if (error){ console.warn(error); return []; }
    return data;
  }

  const dtFmt = iso => new Date(iso).toLocaleString("nb-NO",{dateStyle:"short",timeStyle:"short"});

  let currentProject = null, currentCalcs = [], editingCalcId = null;

  function calcCard(calc){
    const label = TOOL_LABELS[calc.verktoy] || calc.verktoy;
    const editing = calc.id === editingCalcId;
    const products = calc.resultat || [];
    const rows = products.map((p,i)=>{
      const qty = editing
        ? `<input class="price calc-qty" type="number" min="0" step="1" value="${p.quantity}" data-idx="${i}" style="width:5rem" aria-label="Antall ${p.title}">`
        : `<span class="qty-badge">${fmt(p.quantity)}</span> <span class="art" style="display:inline">${p.unit}</span>`;
      const price = editing
        ? `<input class="price calc-price" type="number" min="0" step="1" value="${p.estPrice||0}" data-idx="${i}" aria-label="Pris ${p.title}">`
        : kr(p.estPrice||0);
      return `<tr><td>${p.title}${p.note?`<span class="art">${p.note}</span>`:""}</td>
        <td class="num">${qty}</td><td class="num">${price}</td>
        <td class="num">${kr((p.estPrice||0)*p.quantity)}</td></tr>`;
    }).join("");
    const actions = editing
      ? `<button class="btn calc-save-btn" type="button" data-calc-id="${calc.id}">Lagre endringer</button>
         <button class="btn secondary calc-cancel-btn" type="button" data-calc-id="${calc.id}">Avbryt</button>`
      : `<button class="btn secondary calc-edit-btn" type="button" data-calc-id="${calc.id}">Rediger</button>
         <button class="btn secondary calc-delete-btn" type="button" data-calc-id="${calc.id}">Slett denne beregningen</button>`;
    return `<div class="card" style="margin-top:1rem" data-calc-id="${calc.id}">
      <h2>${label} <span class="hint" style="font-weight:400;text-transform:none;letter-spacing:0">— lagret ${dtFmt(calc.opprettet_at)}</span></h2>
      <table>
        <thead><tr><th>Vare</th><th class="num">Antall</th><th class="num">Pris</th><th class="num">Sum</th></tr></thead>
        <tbody>${rows}</tbody>
        ${Renderer.renderSumRow(products, {})}
      </table>
      <div class="actions" style="margin-top:.75rem">${actions}</div>
    </div>`;
  }

  function renderCalcsList(){
    if (!currentCalcs.length){
      $("projectModalCalcs").innerHTML = `<p style="color:var(--ink-soft);font-size:.88rem;margin-top:1rem">Ingen beregninger lagret i dette prosjektet ennå.</p>`;
      return;
    }
    const prosjektTotal = currentCalcs.reduce((sum,c)=>sum + Renderer.total(c.resultat||[]), 0);
    const totalBanner = currentCalcs.length>1
      ? `<div class="project-total"><span>Prosjektets totalpris <small>(${currentCalcs.length} beregninger, veiledende)</small></span><b>${kr(prosjektTotal)}</b></div>`
      : "";
    $("projectModalCalcs").innerHTML = totalBanner + currentCalcs.map(calcCard).join("");
  }

  async function openProjectModal(project){
    currentProject = project; editingCalcId = null;
    $("projectModalTitle").textContent = project.navn;
    $("projectModalSub").textContent = "Laster lagrede beregninger …";
    $("projectModalCalcs").innerHTML = "";
    $("projectImages").innerHTML = "";
    $("projectImageStatus").textContent = "";
    $("projectModal").classList.add("open");
    currentCalcs = await listCalculations(project.id);
    $("projectModalSub").textContent = currentCalcs.length
      ? `${currentCalcs.length} lagret beregning(er) i dette prosjektet.`
      : "Ingen beregninger lagret i dette prosjektet ennå.";
    renderCalcsList();
    renderImages();
  }

  /* ---- Prosjektbilder (Supabase Storage, privat bucket "prosjektbilder") ---- */
  const BILDE_BUCKET = "prosjektbilder";
  function imgDir(){ return `${AUTH.getUser().id}/${currentProject.id}`; }

  async function listImages(){
    const {data, error} = await AUTH.sb.storage.from(BILDE_BUCKET).list(imgDir(), {sortBy:{column:"created_at",order:"desc"}});
    if (error){ console.warn(error); return []; }
    return (data||[]).filter(f=>f.name!==".emptyFolderPlaceholder");
  }
  async function signedUrl(name){
    const {data, error} = await AUTH.sb.storage.from(BILDE_BUCKET).createSignedUrl(`${imgDir()}/${name}`, 3600);
    return error ? "" : data.signedUrl;
  }

  async function renderImages(){
    const files = await listImages();
    if (!files.length){ $("projectImages").innerHTML = `<p class="empty">Ingen bilder ennå — last opp bilder av tomta, skisser eller framdrift.</p>`; return; }
    const urls = await Promise.all(files.map(f=>signedUrl(f.name)));
    $("projectImages").innerHTML = files.map((f,i)=>
      `<div class="thumb"><img src="${urls[i]}" alt="Prosjektbilde" data-full="${urls[i]}">
        <button type="button" class="img-del" data-name="${f.name}" aria-label="Slett bilde">✕</button></div>`).join("");
  }

  async function uploadImages(fileList){
    const files = [...fileList].filter(f=>f.type.startsWith("image/"));
    if (!files.length) return;
    $("projectImageStatus").textContent = `Laster opp …`;
    let feil = 0;
    for (const file of files){
      const safe = file.name.replace(/[^\w.\-]/g,"_");
      const path = `${imgDir()}/${Date.now()}-${safe}`;
      const {error} = await AUTH.sb.storage.from(BILDE_BUCKET).upload(path, file, {upsert:false});
      if (error){ console.warn(error); feil++; }
    }
    $("projectImageStatus").textContent = feil ? `${feil} bilde(r) feilet` : `Lastet opp ✓`;
    setTimeout(()=>$("projectImageStatus").textContent="", 2500);
    renderImages();
  }

  async function deleteImage(name){
    if (!confirm("Slette dette bildet?")) return;
    const {error} = await AUTH.sb.storage.from(BILDE_BUCKET).remove([`${imgDir()}/${name}`]);
    if (error){ console.warn(error); return; }
    renderImages();
  }
  function closeProjectModal(){ $("projectModal").classList.remove("open"); }

  async function handleDeleteProject(){
    if (!currentProject) return;
    if (!confirm(`Slette prosjektet «${currentProject.navn}» og alle ${currentCalcs.length} lagrede beregning(er) i det? Dette kan ikke angres.`)) return;
    await deleteProject(currentProject.id);
    closeProjectModal();
    renderHomeProjects();
  }

  async function handleCalcsClick(e){
    const editBtn = e.target.closest(".calc-edit-btn");
    const cancelBtn = e.target.closest(".calc-cancel-btn");
    const saveBtn = e.target.closest(".calc-save-btn");
    const delBtn = e.target.closest(".calc-delete-btn");
    if (editBtn){ editingCalcId = editBtn.dataset.calcId; renderCalcsList(); return; }
    if (cancelBtn){ editingCalcId = null; renderCalcsList(); return; }
    if (delBtn){
      if (!confirm("Slette denne beregningen? Dette kan ikke angres.")) return;
      await deleteCalculation(delBtn.dataset.calcId);
      currentCalcs = currentCalcs.filter(c=>c.id!==delBtn.dataset.calcId);
      $("projectModalSub").textContent = currentCalcs.length
        ? `${currentCalcs.length} lagret beregning(er) i dette prosjektet.`
        : "Ingen beregninger lagret i dette prosjektet ennå.";
      renderCalcsList();
      return;
    }
    if (saveBtn){
      const id = saveBtn.dataset.calcId;
      const calc = currentCalcs.find(c=>c.id===id);
      const card = document.querySelector(`[data-calc-id="${id}"]`);
      const products = (calc.resultat||[]).map((p,i)=>{
        const qtyInput = card.querySelector(`.calc-qty[data-idx="${i}"]`);
        const priceInput = card.querySelector(`.calc-price[data-idx="${i}"]`);
        return {...p,
          quantity: Math.max(0, parseFloat(qtyInput.value)||0),
          estPrice: Math.max(0, parseFloat(priceInput.value)||0)};
      });
      await updateCalculation(id, products);
      calc.resultat = products;
      editingCalcId = null;
      renderCalcsList();
      return;
    }
  }

  async function openSaveModal(verktoy, label, inndata, resultat){
    if (!AUTH.getUser()){ AUTH.openLoginModal(); return; }
    pending = {verktoy, label, inndata, resultat};
    $("saveModalSub").textContent = `Lagrer beregningen fra ${label}.`;
    $("saveOkNote").style.display="none"; $("saveErrNote").style.display="none";
    $("saveNewProjectName").value = "";
    $("saveItems").innerHTML = resultat.map((p,i)=>
      `<label><input type="checkbox" class="save-item" data-idx="${i}" checked>
        <span>${p.title} <span class="q">— ${fmt(p.quantity)} ${p.unit}</span></span></label>`).join("");
    const projects = await list();
    $("saveProjectSelect").innerHTML = projects.length
      ? projects.map(p=>`<option value="${p.id}">${p.navn}</option>`).join("")
      : `<option value="">— ingen prosjekter ennå —</option>`;
    $("saveModal").classList.add("open");
  }
  function closeSaveModal(){ $("saveModal").classList.remove("open"); }

  let saving = false;
  async function confirmSave(){
    if (saving) return;
    saving = true;
    $("saveConfirmBtn").disabled = true;
    $("saveErrNote").style.display="none";
    try{
      let projectId = $("saveProjectSelect").value;
      const newName = $("saveNewProjectName").value.trim();
      if (newName) projectId = (await create(newName)).id;
      if (!projectId) throw new Error("Velg eller opprett et prosjekt.");
      const valgte = pending.resultat.filter((_,i)=>
        document.querySelector(`#saveItems .save-item[data-idx="${i}"]`)?.checked);
      if (!valgte.length) throw new Error("Velg minst én vare å lagre.");
      await saveCalculation(projectId, pending.verktoy, pending.inndata, valgte);
      $("saveOkNote").style.display = "block";
      renderHomeProjects();
      setTimeout(closeSaveModal, 1200);
    }catch(err){
      $("saveErrNote").textContent = "Kunne ikke lagre: " + err.message;
      $("saveErrNote").style.display = "block";
    }finally{
      saving = false;
      $("saveConfirmBtn").disabled = false;
    }
  }

  let cache = [];
  async function renderHomeProjects(){
    /* Prosjektlisten finnes bare på forsiden — verktøysidene har den ikke. */
    if (!$("projectsCard")) return;
    if (!AUTH.getUser()){ $("projectsCard").style.display="none"; return; }
    const [projects, counts] = [await list(), await countByProject()];
    cache = projects;
    $("projectsCard").style.display = "block";
    $("projectsList").innerHTML = projects.length
      ? projects.map(p=>`<button type="button" class="dim-step" data-project-id="${p.id}"
          style="width:100%;text-align:left;background:none;border:none;font:inherit;cursor:pointer;border-bottom:1px dashed var(--line)">
          <span class="no">📁</span><div><b>${p.navn}</b>
          <span class="src">${counts[p.id]||0} beregning(er) · opprettet ${dtFmt(p.opprettet_at)} · åpne →</span></div></button>`).join("")
      : `<p style="color:var(--ink-soft);font-size:.88rem">Ingen prosjekter ennå — bruk «Lagre i prosjekt» i et av verktøyene for å komme i gang.</p>`;
    $("projectsList").querySelectorAll("[data-project-id]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const p = cache.find(x=>x.id===btn.dataset.projectId);
        if (p) openProjectModal(p);
      });
    });
  }

  function init(){
    $("saveModalClose").addEventListener("click", closeSaveModal);
    $("saveModal").addEventListener("click", e=>{ if(e.target.id==="saveModal") closeSaveModal(); });
    $("saveConfirmBtn").addEventListener("click", confirmSave);
    $("projectModalClose").addEventListener("click", closeProjectModal);
    $("projectModal").addEventListener("click", e=>{ if(e.target.id==="projectModal") closeProjectModal(); });
    $("projectDeleteBtn").addEventListener("click", handleDeleteProject);
    $("projectModalCalcs").addEventListener("click", handleCalcsClick);
    $("projectImageInput").addEventListener("change", e=>{ uploadImages(e.target.files); e.target.value=""; });
    $("projectImages").addEventListener("click", e=>{
      const del = e.target.closest(".img-del");
      if (del){ deleteImage(del.dataset.name); return; }
      const img = e.target.closest("img[data-full]");
      if (img) window.open(img.dataset.full, "_blank", "noopener");
    });
    $("authProjectsBtn").addEventListener("click", async ()=>{
      /* Prosjektlisten bor på forsiden. Står vi på en verktøyside, må vi dit. */
      if (!$("projectsCard")){ location.href = "/#prosjekter"; return; }
      nav("home");
      await renderHomeProjects();
      $("projectsCard").scrollIntoView({behavior:"smooth", block:"start"});
    });
    AUTH.onChange(renderHomeProjects);
  }

  return {init, openSaveModal};
})();
Projects.init();

/* ========================= Navigasjon ========================= */
/* Forsiden ligger på ren URL uten hash. Verktøyene bruker #terrasse, #dryppstop osv. */
/* Hver visning har egen URL, tittel og beskrivelse — det er dette Google indekserer.
   crumb = merkelappen i toppen, title/desc = <title> og meta description per side. */
const VIEWS = {
  home:            {crumb:"Digitale verktøy for deg som bygger", sti:"/",
                    title:"Tommestokk1 — byggekalkulatorer med materialliste og kappliste",
                    desc:"Legg inn mål og få komplett materialliste, kappliste og handleliste. Dimensjonert etter norske spenntabeller og produsentenes monteringsregler."},
  terrasse:        {crumb:"Verktøy · Terrasse", sti:"/terrasse",
                    title:"Terrassekalkulator — bjelkelag, materialliste og kappliste | Tommestokk1",
                    desc:"Regn ut bjelkelag, bærebjelker, stolper og terrassebord fra målene dine. Spenntabell for C24, kappliste i standardlengder og komplett materialliste."},
  dryppstop:       {crumb:"Verktøy · DryppStop undertak", sti:"/dryppstop",
                    title:"DryppStop undertak — materialliste for tett terrassetak | Tommestokk1",
                    desc:"Komplett handleliste for DryppStop under terrasse eller balkong: plater, profiler, beslag, skruer og fugemasse med varenummer."},
  rekkverk:        {crumb:"Verktøy · Rekkverk", sti:"/rekkverk",
                    title:"Rekkverkskalkulator — TEK17-høyde og spileavstand | Tommestokk1",
                    desc:"Riktig rekkverkshøyde etter fallhøyden og eksakt spileavstand per felt — aldri over 10 cm åpning. Med stolper, sviller og festemidler."},
  parkett:         {crumb:"Verktøy · Parkett og laminat", sti:"/parkett",
                    title:"Parkett- og laminatkalkulator — pakker, underlag og lister | Tommestokk1",
                    desc:"Rommål inn, antall pakker ut. Svinn etter leggemønster, siste rad-sjekk, underlag og fuktsperre, gulvlister og ekspansjonsfuge."},
  kledning:        {crumb:"Verktøy · Kledning", sti:"/kledning",
                    title:"Kledningskalkulator — løpemeter, sløyfer og lekter | Tommestokk1",
                    desc:"Løpemeter kledning fra profilens faktiske dekkbredde. Tømmermann og dobbeltfals, med sløyfer, lekter, spiker og musebånd."},
  levegg:          {crumb:"Verktøy · Levegg", sti:"/levegg",
                    title:"Leveggkalkulator — søknadsfri-sjekk, stolper og bord | Tommestokk1",
                    desc:"Sjekk om leveggen er søknadsfri etter byggesaksforskriften, og få stolper, losholter og bord etter utforming og vindutsatthet."},
  pergola:         {crumb:"Verktøy · Pergola", sti:"/pergola",
                    title:"Pergolakalkulator — stolper, bjelker og sperrer | Tommestokk1",
                    desc:"Bjelkedimensjon velges automatisk etter spennet. Doble bærebjelker, sperrer med utstikk, skråbånd og fundament — med søknadsfri-sjekk."},
  utemaling:       {crumb:"Verktøy · Maling utvendig", sti:"/utemaling",
                    title:"Malingskalkulator utvendig — liter, strøk og grunning | Tommestokk1",
                    desc:"Veggmål inn, liter og spann ut. Dekkevne etter maling, oljedekkbeis eller beis, med grunning på ubehandlet treverk og husvask."},
  belegningsstein: {crumb:"Verktøy · Belegningsstein og grus", sti:"/belegningsstein",
                    title:"Belegningsstein-kalkulator — pukk og settesand i tonn | Tommestokk1",
                    desc:"Areal inn, tonn pukk og settesand ut. Lagoppbygging etter bruk, utgraving i kubikk, fugesand, fiberduk og kantstein."},
  plen:            {crumb:"Verktøy · Plen", sti:"/plen",
                    title:"Plenkalkulator — vekstjord, ferdigplen og gressfrø | Tommestokk1",
                    desc:"Areal inn, vekstjord i kubikk og ferdigplen eller gressfrø ut. Med gjødsel, kalk og råd om tidspunkt og vanning."},
  gjerde:          {crumb:"Verktøy · Gjerde", sti:"/gjerde",
                    title:"Gjerdekalkulator — stolper, bord og port | Tommestokk1",
                    desc:"Stolper, sviller og spiler eller tette bord, med eller uten gang- eller kjøreport. Søknadsfri-sjekk mot vei og nabo."},
  innemaling:      {crumb:"Verktøy · Maling innvendig", sti:"/innemaling",
                    title:"Malingskalkulator innvendig — liter, sparkel og grunning | Tommestokk1",
                    desc:"Rommål inn, liter vegg- og takmaling ut. Grunning og full sparkling på ny gips, med rekkefølge- og luftingsråd."},
  flis:            {crumb:"Verktøy · Flis til bad", sti:"/flis",
                    title:"Fliskalkulator bad — fliser, lim, fug og membran | Tommestokk1",
                    desc:"Fliser, lim og fug etter flisstørrelse, pluss membran med remser. Med våtromsnorm-sjekk og påminnelse om lovpålagt fagansvar."},
};

/* Anonym telling av hvilke verktøy som faktisk åpnes — ingen personopplysninger,
   kun verktøynavn + tidspunkt. Feiler stille hvis Supabase ikke er konfigurert. */
function trackToolView(v){
  if (!AUTH.sb) return;
  AUTH.sb.from("verktoy_visninger").insert({verktoy:v}).then(({error})=>{ if(error) console.warn("trackToolView:",error.message); });
}

function visView(v){
  const info = VIEWS[v];
  /* Verktøysidene inneholder bare sin egen visning — hopp av hvis den mangler. */
  if (!info || !document.getElementById("view-"+v)) return;
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  $("view-"+v).classList.add("active");
  $("crumb").textContent = info.crumb;
  document.title = info.title;
  const md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute("content", info.desc);
  const kan = document.querySelector('link[rel="canonical"]');
  if (kan) kan.setAttribute("href", location.origin + info.sti);
  window.scrollTo({top:0});
  if (v !== "home") trackToolView(v);
}

/* Hver visning har sin egen adresse (/terrasse, /parkett …) slik at Google kan
   indeksere dem hver for seg og lenker kan deles direkte. Serveren må svare med
   index.html for alle stier — se _redirects (Cloudflare) og serve.py (lokalt). */
function viewFromPath(sti){
  const seg = String(sti || "/").replace(/^\/+|\/+$/g, "");
  return VIEWS[seg] ? seg : "home";
}

function nav(v){
  visView(v);
  const sti = VIEWS[v].sti;
  if (location.pathname !== sti) history.pushState({view:v}, "", sti + location.search);
}

function route(){
  const hash = location.hash.slice(1);
  /* Kommer man fra "Mine prosjekter" på en verktøyside, scroll til listen. */
  if (hash === "prosjekter" && $("projectsCard")){
    history.replaceState({view:"home"}, "", "/");
    visView("home");
    setTimeout(()=>$("projectsCard").scrollIntoView({behavior:"smooth", block:"start"}), 60);
    return;
  }
  /* Gamle #-lenker (#terrasse) skrives om til ekte sti, så delte lenker fortsatt virker. */
  if (hash && VIEWS[hash]){
    history.replaceState({view:hash}, "", VIEWS[hash].sti + location.search);
    visView(hash);
    return;
  }
  visView(viewFromPath(location.pathname));
}

/* Navigasjonen er ekte <a href> så den kan krypes av søkemotorer og åpnes i ny
   fane. Vanlig venstreklikk fanges for å bytte visning uten sidelast. */
document.addEventListener("click", e=>{
  const lenke = e.target.closest("a[data-nav]");
  if (!lenke) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  /* Finnes ikke målvisningen i dette dokumentet, lar vi nettleseren laste siden. */
  if (!document.getElementById("view-" + lenke.dataset.nav)) return;
  e.preventDefault();
  nav(lenke.dataset.nav);
});
window.addEventListener("popstate", route);   // tilbake/frem i nettleseren

/* ========================= TERRASSE ========================= */
const TE = (()=>{
  const SPENN = {"48x148":{400:2.7,600:2.3},"48x173":{400:3.2,600:2.7},"48x198":{400:3.6,600:3.1},"48x223":{400:4.1,600:3.5}};
  const REKKE = ["48x148","48x173","48x198","48x223"];
  const BB = {"48x198":{navn:"48 × 198 C24 imp.",spenn:2.5,dobbel:false},"48x223":{navn:"48 × 223 C24 imp.",spenn:2.9,dobbel:false},
              "2x48x198":{navn:"2 stk 48 × 198 C24 imp.",spenn:3.6,dobbel:true},"2x48x223":{navn:"2 stk 48 × 223 C24 imp.",spenn:4.1,dobbel:true}};
  const BORD = {28:{navn:"Terrassebord 28 × 120 imp.",cc:600,dekker:0.125,skrue:"4,8 × 75",pk:250},
                21:{navn:"Terrassebord 21 × 95 imp.", cc:400,dekker:0.100,skrue:"4,2 × 55",pk:250}};
  const st = {bord:28, fest:"oppa", priser:{}};
  let liste = "";

  function beregn(){
    const B=Math.max(1,parseFloat($("te-bredde").value)||0), D=Math.max(1,parseFloat($("te-dybde").value)||0);
    const H=Math.max(10,parseFloat($("te-hoyde").value)||0)/100, svinn=parseInt($("te-svinn").value,10)/100;
    const bord=BORD[st.bord], cc=bord.cc, sko = st.fest==="sko" ? 0.9 : 1.0;
    const maxS = d => SPENN[d][cc]*sko;
    const linjerFor = d => Math.ceil(D/maxS(d))+1;
    const valgt=$("te-tbjelke").value, auto=valgt==="auto";
    let tDim;
    if(auto){ const min=Math.min(...REKKE.map(linjerFor)); tDim=REKKE.find(d=>linjerFor(d)===min); }
    else tDim=valgt;
    const bLinjer=linjerFor(tDim), feltSpenn=D/(bLinjer-1), tSpenn=maxS(tDim);
    let alt=null;
    for(const d of REKKE) if(REKKE.indexOf(d)>REKKE.indexOf(tDim) && linjerFor(d)<bLinjer){ alt={dim:d,linjer:linjerFor(d)}; break; }
    const bb=BB[$("te-bbjelke").value];
    const stolperPerLinje=Math.ceil(B/bb.spenn)+1, stolper=bLinjer*stolperPerLinje, stolpeL=+(H+0.1).toFixed(2);
    const tAntall=Math.floor(B/(cc/1000))+1, tKapp=kapp(D,tAntall);
    const bbFaktor=bb.dobbel?2:1, bbKapp=kapp(B,bLinjer*bbFaktor);
    const rader=Math.ceil(D/bord.dekker), bordLm=Math.ceil(rader*B*(1+svinn));
    const bordSkruer=rader*tAntall*2, skruePk=Math.ceil(bordSkruer/bord.pk);
    const bjelkesko=st.fest==="sko"?tAntall*(bLinjer-1)*2:0, vinkler=st.fest==="oppa"?tAntall*bLinjer:0;
    return {B,D,H,cc,bord,tDim,tSpenn,bLinjer,feltSpenn,alt,bb,stolperPerLinje,stolper,stolpeL,tAntall,tKapp,
            bbKapp,bbFaktor,rader,bordLm,bordSkruer,skruePk,bjelkesko,vinkler,sko,svinn};
  }

  function render(){
    const r=beregn();
    $("te-regelsjekk").innerHTML =
      (r.H<=1.0
        ? `<div class="alert ok"><b>Trolig unntatt søknadsplikt:</b> høyde ≤ 1,0 m. Sjekk avstand til nabogrense (min. 1,0 m) og kommunens arealplan.</div>`
        : `<div class="alert warn"><b>Over 1,0 m høyde:</b> normalt søknadspliktig. Sjekk dibk.no før du bygger.</div>`)
      + (r.H>0.5 ? `<div class="alert warn" style="margin-top:.5rem"><b>Rekkverk:</b> fallhøyde over 0,5 m skal sikres med rekkverk (min. 1,0 m). Beregn det i Rekkverk-verktøyet på forsiden.</div>` : ``);

    const steps=[
      {t:`Bordtype <b>${r.bord.navn.replace(" imp.","")}</b> → terrassebjelker <b>c/c ${r.cc} mm</b>`,
       s:`Regel: c/c 400 for 21 mm bord, c/c 600 for 28 mm bord`},
      {t:`Terrassebjelke <b>${r.tDim.replace("x"," × ")} C24</b> klarer <b>${fm1(r.tSpenn)} m</b> spenn ved c/c ${r.cc}${r.sko<1?" (× 0,9 for bjelkesko)":""}`,
       s:`Spenntabell terrassebjelker, C24, snølast 4,5 kN/m²${$("te-tbjelke").value==="auto"?" · valgt automatisk":""}`},
      {t:`Dybde ${fm1(r.D)} m ÷ ${fm1(r.tSpenn)} m → <b>${r.bLinjer} bærebjelkelinjer</b> (faktisk spenn ${fm1(r.feltSpenn)} m)`,
       s:`Linje ved vegg${r.bLinjer>2?", "+(r.bLinjer-2)+" mellomliggende":""} og linje ytterst`},
      {t:`Bærebjelke <b>${r.bb.navn}</b> → søyleavstand maks <b>${fm1(r.bb.spenn)} m</b> → <b>${r.stolperPerLinje} stolper per linje</b>, ${r.stolper} totalt`,
       s:`Bærebjelketabell, terrassebjelker montert ${st.fest==="oppa"?"oppå":"i bjelkesko"}`},
      {t:`Bredde ${fm1(r.B)} m ved c/c ${r.cc} → <b>${r.tAntall} terrassebjelker</b> à ${fm1(r.D)} m`,
       s:`Kappes fra: ${kappTekst(r.tKapp)}${r.tKapp.skjoter>0?" · skjøtes med lask over bærebjelke":""}`},
    ];
    $("te-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");
    $("te-altHint").innerHTML=r.alt
      ? `<div class="alert">Tips: med <b>${r.alt.dim.replace("x"," × ")}</b> klarer du deg med <b>${r.alt.linjer} bærebjelkelinjer</b> i stedet for ${r.bLinjer} — færre stolper og fundament. Velg dimensjonen i menyen for å sammenligne.</div>` : ``;

    const P=st.priser, setD=(k,v)=>{ if(!(k in P)) P[k]=v; };
    const tLm=Object.entries(r.tKapp.biter).reduce((a,[L,n])=>a+L*n,0);
    const bbLm=Object.entries(r.bbKapp.biter).reduce((a,[L,n])=>a+L*n,0);
    const bbBaseDim = $("te-bbjelke").value.replace("2x","");             // fysisk samme dimensjon, delt/dobbel er kun mengde
    const stolpeDim = "98x98";                                            // terrassestolper er alltid 98×98 i dette verktøyet
    const bordId  = st.bord===28 ? "terrassebord_28x120_imp" : "terrassebord_21x95_imp";
    const skrueId = st.bord===28 ? "terrasseskrue_48x75_a4"  : "terrasseskrue_42x55_a4";

    const rows = [
      Catalog.make(`tbjelke_${r.tDim}_c24`, Math.round(tLm), {sourceTool:"terrasse",
        note:`${r.tAntall} stk à ${fm1(r.D)} m — bestill ${kappTekst(r.tKapp)} per bjelke`, estPrice:P[`tbjelke_${r.tDim}_c24`]}),
      Catalog.make(`baerebjelke_${bbBaseDim}_c24`, Math.round(bbLm), {sourceTool:"terrasse",
        note:`${r.bLinjer}${r.bbFaktor>1?" doble":""} linjer à ${fm1(r.B)} m — ${kappTekst(r.bbKapp)} per linje, skjøt over stolpe`, estPrice:P[`baerebjelke_${bbBaseDim}_c24`]}),
      Catalog.make(`stolpe_${stolpeDim}_imp`, +(r.stolper*r.stolpeL).toFixed(1), {sourceTool:"terrasse",
        note:`${r.stolper} stk à ca. ${fm1(r.stolpeL)} m (justeres på plass)`, estPrice:P[`stolpe_${stolpeDim}_imp`]}),
      Catalog.make("stolpesko_98", r.stolper, {sourceTool:"terrasse",
        note:`én per stolpe — alt.: støpt fundament med søylesko`, estPrice:P.stolpesko_98}),
      Catalog.make(bordId, r.bordLm, {sourceTool:"terrasse",
        note:`≈ ${fm1(r.bordLm*r.bord.dekker)} m² bord — ${r.rader} rader à ${fm1(r.B)} m, inkl. ${Math.round(r.svinn*100)} % svinn, fallende lengder`,
        need:{quantity:+(r.rader*r.B).toFixed(1), unit:"lm", wastePercentage:Math.round(r.svinn*100)}, estPrice:P[bordId]}),
      Catalog.make(skrueId, r.skruePk, {sourceTool:"terrasse",
        note:`${fmt(r.bordSkruer)} skruer — 2 per bord per bjelke`,
        need:{quantity:r.bordSkruer, unit:"stk", wastePercentage:0}, estPrice:P[skrueId]}),
    ];
    if (r.bjelkesko) rows.push(Catalog.make("bjelkesko_48", r.bjelkesko, {sourceTool:"terrasse",
        note:`2 per bjelke per innfesting`, estPrice:P.bjelkesko_48}));
    if (r.vinkler) rows.push(Catalog.make("vinkelbeslag_90", r.vinkler, {sourceTool:"terrasse",
        note:`terrassebjelke → bærebjelke (ev. stikkskruing)`, estPrice:P.vinkelbeslag_90}));
    rows.push(Catalog.make("bolt_m10", r.stolper*2, {sourceTool:"terrasse",
        note:`2 per stolpe, bærebjelke → stolpe`, estPrice:P.bolt_m10}));

    TE.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    if (window.ShopCompare) ShopCompare.refresh("te");   // butikksammenligningen følger materiallisten
    $("te-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("te-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("te-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.B*r.D)}</b><small>m² terrasse</small></div>
      <div class="stat"><b>${r.tAntall}</b><small>terrassebjelker</small></div>
      <div class="stat"><b>${r.bLinjer}</b><small>bærebjelkelinjer</small></div>
      <div class="stat"><b>${r.stolper}</b><small>stolper</small></div>
      <div class="stat"><b>${fmt(r.bordSkruer)}</b><small>skruer</small></div>`;

    $("te-notes").innerHTML=[
      `Bruk hele lengder på terrassebjelkene der du kan${r.tKapp.skjoter>0?" — her må de skjøtes: lask på begge sider, godt innenfor understøtting":""}.`,
      `3–5 mm mellomrom mellom bordene. Start med helt bord ytterst, kapp mot vegg.`,
      `Fundament er ikke priset: jordspyd/skruefundament for lette plattinger, frostfritt støpt punkt for høyde/last.`,
      `Kubbing mellom bjelkene er ikke nødvendig når spenntabellen følges, men stiver av dekket.`,
      r.H>0.5?`Husk rekkverk (min. 1,0 m) — bruk Rekkverk-verktøyet.`:``,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Terrasse ${r.B} × ${r.D} m (${fm1(r.B*r.D)} m²)`,
      `Konstruksjon: ${r.tDim} c/c ${r.cc} på ${r.bLinjer} linjer ${r.bb.navn}, ${r.stolper} stolper`,
    ]);
  }

  function tegn(r){
    const W=660,PAD=52,sk=Math.min((W-2*PAD)/r.B,320/r.D);
    const bw=r.B*sk,dh=r.D*sk,H=dh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan: ${r.bLinjer} bærebjelkelinjer, ${r.tAntall} terrassebjelker">`;
    for(let y=y0;y<y0+dh;y+=Math.max(r.bord.dekker*sk,4))
      s+=`<line x1="${x0}" y1="${y}" x2="${x0+bw}" y2="${y}" stroke="#E6D9B8" stroke-width="2"/>`;
    const ccM=r.cc/1000;
    for(let i=0;i<r.tAntall;i++){const x=Math.min(x0+i*ccM*sk,x0+bw);
      s+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+dh}" stroke="#8E979E" stroke-width="3"/>`;}
    for(let l=0;l<r.bLinjer;l++){const y=y0+l*r.feltSpenn*sk;
      s+=`<line x1="${x0-8}" y1="${y}" x2="${x0+bw+8}" y2="${y}" stroke="#E85D0F" stroke-width="5"/>`;
      const sp=r.B/(r.stolperPerLinje-1);
      for(let p=0;p<r.stolperPerLinje;p++){const x=x0+Math.min(p*sp,r.B)*sk;
        s+=`<rect x="${x-5}" y="${y-5}" width="10" height="10" fill="#1C2A33" rx="2"/>`;}}
    s+=`<rect x="${x0-16}" y="${y0-16}" width="${bw+32}" height="9" fill="#1C2A33"/>
        <text x="${x0-16}" y="${y0-22}" font-size="11" fill="#4A5A64" font-family="Inter,sans-serif">Vegg</text>
        <text x="${x0+bw/2}" y="${y0+dh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.B)} m · ${r.tAntall} bjelker c/c ${r.cc}</text>
        <text x="${x0-30}" y="${y0+dh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+dh/2})">${fm1(r.D)} m · spenn ${fm1(r.feltSpenn)} m</text></svg>`;
    $("te-planSvg").innerHTML=s;
  }

  function init(){
    ["te-bredde","te-dybde","te-tbjelke","te-bbjelke","te-hoyde","te-svinn"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-terrasse [data-bord]").forEach(b=>b.addEventListener("click",()=>{
      st.bord=+b.dataset.bord;   // katalog-id endres automatisk med bordtype — ingen manuell prisreset nødvendig
      document.querySelectorAll("#view-terrasse [data-bord]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-terrasse [data-fest]").forEach(b=>b.addEventListener("click",()=>{
      st.fest=b.dataset.fest;
      document.querySelectorAll("#view-terrasse [data-fest]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("te-copyBtn").addEventListener("click",()=>copy(liste,$("te-copyStatus")));
    $("te-priserBtn").addEventListener("click",()=>{
      $("te-shop").scrollIntoView({behavior:"smooth", block:"start"});
    });
    $("te-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("terrasse","Terrasse",readForm("terrasse"),TE.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= DRYPPSTOP ========================= */
const DS = (()=>{
  const DEKKER=1.5, SKRUE_CC=0.30, FUGE_PROFIL=20, FUGE_SKJOT=12;
  const st={beslag:true,priser:{}};
  let liste="";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("ds-lengde").value)||0), B=Math.max(0.5,parseFloat($("ds-bredde").value)||0);
    const cc=parseInt($("ds-cc").value,10)/100, svinn=parseInt($("ds-svinn").value,10)/100;
    const med=st.beslag, vind=$("ds-vind").checked, bak=$("ds-bakkant").checked;
    const felt=Math.max(1,Math.ceil(B/cc)), rader=felt+1, perFelt=Math.max(1,Math.ceil(L/DEKKER));
    const plater=Math.ceil(felt*perFelt*(1+svinn));
    let n3=Math.floor(L/3), rest=+(L-n3*3).toFixed(3), n15=0;
    if(rest>0.001){ if(rest<=1.5) n15=1; else n3+=1; }
    const prof300=n3*rader, prof150=n15*rader, biter=n3+n15, profilM=rader*L;
    const skjoter=biter>1?(biter-1)*rader:0;
    const beslag=med?rader*Math.ceil(L/3):0;
    let skruerA=rader*(Math.floor(L/SKRUE_CC)+1); if(vind) skruerA+=plater*2;
    const skruer=Math.ceil(skruerA/100);
    const skjotM=(perFelt-1)*felt*cc;
    let fuge=Math.ceil(skjotM/FUGE_SKJOT); if(!med) fuge+=Math.ceil(profilM/FUGE_PROFIL);
    fuge=Math.max(1,fuge);
    const bakkant=bak?Math.ceil(B/2):0;
    return {L,B,cc,felt,rader,perFelt,plater,prof300,prof150,skjoter,beslag,skruer,skruerA,fuge,bakkant,
            fallCm:+(L*1.5).toFixed(1),med,vind};
  }

  function render(){
    const r=beregn();
    $("ds-fallNote").innerHTML=`Krav til fall: min. 1,5 cm/m → med ${String(r.L).replace(".",",")} m lengde trenger du <b>minst ${String(r.fallCm).replace(".",",")} cm</b> høydeforskjell fra vegg til ytterkant.`;
    $("ds-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.L*r.B)}</b><small>m² areal</small></div>
      <div class="stat"><b>${r.rader}</b><small>profilrader</small></div>
      <div class="stat"><b>${r.felt} × ${r.perFelt}</b><small>felt × plater/felt</small></div>
      <div class="stat"><b>${fmt(r.skruerA)}</b><small>skruer totalt</small></div>`;

    const P = st.priser;
    const rows=[];
    const add=(id,antall,kom="")=>{ if(antall>0) rows.push(Catalog.make(id, antall, {note:kom, sourceTool:"dryppstop", estPrice:P[id]})); };
    add("dryppstop_plate",r.plater,`≈ ${fm1(r.plater*0.96)} m² plate (à 0,96 m²) — inkl. svinn`);
    add("dryppstop_prof300",r.prof300);
    add("dryppstop_prof150",r.prof150);
    add("dryppstop_skjot",r.skjoter,r.med&&r.skjoter>0?"profilrader over 3 m må skjøtes også med beslag":"");
    add("dryppstop_beslag",r.beslag,"kappes i lengde per sperre");
    add("dryppstop_skruer",r.skruer,`${fmt(r.skruerA)} skruer${r.vind?" inkl. vindskruer":""}, c/c 30 cm — forbor profilen`);
    add("dryppstop_fuge",r.fuge,r.med?"til plateskjøtene":"bak/over profil + plateskjøter");
    add("dryppstop_bakkant",r.bakkant,"monteres fra vegg og ca. 20 cm ut over platene");

    DS.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("ds-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("ds-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("ds-notes").innerHTML=[
      `Platene dekker 150 cm i fallretning (10 cm overlapp). Siste rad kappes — tapetkniv eller platesaks.`,
      r.cc<0.6?`Ved c/c ${r.cc*100} cm kappes platene i bredden — forvent mer kapp.`:``,
      `Rengjør treverket og avfett profilene før montering. Tetningsmasse i alle plateskjøter.`,
      r.med?`Med beslag slipper du å fuge profilene når raden er maks 3 m og uten bærebjelke i spennet.`
           :`Uten beslag: rikelig fugemasse bak og over profilen mot treverket (ca. 1 tube per 20 m profil).`,
      `Ikke monter tett tak under DryppStop — platene må kunne rengjøres.`,
      `Alu-profiler kan korrodere i saltholdig miljø (kystnære strøk).`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `HANDLELISTE — DryppStop undertak`,
      `Areal: ${r.L} × ${r.B} m (${fm1(r.L*r.B)} m²), c/c ${r.cc*100} cm, ${r.med?"med":"uten"} beslag`,
    ]) + `\nHusk: min. ${r.fallCm} cm fall totalt, forboring av profiler, avfetting før fuging.`;
  }

  function tegn(r){
    const W=640,PAD=46,sk=Math.min((W-2*PAD)/r.B,300/r.L);
    const bw=r.B*sk,lh=r.L*sk,H=lh+2*PAD,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Leggeplan: ${r.felt} felt à ${r.perFelt} plater">`;
    s+=`<rect x="${x0-14}" y="${y0-16}" width="${bw+28}" height="10" fill="#1C2A33"/>
        <text x="${x0-14}" y="${y0-22}" font-size="11" fill="#4A5A64" font-family="Inter,sans-serif">Vegg</text>`;
    for(let f=0;f<r.felt;f++){
      const fx=x0+f*r.cc*sk, fw=Math.min(r.cc*sk,x0+bw-fx);
      for(let p=0;p<r.perFelt;p++){
        const py=y0+p*DEKKER*sk, ph=Math.min(1.6*sk,y0+lh-py);
        s+=`<rect x="${fx+2}" y="${py}" width="${fw-4}" height="${Math.max(ph,4)}" fill="#FFFFFF" stroke="#C9CFD4" rx="2"/>`;
        if(p>0) s+=`<rect x="${fx+2}" y="${py}" width="${fw-4}" height="${Math.min(0.1*sk,ph)}" fill="#F3D9C6"/>`;
      }
    }
    for(let i=0;i<=r.felt;i++){
      const sx=Math.min(x0+i*r.cc*sk,x0+bw);
      s+=`<rect x="${sx-3}" y="${y0}" width="6" height="${lh}" fill="#8E979E" rx="2"/>`;
    }
    s+=`<line x1="${x0}" y1="${y0+lh+18}" x2="${x0+bw}" y2="${y0+lh+18}" stroke="#1C2A33" stroke-width="1.2"/>
        <text x="${x0+bw/2}" y="${y0+lh+34}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.B)} m · ${r.rader} sperrer c/c ${r.cc*100} cm</text>
        <text x="${x0-30}" y="${y0+lh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+lh/2})">${fm1(r.L)} m</text>`;
    const ax=x0+bw+24;
    s+=`<line x1="${ax}" y1="${y0+6}" x2="${ax}" y2="${y0+lh-14}" stroke="#E85D0F" stroke-width="3"/>
        <polygon points="${ax-6},${y0+lh-14} ${ax+6},${y0+lh-14} ${ax},${y0+lh-2}" fill="#E85D0F"/>
        <text x="${ax+12}" y="${y0+lh/2}" font-size="11" fill="#C24C0A" font-family="Inter,sans-serif" transform="rotate(90 ${ax+12} ${y0+lh/2})" text-anchor="middle">Fall min. 1,5 cm/m</text></svg>`;
    $("ds-planSvg").innerHTML=s;
  }

  function init(){
    ["ds-lengde","ds-bredde","ds-cc","ds-svinn","ds-vind","ds-bakkant"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    $("ds-medBeslag").addEventListener("click",()=>{st.beslag=true;sync();});
    $("ds-utenBeslag").addEventListener("click",()=>{st.beslag=false;sync();});
    function sync(){
      $("ds-medBeslag").setAttribute("aria-pressed",st.beslag);
      $("ds-utenBeslag").setAttribute("aria-pressed",!st.beslag);
      render();
    }
    $("ds-copyBtn").addEventListener("click",()=>copy(liste,$("ds-copyStatus")));
    $("ds-priserBtn").addEventListener("click",()=>PriceModal.open(DS.products, "DryppStop undertak"));
    $("ds-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("dryppstop","DryppStop undertak",readForm("dryppstop"),DS.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= REKKVERK ========================= */
const RK = (()=>{
  /* TEK17 §12-15: maks lysåpning 0,10 m. Vi dimensjonerer mot 98 mm for byggemargin. */
  const MAKS_APNING = 0.098;
  const SPILE = {45:{navn:"Spile 21 × 45 imp.", b:0.045, id:"spile_21x45_imp"},
                 70:{navn:"Spile 21 × 70 imp.", b:0.070, id:"spile_21x70_imp"},
                 95:{navn:"Spile 21 × 95 imp.", b:0.095, id:"spile_21x95_imp"}};
  const STOLPE = {"48x98":{navn:"Stolpe 48 × 98 imp.", b:0.048, id:"stolpe_48x98_imp"},
                  "98x98":{navn:"Stolpe 98 × 98 imp.", b:0.098, id:"stolpe_98x98_imp"}};
  const st = {spile:45, stolpe:"48x98", priser:{}};
  let liste = "";

  /* Kjernen: fordel spiler jevnt i et felt uten å bryte 10 cm-kravet */
  function spilefelt(feltB, spileB){
    if (feltB <= MAKS_APNING) return {n:0, apn:feltB};        // lite felt — trenger ingen spile
    const n = Math.ceil((feltB - MAKS_APNING) / (spileB + MAKS_APNING));
    const apn = (feltB - n*spileB) / (n + 1);
    return {n, apn};
  }

  function beregn(){
    const sider = ["rk-sideA","rk-sideB","rk-sideC"]
      .map((id,i)=>({navn:"ABC"[i], L:Math.max(0,parseFloat($(id).value)||0)}))
      .filter(s=>s.L>0.2);
    const fall = Math.max(0,parseFloat($("rk-fall").value)||0)/100;   // m
    const ccMaks = parseInt($("rk-cc").value,10)/100;
    const sammen = $("rk-sammenheng").checked && sider.length>1;
    const handloper = $("rk-handloper").checked;
    const sp = SPILE[st.spile], stp = STOLPE[st.stolpe];

    /* TEK17-krav ut fra fallhøyde */
    const kravRekkverk = fall > 0.5;
    const kravH = fall > 10 ? 1.2 : 1.0;
    const H = kravH;                                   // byggehøyde = kravet (mål fra overkant dekke)

    /* Per side: stolper, felt, spiler */
    let totStolper=0, totSpiler=0, totL=0, perSide=[];
    for (const s of sider){
      const nStolper = Math.ceil(s.L/ccMaks) + 1;
      const nFelt = nStolper - 1;
      const feltB = (s.L - nStolper*stp.b) / nFelt;    // lysmål mellom stolpene
      const f = spilefelt(feltB, sp.b);
      perSide.push({...s, nStolper, nFelt, feltB, spilerPerFelt:f.n, apn:f.apn});
      totStolper += nStolper; totSpiler += f.n*nFelt; totL += s.L;
    }
    if (sammen) totStolper -= (sider.length-1);        // delte hjørnestolper

    /* Lengder */
    const spileL = +(H - 0.05 - 0.028).toFixed(2);     // fra 5 cm over dekke til underkant toppbord
    const stolpeL = +(H + 0.45).toFixed(2);            // + innfesting mot bjelkelag
    const spileLm = Math.ceil(totSpiler*spileL*1.10);  // 10 % kapp
    const stolpeLm = +(totStolper*stolpeL).toFixed(1);
    const svillLm = Math.ceil(totL*2*1.05);            // topp- og bunnsvill
    const toppLm = handloper ? Math.ceil(totL*1.05) : 0;
    const spileSkruer = totSpiler*4;                    // 2 topp + 2 bunn
    const spileSkruerPk = Math.ceil(spileSkruer/250);
    const bolter = totStolper*2;

    const verste = Math.max(...perSide.map(p=>p.apn));
    return {sider:perSide, fall, kravRekkverk, kravH, H, sammen, ccMaks, sp, stp,
            totStolper, totSpiler, totL, spileL, stolpeL, spileLm, stolpeLm, svillLm,
            toppLm, handloper, spileSkruer, spileSkruerPk, bolter, verste};
  }

  function render(){
    const r = beregn();
    if (!r.sider.length){
      $("rk-dimSteps").innerHTML = `<div class="alert">Angi minst én sidelengde over 0,2 m.</div>`;
      $("rk-planSvg").innerHTML=""; $("rk-stats").innerHTML="";
      $("rk-matTable").querySelector("tbody").innerHTML=""; $("rk-notes").innerHTML="";
      RK.products = []; liste=""; return;
    }

    /* Regelsjekk */
    $("rk-regelsjekk").innerHTML =
      (!r.kravRekkverk
        ? `<div class="alert ok"><b>Fallhøyde ≤ 0,5 m:</b> TEK17 krever ikke rekkverk — men verktøyet regner gjerne likevel.</div>`
        : `<div class="alert"><b>Rekkverk påkrevd</b> (fallhøyde over 0,5 m, TEK17 §12-11). Kravhøyde: <b>${r.kravH.toFixed(1).replace(".",",")} m</b>${r.fall>10?" (over 10 m fall)":""}.</div>`)
      + (r.fall>=3 ? "" : r.kravRekkverk ? `<div class="alert ok" style="margin-top:.5rem">Under 3,0 m fall kan sikring løses på annen forsvarlig måte (f.eks. dyp blomsterkasse) — men rekkverk er den enkle fasiten.</div>` : "");

    /* Slik er det regnet */
    const sideTekst = r.sider.map(p=>
      `Side ${p.navn} (${fm1(p.L)} m): <b>${p.nStolper} stolper</b> → ${p.nFelt} felt à ${(p.feltB*100).toFixed(0)} cm → <b>${p.spilerPerFelt} spiler per felt</b>, lysåpning <b>${(p.apn*1000).toFixed(0)} mm</b>`
    ).join("<br>");
    const steps = [
      {t:`Fallhøyde ${fm1(r.fall)} m → rekkverkshøyde <b>${r.kravH.toFixed(1).replace(".",",")} m</b>`,
       s:`TEK17 §12-15: min. 1,0 m inntil 10 m nivåforskjell, 1,2 m over`},
      {t:`Stolper ${r.stp.navn.replace(" imp.","")} med maks c/c ${r.ccMaks*100} cm`,
       s:sideTekst + (r.sammen?`<br>Hjørnestolper deles: −${r.sider.length-1} stolpe(r)`:``)},
      {t:`Spiler fordeles jevnt: verste lysåpning <b>${(r.verste*1000).toFixed(0)} mm</b> ≤ 100 mm ✓`,
       s:`TEK17 §12-15 (5): åpninger maks 0,10 m — verktøyet dimensjonerer mot 98 mm for byggemargin`},
      {t:`Spilelengde ca. <b>${(r.spileL*100).toFixed(0)} cm</b> (${r.totSpiler} stk), stolpelengde ca. <b>${(r.stolpeL*100).toFixed(0)} cm</b>`,
       s:`Spile: 5 cm over dekket til underkant toppbord · stolpe: + 45 cm innfesting mot bjelkelaget`},
    ];
    $("rk-dimSteps").innerHTML = steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    /* Materialliste */
    const P = st.priser;
    const rows = [
      Catalog.make(r.stp.id, r.stolpeLm, {sourceTool:"rekkverk", estPrice:P[r.stp.id],
        note:`${r.totStolper} stk à ca. ${(r.stolpeL*100).toFixed(0)} cm — boltes mot bjelkelag/stubbloft`}),
      Catalog.make("rekkverk_svill_48x73", r.svillLm, {sourceTool:"rekkverk", estPrice:P.rekkverk_svill_48x73,
        note:`2 × ${fm1(r.totL)} m mellom stolpene, inkl. 5 % kapp`}),
      Catalog.make(r.sp.id, r.spileLm, {sourceTool:"rekkverk", estPrice:P[r.sp.id],
        note:`${r.totSpiler} spiler à ${(r.spileL*100).toFixed(0)} cm, inkl. 10 % kapp — kjøp lengder delelig på spilemålet`}),
    ];
    if (r.toppLm) rows.push(Catalog.make("rekkverk_toppbord_28x120_imp", r.toppLm, {sourceTool:"rekkverk",
        estPrice:P.rekkverk_toppbord_28x120_imp, note:`legges flatt over stolper og spiler, skjøt over stolpe`}));
    rows.push(
      Catalog.make("treskrue_42x55_a4", r.spileSkruerPk, {sourceTool:"rekkverk", estPrice:P.treskrue_42x55_a4,
        note:`${fmt(r.spileSkruer)} skruer — 2 i topp og 2 i bunn per spile`}),
      Catalog.make("konstruksjonsskrue_6x90", 1, {sourceTool:"rekkverk", estPrice:P.konstruksjonsskrue_6x90,
        note:`sviller og toppbord mot stolper`}),
      Catalog.make("bolt_m10", r.bolter, {sourceTool:"rekkverk", estPrice:P.bolt_m10,
        note:`2 per stolpe — aldri bare skruer i stolpeinnfestingen`}),
    );

    RK.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("rk-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("rk-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("rk-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.totL)}</b><small>lm rekkverk</small></div>
      <div class="stat"><b>${r.totStolper}</b><small>stolper</small></div>
      <div class="stat"><b>${fmt(r.totSpiler)}</b><small>spiler</small></div>
      <div class="stat"><b>${(r.verste*1000).toFixed(0)}</b><small>mm maks åpning</small></div>
      <div class="stat"><b>${r.kravH.toFixed(1).replace(".",",")}</b><small>m høyde</small></div>`;

    $("rk-notes").innerHTML=[
      `Bruk kun vertikale spiler — liggende spiler gjør rekkverket klatrbart og bryter TEK17 §12-15 (1).`,
      `Åpning mellom dekke og bunnsvill/spiler: maks 10 cm (5 cm hvis rekkverket står utenpå bjelkelaget).`,
      `Stolpene boltes med 2 gjennomgående bolter mot bjelkelaget — rekkverket skal tåle at noen faller mot det.`,
      `Lag ett spilefelt som mal, kontrollmål lysåpningen, og bruk en kappet klosse som avstandslære for resten.`,
      `Bygg 1–2 cm over kravhøyden — treverket setter seg, og kontrollmål gjøres fra overkant ferdig dekke.`,
    ].map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Rekkverk ${fm1(r.totL)} lm, høyde ${r.kravH.toFixed(1)} m`,
      `Sider: ${r.sider.map(p=>`${p.navn}=${fm1(p.L)} m`).join(", ")} · ${r.sp.navn} · maks åpning ${(r.verste*1000).toFixed(0)} mm`,
    ]);
  }

  /* Felttegning: lengste side i oppriss, målsatt */
  function tegn(r){
    const p = [...r.sider].sort((a,b)=>b.L-a.L)[0];
    const visFelt = Math.min(p.nFelt, 3);                       // vis inntil 3 felt
    const W=660, PAD=54;
    const feltPx = (W-2*PAD-((visFelt+1)*10)) / visFelt;
    const skala = feltPx / p.feltB;
    const hPx = r.H*skala*0.55;                                  // komprimer høyden litt for lesbarhet
    const Hsvg = hPx + 2*PAD + 10;
    const y0 = PAD, yDekk = y0 + hPx;
    let s = `<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Rekkverksfelt med ${p.spilerPerFelt} spiler og ${(p.apn*1000).toFixed(0)} mm lysåpning">`;
    // dekke
    s+=`<rect x="${PAD-20}" y="${yDekk}" width="${W-2*PAD+40}" height="8" fill="#E6D9B8" stroke="#C9CFD4"/>`;
    let x = PAD;
    for(let f=0; f<visFelt; f++){
      // stolpe
      s+=`<rect x="${x}" y="${y0-6}" width="10" height="${hPx+14}" fill="#8E979E" rx="2"/>`;
      const fx = x+10;
      // sviller
      s+=`<rect x="${fx}" y="${y0+14}" width="${feltPx}" height="5" fill="#1C2A33"/>
          <rect x="${fx}" y="${yDekk-16}" width="${feltPx}" height="5" fill="#1C2A33"/>`;
      // spiler jevnt fordelt
      const apnPx = p.apn*skala, spPx = r.sp.b*skala;
      for(let i=0;i<p.spilerPerFelt;i++){
        const sx = fx + apnPx + i*(spPx+apnPx);
        s+=`<rect x="${sx}" y="${y0+10}" width="${Math.max(spPx,2)}" height="${hPx-22}" fill="#E6D9B8" stroke="#C9CFD4" stroke-width=".5"/>`;
      }
      // åpningsmål i første felt
      if(f===0 && p.spilerPerFelt>0){
        const mx1=fx, mx2=fx+apnPx, my=y0+hPx*0.5;
        s+=`<line x1="${mx1}" y1="${my}" x2="${mx2}" y2="${my}" stroke="#C24C0A" stroke-width="1.5"/>
            <text x="${(mx1+mx2)/2}" y="${my-6}" font-size="11" text-anchor="middle" fill="#C24C0A" font-family="Inter" font-weight="600">${(p.apn*1000).toFixed(0)}</text>`;
      }
      x = fx + feltPx;
    }
    // siste stolpe
    s+=`<rect x="${x}" y="${y0-6}" width="10" height="${hPx+14}" fill="#8E979E" rx="2"/>`;
    // toppbord
    if(r.handloper) s+=`<rect x="${PAD-6}" y="${y0-12}" width="${x-PAD+22}" height="8" fill="#E85D0F" rx="2"/>`;
    // høydemål
    s+=`<line x1="${PAD-26}" y1="${y0-8}" x2="${PAD-26}" y2="${yDekk}" stroke="#1C2A33" stroke-width="1.2"/>
        <text x="${PAD-32}" y="${(y0+yDekk)/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${PAD-32} ${(y0+yDekk)/2})">${r.kravH.toFixed(1).replace(".",",")} m</text>`;
    // feltmål
    s+=`<text x="${W/2}" y="${yDekk+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Side ${p.navn}: felt à ${(p.feltB*100).toFixed(0)} cm · ${p.spilerPerFelt} spiler · lysåpning ${(p.apn*1000).toFixed(0)} mm${p.nFelt>visFelt?` · (${p.nFelt} felt totalt)`:``}</text>`;
    s+=`</svg>`;
    $("rk-planSvg").innerHTML=s;
  }

  function init(){
    ["rk-sideA","rk-sideB","rk-sideC","rk-fall","rk-cc","rk-sammenheng","rk-handloper"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-rekkverk [data-spile]").forEach(b=>b.addEventListener("click",()=>{
      st.spile=+b.dataset.spile;   // katalog-id endres automatisk med spiledimensjon
      document.querySelectorAll("#view-rekkverk [data-spile]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-rekkverk [data-stolpe]").forEach(b=>b.addEventListener("click",()=>{
      st.stolpe=b.dataset.stolpe;
      document.querySelectorAll("#view-rekkverk [data-stolpe]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("rk-copyBtn").addEventListener("click",()=>copy(liste,$("rk-copyStatus")));
    $("rk-priserBtn").addEventListener("click",()=>PriceModal.open(RK.products, "Rekkverk"));
    $("rk-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("rekkverk","Rekkverk",readForm("rekkverk"),RK.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= PARKETT ========================= */
const PK = (()=>{
  /* Svinn per leggemønster (bransjetommelfingre: rett 3-5 %, diagonal 10-15 %, fiskebein 15-20 %) */
  const SVINN = {rett:0.05, diagonal:0.12, fiskebein:0.18};
  const MONSTER_NAVN = {rett:"rett legging", diagonal:"diagonal legging", fiskebein:"fiskebein"};
  const UNDERLAG_RULL = 15, FUKTSPERRE_RULL = 39;   // m² per rull
  /* Maks sammenhengende flate uten ekspansjonsprofil (typiske produsentgrenser) */
  const MAKS_FLATE = {parkett:{langs:12, tvers:6}, laminat:{langs:10, tvers:10}};
  const st = {gulv:"parkett", monster:"rett", under:"tre", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("pk-lengde").value)||0), B=Math.max(0.5,parseFloat($("pk-bredde").value)||0);
    const langs=Math.max(L,B), tvers=Math.min(L,B);      // bord legges langs rommets lengste retning
    const areal=+(L*B).toFixed(2);
    const svinn=SVINN[st.monster];
    const pakkeM2=Math.max(0.5,parseFloat($("pk-pakke").value)||2.2);
    const bestillM2=+(areal*(1+svinn)).toFixed(1);
    const pakker=Math.ceil(bestillM2/pakkeM2);
    const bordB=Math.max(0.06,(parseFloat($("pk-bordbredde").value)||190)/1000);   // m
    const rader=Math.ceil(tvers/bordB);
    const sisteRad=+(tvers-(rader-1)*bordB).toFixed(3);   // bredde på siste rad, m
    const sisteSmal=st.monster==="rett" && sisteRad<0.05;
    const delteRader=+((bordB+sisteRad)/2).toFixed(3);    // første/siste rad hvis man deler kappet
    const veggAvstand=Math.max(10,Math.ceil(1.5*tvers));  // mm — 1,5 mm per breddemeter, min 10
    const grense=MAKS_FLATE[st.gulv];
    const trengerTprofil=langs>grense.langs || tvers>grense.tvers;
    const tprofiler=trengerTprofil?Math.ceil(tvers/2.7):0;   // én fuge over rommets bredde
    const underlagRuller=Math.ceil(areal/UNDERLAG_RULL);
    const fuktsperre=st.under==="betong"?Math.ceil(areal*1.15/FUKTSPERRE_RULL):0;  // 15 % til 20 cm overlapp
    const dorer=Math.max(0,parseInt($("pk-dorer").value,10)||0);
    const medLister=$("pk-lister").checked;
    const listLm=medLister?Math.ceil((2*(L+B)-dorer*0.9)*1.05):0;
    return {L,B,langs,tvers,areal,svinn,pakkeM2,bestillM2,pakker,bordB,rader,sisteRad,sisteSmal,
            delteRader,veggAvstand,grense,trengerTprofil,tprofiler,underlagRuller,fuktsperre,
            dorer,medLister,listLm};
  }

  function render(){
    const r=beregn();

    /* Regelsjekk */
    $("pk-regelsjekk").innerHTML =
      (st.under==="betong"
        ? `<div class="alert ok"><b>Betong/varmekabler:</b> fuktsperre (0,2 mm PE-folie, SD &gt; 75) er lagt til i listen. Legges med 20 cm overlapp, skjøter tapes.</div>`
        : ``)
      + (r.trengerTprofil
        ? `<div class="alert warn" style="margin-top:.5rem"><b>Stor flate:</b> over ${r.grense.langs} × ${r.grense.tvers} m må gulvflaten deles med ekspansjonsfuge — T-profil er lagt til i listen. Del ved en døråpning om mulig.</div>`
        : ``);

    /* Slik er det regnet */
    const steps=[
      {t:`Areal ${fm1(r.L)} × ${fm1(r.B)} m = <b>${fm1(r.areal)} m²</b> + ${Math.round(r.svinn*100)} % svinn (${MONSTER_NAVN[st.monster]}) → bestill <b>${fm1(r.bestillM2)} m²</b>`,
       s:`Tommelfingerregel: rett 5 %, diagonal 12 %, fiskebein 18 % — kapp gjenbrukes som startbord i neste rad`},
      {t:`${fm1(r.bestillM2)} m² ÷ ${String(r.pakkeM2).replace(".",",")} m²/pakke → <b>${r.pakker} pakker</b>`,
       s:`Rund alltid opp — rest er reserve ved feilkapp og senere reparasjon`},
      ...(st.monster==="rett"?[
      {t:`Bredde ${fm1(r.tvers)} m ÷ ${Math.round(r.bordB*1000)} mm bord → <b>${r.rader} rader</b>, siste rad <b>${Math.round(r.sisteRad*1000)} mm</b>${r.sisteSmal?` — for smal!`:``}`,
       s:r.sisteSmal
         ?`Under 50 mm: kapp første rad til ${Math.round(r.delteRader*1000)} mm, så blir første og siste rad like brede`
         :`Over 50 mm — greit å legge siste rad som den blir`}]:[]),
      {t:`Veggavstand <b>${r.veggAvstand} mm</b> hele veien rundt — skjules av gulvlisten`,
       s:`1,5 mm per breddemeter, minst 10 mm — gulvet skal flyte fritt`},
      {t:st.under==="betong"
        ?`Undergulv betong/varmekabler → <b>fuktsperre + ${r.underlagRuller} rull underlag</b>`
        :`Undergulv tre/spon → <b>${r.underlagRuller} rull underlag</b>, fuktsperre ikke nødvendig`,
       s:`Underlag à ${UNDERLAG_RULL} m² per rull${st.under==="betong"?` · alternativ: kombiunderlag med innebygd fuktsperre`:``}`},
    ];
    $("pk-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    /* Materialliste */
    const P=st.priser;
    const gulvId = st.monster==="fiskebein" ? "fiskebein_klikk" : (st.gulv==="parkett" ? "parkett_klikk_14" : "laminat_klikk_8");
    const rows=[
      Catalog.make(gulvId, r.pakker, {sourceTool:"parkett",
        note:`${fm1(r.bestillM2)} m² inkl. ${Math.round(r.svinn*100)} % svinn — sjekk m²/pakke mot valgt produkt${st.monster==="fiskebein"?` · fiskebein krever egne A- og B-bord`:``}`,
        estPrice:P[gulvId]}),
      Catalog.make("gulvunderlag_foam", r.underlagRuller, {sourceTool:"parkett",
        note:`${fm1(r.areal)} m² gulvflate, rull à ${UNDERLAG_RULL} m²`, estPrice:P.gulvunderlag_foam}),
    ];
    if (r.fuktsperre) rows.push(Catalog.make("fuktsperre_02mm", r.fuktsperre, {sourceTool:"parkett",
        note:`kreves på betong/varmekabler — 20 cm overlapp, tapede skjøter`, estPrice:P.fuktsperre_02mm}));
    if (r.listLm) rows.push(Catalog.make("gulvlist_12x58", r.listLm, {sourceTool:"parkett",
        note:`omkrets ${fm1(2*(r.L+r.B))} m − ${r.dorer} døråpning(er), inkl. 5 % kapp — gjæres i hjørnene`, estPrice:P.gulvlist_12x58}));
    if (r.dorer) rows.push(Catalog.make("overgangslist_terskel", r.dorer, {sourceTool:"parkett",
        note:`én per døråpning — husk ekspansjonsrom også under listen`, estPrice:P.overgangslist_terskel}));
    if (r.tprofiler) rows.push(Catalog.make("t_profil_ekspansjon", r.tprofiler, {sourceTool:"parkett",
        note:`deler flater over ${r.grense.langs} × ${r.grense.tvers} m — legg fugen ved døråpning om mulig`, estPrice:P.t_profil_ekspansjon}));
    rows.push(Catalog.make("avstandskiler", 1, {sourceTool:"parkett",
        note:`holder ${r.veggAvstand} mm veggavstand under legging — fjernes før listing`, estPrice:P.avstandskiler}));

    PK.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("pk-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("pk-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("pk-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.areal)}</b><small>m² gulv</small></div>
      <div class="stat"><b>${r.pakker}</b><small>pakker</small></div>
      ${st.monster==="rett"?`<div class="stat"><b>${r.rader}</b><small>rader</small></div>
      <div class="stat"><b>${Math.round(r.sisteRad*1000)}</b><small>mm siste rad</small></div>`:``}
      <div class="stat"><b>${r.veggAvstand}</b><small>mm veggavstand</small></div>`;

    $("pk-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg fritt hos forhandleren, og juster bordbredde, m² per pakke og pris til gulvet du lander på — mengdene regnes om automatisk.`,
      `La pakkene akklimatisere seg 48 timer i rommet før legging — uåpnet, liggende flatt.`,
      `Legg bordene i lysretningen (mot hovedvinduet), eller langs rommets lengste vegg.`,
      `Endeskjøter forskyves minst 40–50 cm fra rad til rad — start neste rad med kappet fra forrige.`,
      st.monster==="fiskebein"?`Fiskebein: tørrlegg de tre første radene og kontroller vinkelen mot lengste vegg før du klikker.`:``,
      st.gulv==="parkett"?`Parkett frarådes i våtrom — bruk våtromsgodkjent gulv der.`:``,
      st.under==="betong"?`Nystøpt betong må være tørr (RF under 65 %) før gulvet legges — fuktsperren erstatter ikke uttørking.`:``,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Parkett/laminat ${r.L} × ${r.B} m (${fm1(r.areal)} m²)`,
      `${MONSTER_NAVN[st.monster]}, ${Math.round(r.svinn*100)} % svinn → ${fm1(r.bestillM2)} m² · undergulv: ${st.under==="betong"?"betong/varmekabler":"tre/spon"}`,
    ]);
  }

  /* Leggeplan: rommet ovenfra, bord langs lengste retning */
  function tegn(r){
    const W=660,PAD=52,sk=Math.min((W-2*PAD)/r.langs,300/r.tvers);
    const bw=r.langs*sk,bh=r.tvers*sk,H=bh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Leggeplan: ${r.rader} rader, siste rad ${Math.round(r.sisteRad*1000)} mm">`;
    /* veggavstand/ekspansjon markeres som oransje ramme utenpå gulvet */
    s+=`<rect x="${x0-5}" y="${y0-5}" width="${bw+10}" height="${bh+10}" fill="none" stroke="#E85D0F" stroke-width="2" stroke-dasharray="6 4"/>`;
    if (st.monster==="rett"){
      const bordL=2.0*sk;                                  // typisk bordlengde for illustrasjon
      for(let i=0;i<r.rader;i++){
        const y=y0+i*r.bordB*sk;
        const h=Math.min(r.bordB*sk,y0+bh-y);
        const siste=i===r.rader-1;
        if(h<=0) break;
        s+=`<rect x="${x0}" y="${y}" width="${bw}" height="${Math.max(h,2)}" fill="${siste?"#F5C842":"#E6D9B8"}" stroke="#C9CFD4" stroke-width="1"/>`;
        const offset=((i%3)*0.45+0.3)*sk;                  // forskutte endeskjøter
        for(let x=x0+offset;x<x0+bw-2;x+=bordL)
          s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+h}" stroke="#C9CFD4" stroke-width="1.2"/>`;
      }
    } else if (st.monster==="diagonal"){
      s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4"/>`;
      const step=Math.max(r.bordB*sk*1.4,10);
      for(let d=-bh;d<bw;d+=step)
        s+=`<line x1="${x0+Math.max(d,0)}" y1="${y0+Math.max(-d,0)}" x2="${x0+Math.min(d+bh,bw)}" y2="${y0+Math.min(bw-d,bh)}" stroke="#C9CFD4" stroke-width="1.5"/>`;
    } else {
      s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4"/>`;
      const seg=Math.max(r.bordB*sk*2.2,16);
      for(let y=y0+seg/2;y<y0+bh;y+=seg)
        for(let x=x0;x<x0+bw-seg;x+=seg)
          s+=`<path d="M${x} ${y} l${seg/2} ${-seg/2} l${seg/2} ${seg/2}" fill="none" stroke="#C9CFD4" stroke-width="1.5"/>`;
    }
    s+=`<text x="${x0+bw/2}" y="${y0+bh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.langs)} m · bord legges denne veien →</text>
        <text x="${x0-30}" y="${y0+bh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+bh/2})">${fm1(r.tvers)} m${st.monster==="rett"?` · ${r.rader} rader`:``}</text>
        <text x="${x0+bw-4}" y="${y0-10}" font-size="11" text-anchor="end" fill="#C24C0A" font-family="Inter,sans-serif">${r.veggAvstand} mm veggavstand</text>`;
    if (st.monster==="rett")
      s+=`<text x="${x0+bw+8}" y="${y0+bh-r.sisteRad*sk/2+4}" font-size="11" fill="#C99A1F" font-family="Inter,sans-serif" font-weight="600">${Math.round(r.sisteRad*1000)}</text>`;
    s+=`</svg>`;
    $("pk-planSvg").innerHTML=s;
  }

  function init(){
    ["pk-lengde","pk-bredde","pk-bordbredde","pk-pakke","pk-dorer","pk-lister"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-parkett [data-gulv]").forEach(b=>b.addEventListener("click",()=>{
      st.gulv=b.dataset.gulv;
      document.querySelectorAll("#view-parkett [data-gulv]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-parkett [data-monster]").forEach(b=>b.addEventListener("click",()=>{
      st.monster=b.dataset.monster;
      document.querySelectorAll("#view-parkett [data-monster]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-parkett [data-under]").forEach(b=>b.addEventListener("click",()=>{
      st.under=b.dataset.under;
      document.querySelectorAll("#view-parkett [data-under]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("pk-copyBtn").addEventListener("click",()=>copy(liste,$("pk-copyStatus")));
    $("pk-priserBtn").addEventListener("click",()=>PriceModal.open(PK.products, "Parkett og laminat"));
    $("pk-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("parkett","Parkett og laminat",readForm("parkett"),PK.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= KLEDNING ========================= */
const KL = (()=>{
  /* Dekkbredde-modeller (mm): tømmermann = par av bord med 25 mm overlapp per side,
     dobbeltfals = bordbredde minus fals (~15 mm). Kilde: leverandørenes forbrukstall
     (≈8,2 lm/m² rektangulær, ≈7,7 lm/m² dobbeltfals ved 148 mm bord). */
  const OVERLAPP = 25, FALS = 15, CC_LEKT = 0.6, SPIKER_PK = 110;
  const TYPER = {
    tommermann: {navn:"Tømmermann (stående)",       staaende:true,  bordId:"kledning_rekt_19x148",  lmPerM2:b=>2000/(2*b-2*OVERLAPP), spikerPerLm:2.5},
    dfals_st:   {navn:"Dobbeltfals (stående)",      staaende:true,  bordId:"kledning_dfals_19x148", lmPerM2:b=>1000/(b-FALS),         spikerPerLm:3.4},
    dfals_ligg: {navn:"Dobbeltfals/vestlands (liggende)", staaende:false, bordId:"kledning_dfals_19x148", lmPerM2:b=>1000/(b-FALS),    spikerPerLm:3.4},
  };
  const st = {ktype:"tommermann", priser:{}};
  let liste = "";

  function beregn(){
    const vegger = ["kl-veggA","kl-veggB","kl-veggC"]
      .map((id,i)=>({navn:"ABC"[i], L:Math.max(0,parseFloat($(id).value)||0)}))
      .filter(v=>v.L>0.2);
    const H = Math.max(1,parseFloat($("kl-hoyde").value)||0);
    const brutto = +(vegger.reduce((a,v)=>a+v.L*H,0)).toFixed(1);
    const fradrag = Math.min(brutto*0.9, Math.max(0,parseFloat($("kl-fradrag").value)||0));
    const netto = +(brutto-fradrag).toFixed(1);
    const bordB = Math.max(98,parseFloat($("kl-bordbredde").value)||148);
    const svinn = parseInt($("kl-svinn").value,10)/100;
    const type = TYPER[st.ktype];
    const lmPerM2 = +(type.lmPerM2(bordB)).toFixed(2);
    const kledningLm = Math.ceil(netto*lmPerM2*(1+svinn));
    const bordAntall = Math.ceil(kledningLm/H);            // ca — stående bord à vegghøyde
    const sumL = +(vegger.reduce((a,v)=>a+v.L,0)).toFixed(1);
    /* Lekting: stående kledning = sløyfer (vertikalt) + lekter (horisontalt); liggende = kun stående lekter */
    let sloyfeLm=0, lekterLm=0;
    if (type.staaende){
      sloyfeLm = Math.ceil(vegger.reduce((a,v)=>a+(Math.ceil(v.L/CC_LEKT)+1)*H,0));
      lekterLm = Math.ceil(vegger.reduce((a,v)=>a+(Math.ceil(H/CC_LEKT)+1)*v.L,0));
    } else {
      lekterLm = Math.ceil(vegger.reduce((a,v)=>a+(Math.ceil(v.L/CC_LEKT)+1)*H,0));
    }
    const spiker = Math.ceil(kledningLm*type.spikerPerLm);
    const spikerPk = Math.ceil(spiker/SPIKER_PK);
    const museband = $("kl-museband").checked ? Math.ceil(sumL*1.05) : 0;
    const hjorner = Math.max(0,parseInt($("kl-hjorner").value,10)||0);
    const hjornebordLm = Math.ceil(hjorner*2*H);
    return {vegger,H,brutto,fradrag,netto,bordB,svinn,type,lmPerM2,kledningLm,bordAntall,
            sumL,sloyfeLm,lekterLm,spiker,spikerPk,museband,hjorner,hjornebordLm};
  }

  function render(){
    const r = beregn();
    if (!r.vegger.length){
      $("kl-dimSteps").innerHTML = `<div class="alert">Angi minst én vegglengde over 0,2 m.</div>`;
      $("kl-planSvg").innerHTML=""; $("kl-stats").innerHTML="";
      $("kl-matTable").querySelector("tbody").innerHTML=""; $("kl-notes").innerHTML="";
      KL.products = []; liste=""; return;
    }

    $("kl-regelsjekk").innerHTML =
      `<div class="alert ok"><b>Lufting:</b> minst 23 mm luftespalte bak kledningen — sløyfene/lektene gir dette. Åpent i bunn og topp.</div>`
      + ($("kl-museband").checked ? `` :
        `<div class="alert warn" style="margin-top:.5rem"><b>Uten musebånd:</b> luftespalten er en åpen inngang for mus — gnagersikring anbefales sterkt.</div>`);

    const dekkTekst = st.ktype==="tommermann"
      ? `par à 2 bord med ${OVERLAPP} mm overlapp per side`
      : `dekkbredde ${r.bordB-FALS} mm per bord (fals ${FALS} mm)`;
    const steps=[
      {t:`Veggareal ${r.vegger.map(v=>`${fm1(v.L)} × ${fm1(r.H)}`).join(" + ")} = ${fm1(r.brutto)} m² − ${fm1(r.fradrag)} m² åpninger → <b>${fm1(r.netto)} m²</b>`,
       s:`Trekk kun store åpninger (vinduer/dører) — små åpninger dekkes av svinnet`},
      {t:`${r.type.navn} med ${r.bordB} mm bord → <b>${fm1(r.lmPerM2)} lm/m²</b> → ${fm1(r.netto)} m² + ${Math.round(r.svinn*100)} % svinn = <b>${fmt(r.kledningLm)} lm</b> (≈ ${r.bordAntall} bord à ${fm1(r.H)} m)`,
       s:dekkTekst},
      {t:r.type.staaende
        ?`Stående kledning: <b>${fmt(r.sloyfeLm)} lm sløyfer</b> (vertikalt, c/c 60) + <b>${fmt(r.lekterLm)} lm lekter</b> (horisontalt, c/c 60)`
        :`Liggende kledning: <b>${fmt(r.lekterLm)} lm lekter</b> (vertikalt, c/c 60) — gir lufting uten egne sløyfer`,
       s:`Lekter min. 30 × 48 for spiker · maks c/c 60 cm gir stødig spikerfeste`},
      {t:`${fmt(r.spiker)} spiker → <b>${r.spikerPk} pk</b> à 1 kg`,
       s:st.ktype==="tommermann"?`1 spiker per underligger og 2 per overligger per lekt — aldri gjennom begge bord`:`2 spiker per bord per lekt`},
      {t:`${r.museband?`Musebånd <b>${fmt(r.museband)} lm</b> i bunn`:`Musebånd ikke medregnet`}${r.hjornebordLm?` · hjørnebord <b>${fmt(r.hjornebordLm)} lm</b> (${r.hjorner} hjørner à 2 bord)`:``}`,
       s:`Musebåndet lukker luftespalten for gnagere uten å stenge luftingen`},
    ];
    $("kl-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make(r.type.bordId, r.kledningLm, {sourceTool:"kledning",
        note:`≈ ${fm1(r.netto*(1+r.svinn))} m² vegg — ${r.type.navn.toLowerCase()}, inkl. ${Math.round(r.svinn*100)} % svinn`,
        estPrice:P[r.type.bordId]}),
    ];
    if (r.sloyfeLm) rows.push(Catalog.make("sloyfe_23x48", r.sloyfeLm, {sourceTool:"kledning",
        note:`vertikalt c/c 60 cm — festes gjennom vindsperra til stenderne`, estPrice:P.sloyfe_23x48}));
    rows.push(Catalog.make("lekt_30x48", r.lekterLm, {sourceTool:"kledning",
        note:r.type.staaende?`horisontalt c/c 60 cm utenpå sløyfene`:`vertikalt c/c 60 cm — gir både feste og lufting`, estPrice:P.lekt_30x48}));
    rows.push(Catalog.make("kledningsspiker_28x75", r.spikerPk, {sourceTool:"kledning",
        note:`${fmt(r.spiker)} spiker — varmforsinket eller rustfri ved kyst`, estPrice:P.kledningsspiker_28x75}));
    if (r.museband) rows.push(Catalog.make("museband_alu", r.museband, {sourceTool:"kledning",
        note:`monteres i bunn av luftespalten, per vegg`, estPrice:P.museband_alu}));
    if (r.hjornebordLm) rows.push(Catalog.make("kledning_rekt_19x148", r.hjornebordLm, {sourceTool:"kledning",
        note:`hjørnebord — ${r.hjorner} hjørner à 2 bord à ${fm1(r.H)} m`, estPrice:P.kledning_rekt_19x148}));
    rows.push(Catalog.make("konstruksjonsskrue_6x90", 1, {sourceTool:"kledning",
        note:`sløyfer og lekter mot stendere/vegg`, estPrice:P.konstruksjonsskrue_6x90}));

    KL.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("kl-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("kl-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("kl-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.netto)}</b><small>m² vegg</small></div>
      <div class="stat"><b>${fmt(r.kledningLm)}</b><small>lm kledning</small></div>
      <div class="stat"><b>${r.bordAntall}</b><small>bord (ca.)</small></div>
      <div class="stat"><b>${fmt(r.sloyfeLm+r.lekterLm)}</b><small>lm lekter/sløyfer</small></div>
      <div class="stat"><b>${fmt(r.spiker)}</b><small>spiker</small></div>`;

    $("kl-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg profil og behandling (ubehandlet/grunnet/malt) fritt — juster bordbredde og pris, så regnes alt om.`,
      `Kledningen skal slutte 20–30 cm over terreng — sputen nederst kappes med dryppnese (15° skråkutt).`,
      st.ktype==="tommermann"?`Overlapp minst 20 mm per side (her ${OVERLAPP} mm) — og spikre aldri gjennom både over- og underligger.`:``,
      `Skjøt bord over lekt/spikerslag, og forsegl endeved med grunning før montering.`,
      `Gavltrekanter er ikke med i regnestykket — legg til gavlareal som fradrag i minus (øk vegghøyden) eller regn gavlen separat.`,
      `Vindsperre forutsettes å være på plass — den er ikke priset her.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Kledning ${fm1(r.netto)} m² (${r.vegger.map(v=>`${v.navn}=${fm1(v.L)} m`).join(", ")} × ${fm1(r.H)} m)`,
      `${r.type.navn}, ${r.bordB} mm bord → ${fm1(r.lmPerM2)} lm/m² · ${Math.round(r.svinn*100)} % svinn`,
    ]);
  }

  /* Veggoppriss: lengste vegg med bordretning, lekting antydet og musebånd i bunn */
  function tegn(r){
    const v = [...r.vegger].sort((a,b)=>b.L-a.L)[0];
    const W=660,PAD=52,sk=Math.min((W-2*PAD)/v.L,260/r.H);
    const bw=v.L*sk,bh=r.H*sk,Hsvg=bh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Veggoppriss ${r.type.navn}">`;
    s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4"/>`;
    if (r.type.staaende){
      /* lekter bak (horisontale, stiplet) */
      for(let y=y0+CC_LEKT*sk;y<y0+bh;y+=CC_LEKT*sk)
        s+=`<line x1="${x0}" y1="${y}" x2="${x0+bw}" y2="${y}" stroke="#8E979E" stroke-width="2" stroke-dasharray="8 6"/>`;
      /* stående bord */
      const stepX = st.ktype==="tommermann" ? (2*r.bordB-2*OVERLAPP)/1000*sk : (r.bordB-FALS)/1000*sk;
      for(let x=x0+stepX;x<x0+bw;x+=stepX)
        s+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+bh}" stroke="#C9A96A" stroke-width="${st.ktype==="tommermann"?2.5:1.5}"/>`;
    } else {
      /* stående lekter bak (stiplet) */
      for(let x=x0+CC_LEKT*sk;x<x0+bw;x+=CC_LEKT*sk)
        s+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+bh}" stroke="#8E979E" stroke-width="2" stroke-dasharray="8 6"/>`;
      /* liggende bord */
      const stepY=(r.bordB-FALS)/1000*sk;
      for(let y=y0+stepY;y<y0+bh;y+=stepY)
        s+=`<line x1="${x0}" y1="${y}" x2="${x0+bw}" y2="${y}" stroke="#C9A96A" stroke-width="1.5"/>`;
    }
    if (r.museband) s+=`<line x1="${x0}" y1="${y0+bh+3}" x2="${x0+bw}" y2="${y0+bh+3}" stroke="#E85D0F" stroke-width="4"/>`;
    s+=`<text x="${x0+bw/2}" y="${y0+bh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Vegg ${v.navn}: ${fm1(v.L)} m · ${r.type.navn}</text>
        <text x="${x0-30}" y="${y0+bh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+bh/2})">${fm1(r.H)} m</text></svg>`;
    $("kl-planSvg").innerHTML=s;
  }

  function init(){
    ["kl-veggA","kl-veggB","kl-veggC","kl-hoyde","kl-fradrag","kl-bordbredde","kl-hjorner","kl-svinn","kl-museband"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-kledning [data-ktype]").forEach(b=>b.addEventListener("click",()=>{
      st.ktype=b.dataset.ktype;
      document.querySelectorAll("#view-kledning [data-ktype]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("kl-copyBtn").addEventListener("click",()=>copy(liste,$("kl-copyStatus")));
    $("kl-priserBtn").addEventListener("click",()=>PriceModal.open(KL.products, "Kledning"));
    $("kl-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("kledning","Kledning",readForm("kledning"),KL.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= LEVEGG ========================= */
const LV = (()=>{
  /* SAK10 §4-1: søknadsfri levegg inntil 1,8 m høyde — maks 10 m lengde med ≥1,0 m til
     nabogrense, eller maks 5 m helt inntil grensen. Gjelder ikke flere levegger i kombinasjon. */
  const NEDSTOPING = 0.9;                     // stolpe under terreng, m
  const UTFORMING = {
    tett:    {navn:"Tett vegg",           ccBord:b=>(b-10)/1000,     sider:1},   // 10 mm omlegg/klaring
    tosidig: {navn:"Tosidig forskjøvet",  ccBord:b=>(b*1.5)/1000,    sider:2},   // gap = halv bordbredde per side
    spile:   {navn:"Spilevegg",           ccBord:b=>(b+30)/1000,     sider:1},   // 30 mm åpning
  };
  const st = {utforming:"tett", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("lv-lengde").value)||0), H=Math.max(0.5,parseFloat($("lv-hoyde").value)||0);
    const avstand=Math.max(0,parseFloat($("lv-avstand").value)||0);
    const bordB=Math.max(70,parseFloat($("lv-bordbredde").value)||120);
    const vind=$("lv-vind").checked, medToppbord=$("lv-toppbord").checked;
    const u=UTFORMING[st.utforming];
    const cc=vind?1.2:1.5;
    const stolper=Math.ceil(L/cc)+1, stolpeL=+(H+NEDSTOPING).toFixed(2), stolpeLm=+(stolper*stolpeL).toFixed(1);
    const losholtRader=H<=1.2?2:3, losholtLm=Math.ceil(losholtRader*L*1.05);
    const ccBord=u.ccBord(bordB);
    const bordAntall=Math.ceil(L/ccBord)*u.sider;
    const bordLm=Math.ceil(bordAntall*H*1.05);
    const skruer=bordAntall*losholtRader*2, skruerPk=Math.ceil(skruer/250);
    const toppbordLm=medToppbord?Math.ceil(L*1.05):0;
    /* Regelstatus (SAK10 §4-1) */
    let regel;
    if (H>1.8)            regel={ok:false, tekst:`Høyde over 1,8 m er normalt <b>søknadspliktig</b> — sjekk med kommunen før du bygger.`};
    else if (L<=5)        regel={ok:true,  tekst:`<b>Søknadsfri:</b> inntil 1,8 m høy og 5 m lang kan leveggen stå helt inntil nabogrensen.`};
    else if (L<=10)       regel=avstand>=1
      ? {ok:true,  tekst:`<b>Søknadsfri:</b> inntil 1,8 m høy og 10 m lang med minst 1,0 m til nabogrense.`}
      : {ok:false, tekst:`Lengde 5–10 m krever <b>minst 1,0 m avstand</b> til nabogrense (du har oppgitt ${fm1(avstand)} m) — flytt veggen eller søk.`};
    else                  regel={ok:false, tekst:`Lengde over 10 m er normalt <b>søknadspliktig</b> — sjekk med kommunen.`};
    return {L,H,avstand,bordB,vind,medToppbord,u,cc,stolper,stolpeL,stolpeLm,losholtRader,losholtLm,
            ccBord,bordAntall,bordLm,skruer,skruerPk,toppbordLm,regel};
  }

  function render(){
    const r=beregn();

    $("lv-regelsjekk").innerHTML =
      `<div class="alert ${r.regel.ok?"ok":"warn"}">${r.regel.tekst}<span style="display:block;font-size:.75rem;margin-top:.25rem">Byggesaksforskriften §4-1 · unntaket gjelder ikke flere levegger i kombinasjon · arealplanen gjelder uansett</span></div>`
      + (r.vind?`<div class="alert" style="margin-top:.5rem"><b>Vindutsatt:</b> stolper c/c 1,2 m og frostfritt støpt punktfundament — jordspyd frarådes.</div>`:``);

    const steps=[
      {t:`Mål ${fm1(r.L)} × ${fm1(r.H)} m, ${fm1(r.avstand)} m til nabogrense → ${r.regel.ok?`<b>søknadsfri</b>`:`<b>krever tiltak</b> (se regelsjekken)`}`,
       s:`SAK10 §4-1 e): maks 1,8 m høyde · maks 10 m med ≥1 m til grense · maks 5 m inntil grense`},
      {t:`Stolper 98 × 98 c/c ${fm1(r.cc)} m → <b>${r.stolper} stolper</b> à ${fm1(r.stolpeL)} m`,
       s:`${Math.round(NEDSTOPING*100)} cm under terreng — leveggen tar mye vind og må stå støtt${r.vind?" · vindutsatt: c/c 1,2 m":""}`},
      {t:`${r.losholtRader} rader losholt 48 × 98 à ${fm1(r.L)} m → <b>${fmt(r.losholtLm)} lm</b>`,
       s:`${r.H<=1.2?"2 rader holder under 1,2 m høyde":"3 rader (topp, midt, bunn) fra 1,2 m høyde"}`},
      {t:`${r.u.navn}: bord c/c ${Math.round(r.ccBord*1000)} mm${r.u.sider>1?" per side, 2 sider":""} → <b>${r.bordAntall} bord</b> à ${fm1(r.H)} m = ${fmt(r.bordLm)} lm`,
       s:st.utforming==="tett"?`10 mm omlegg — tett le, men full vindlast på konstruksjonen`
        :st.utforming==="tosidig"?`gap på halv bordbredde per side, forskjøvet — le-effekt med redusert vindlast`
        :`30 mm åpning mellom spilene — lettest konstruksjon, delvis le`},
      {t:`${fmt(r.skruer)} skruer → <b>${r.skruerPk} pk</b>${r.toppbordLm?` · toppbord <b>${fmt(r.toppbordLm)} lm</b>`:``}`,
       s:`2 skruer per bord per losholt`},
    ];
    $("lv-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make("stolpe_98x98_imp", r.stolpeLm, {sourceTool:"levegg",
        note:`${r.stolper} stk à ${fm1(r.stolpeL)} m — ${Math.round(NEDSTOPING*100)} cm under terreng`, estPrice:P.stolpe_98x98_imp}),
      Catalog.make("losholt_48x98", r.losholtLm, {sourceTool:"levegg",
        note:`${r.losholtRader} rader à ${fm1(r.L)} m, inkl. 5 % kapp — skjøt over stolpe`, estPrice:P.losholt_48x98}),
      Catalog.make("levegg_bord_19", r.bordLm, {sourceTool:"levegg",
        note:`${r.bordAntall} bord à ${fm1(r.H)} m, bredde ${r.bordB} mm — ${r.u.navn.toLowerCase()}`, estPrice:P.levegg_bord_19}),
      Catalog.make("treskrue_42x55_a4", r.skruerPk, {sourceTool:"levegg",
        note:`${fmt(r.skruer)} skruer — 2 per bord per losholt`, estPrice:P.treskrue_42x55_a4}),
      Catalog.make("konstruksjonsskrue_6x90", 1, {sourceTool:"levegg",
        note:`losholter mot stolper`, estPrice:P.konstruksjonsskrue_6x90}),
    ];
    if (r.toppbordLm) rows.push(Catalog.make("rekkverk_toppbord_28x120_imp", r.toppbordLm, {sourceTool:"levegg",
        note:`legges flatt over stolper og bord, skjøt over stolpe`, estPrice:P.rekkverk_toppbord_28x120_imp}));
    if (!r.vind) rows.push(Catalog.make("jordspyd_98", r.stolper, {sourceTool:"levegg",
        note:`én per stolpe — alt.: frostfritt støpt punktfundament (anbefalt ved vindutsatt)`, estPrice:P.jordspyd_98}));

    LV.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("lv-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("lv-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("lv-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.L*r.H)}</b><small>m² vegg</small></div>
      <div class="stat"><b>${r.stolper}</b><small>stolper</small></div>
      <div class="stat"><b>${r.bordAntall}</b><small>bord</small></div>
      <div class="stat"><b>${fmt(r.bordLm)}</b><small>lm bord</small></div>
      <div class="stat"><b>${fmt(r.skruer)}</b><small>skruer</small></div>`;

    $("lv-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg bordtype og behandling fritt — juster bordbredde og pris, så regnes alt om.`,
      `Stolpene er leveggens svake punkt: ${Math.round(NEDSTOPING*100)} cm ned i komprimert pukk eller støp — aldri bare gravd ned i jord.`,
      st.utforming==="tett"?`Tett vegg tar full vindlast — vurder tosidig forskjøvet i vindutsatte strøk: nesten like god le, mye mindre belastning.`:``,
      `Hold bordene 5–10 cm over terreng så endeveden ikke trekker fukt.`,
      `Unntaket fra søknadsplikt gjelder én levegg — flere levegger i kombinasjon må vurderes samlet av kommunen.`,
      `Snakk med naboen før du bygger i eller nær grensen — det er både hyggelig og konfliktdempende.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Levegg ${fm1(r.L)} × ${fm1(r.H)} m (${r.u.navn.toLowerCase()})`,
      `${r.stolper} stolper c/c ${fm1(r.cc)} m · ${r.losholtRader} rader losholt · ${r.regel.ok?"søknadsfri":"OBS: se regelsjekk"}`,
    ]);
  }

  /* Veggoppriss: stolper, losholter, bord etter utforming, toppbord */
  function tegn(r){
    const W=660,PAD=52,sk=Math.min((W-2*PAD)/r.L,240/r.H);
    const bw=r.L*sk,bh=r.H*sk,Hsvg=bh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Levegg ${r.u.navn}: ${r.stolper} stolper, ${r.bordAntall} bord">`;
    /* terreng */
    s+=`<line x1="${x0-20}" y1="${y0+bh}" x2="${x0+bw+20}" y2="${y0+bh}" stroke="#8E979E" stroke-width="2"/>`;
    /* losholter bak (stiplet) */
    const raderY = r.losholtRader===2 ? [0.15,0.85] : [0.12,0.5,0.88];
    raderY.forEach(f=>{ const y=y0+bh*f;
      s+=`<line x1="${x0}" y1="${y}" x2="${x0+bw}" y2="${y}" stroke="#1C2A33" stroke-width="3" stroke-dasharray="10 6"/>`; });
    /* bord */
    const ccPx=r.ccBord*sk, bordPx=Math.max(r.bordB/1000*sk,2);
    if (st.utforming==="tosidig"){
      for(let x=x0;x<x0+bw-1;x+=ccPx){
        s+=`<rect x="${x}" y="${y0}" width="${Math.min(bordPx,x0+bw-x)}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4" stroke-width=".5"/>`;
        const x2=x+ccPx/2;
        if(x2<x0+bw-1) s+=`<rect x="${x2}" y="${y0}" width="${Math.min(bordPx,x0+bw-x2)}" height="${bh}" fill="#D6C49A" stroke="#C9CFD4" stroke-width=".5"/>`;
      }
    } else {
      for(let x=x0;x<x0+bw-1;x+=ccPx)
        s+=`<rect x="${x}" y="${y0}" width="${Math.min(bordPx,x0+bw-x)}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4" stroke-width=".5"/>`;
    }
    /* stolper */
    for(let i=0;i<r.stolper;i++){
      const x=x0+Math.min(i*r.cc,r.L)*sk;
      s+=`<rect x="${x-4}" y="${y0-4}" width="8" height="${bh+14}" fill="#8E979E" rx="2"/>`;
    }
    /* toppbord */
    if (r.medToppbord) s+=`<rect x="${x0-8}" y="${y0-10}" width="${bw+16}" height="7" fill="#E85D0F" rx="2"/>`;
    s+=`<text x="${x0+bw/2}" y="${y0+bh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.L)} m · ${r.stolper} stolper c/c ${fm1(r.cc)} m · ${r.u.navn}</text>
        <text x="${x0-30}" y="${y0+bh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+bh/2})">${fm1(r.H)} m</text></svg>`;
    $("lv-planSvg").innerHTML=s;
  }

  function init(){
    ["lv-lengde","lv-hoyde","lv-avstand","lv-bordbredde","lv-vind","lv-toppbord"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-levegg [data-utforming]").forEach(b=>b.addEventListener("click",()=>{
      st.utforming=b.dataset.utforming;
      document.querySelectorAll("#view-levegg [data-utforming]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("lv-copyBtn").addEventListener("click",()=>copy(liste,$("lv-copyStatus")));
    $("lv-priserBtn").addEventListener("click",()=>PriceModal.open(LV.products, "Levegg"));
    $("lv-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("levegg","Levegg",readForm("levegg"),LV.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= PERGOLA ========================= */
const PG = (()=>{
  /* SAK10 §4-1: frittstående byggverk inntil 50 m² / tilbygg inntil 15 m² er normalt
     unntatt søknadsplikt. Åpen pergola uten tak regnes vanligvis ikke som bygning —
     med tett tak teller den som bebygd areal (BYA) og kan kreve søknad. */
  const UTSTIKK = 0.3, CC_SPERRE = 0.6, STOLPE_MARGIN = 0.1;
  /* Veiledende maks stolpeavstand per bjelkedimensjon (doble bjelker, lett last) */
  const FELT = {kvirke_48x148_c24:{dim:"48 × 148", maks:3.0}, kvirke_48x198_c24:{dim:"48 × 198", maks:4.0}};
  const st = {ptype:"fritt", tak:"aapen", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(1.5,parseFloat($("pg-lengde").value)||0), B=Math.max(1.5,parseFloat($("pg-bredde").value)||0);
    const H=Math.max(1.9,parseFloat($("pg-hoyde").value)||0);
    const vind=$("pg-vind").checked, vegg=st.ptype==="vegg", tak=st.tak==="tak";
    const areal=+(L*B).toFixed(1);
    /* Auto bjelkedimensjon: minst virke som ikke gir flere stolper enn nødvendig */
    const f=vind?0.8:1.0;
    const perRad148=Math.ceil(L/(FELT.kvirke_48x148_c24.maks*f))+1;
    const perRad198=Math.ceil(L/(FELT.kvirke_48x198_c24.maks*f))+1;
    const bjelkeId=perRad198<perRad148?"kvirke_48x198_c24":"kvirke_48x148_c24";
    const perRad=Math.min(perRad148,perRad198);
    const feltSpenn=+(L/(perRad-1)).toFixed(2);
    const rader=vegg?1:2;
    const stolper=rader*perRad, stolpeL=+(H+STOLPE_MARGIN).toFixed(2);
    const bjelkeLstk=+(L+2*UTSTIKK).toFixed(1);
    const bjelkeLm=Math.ceil(rader*2*bjelkeLstk);                 // doble bjelker per rad
    const vegglektLm=vegg?Math.ceil(L):0;
    /* Sperrer på tvers, c/c 60, med utstikk */
    const sperrer=Math.floor(L/CC_SPERRE)+1;
    const sperreId=B<=3.7?"kvirke_48x148_c24":"kvirke_48x198_c24";
    const sperreLstk=+(B+(vegg?UTSTIKK:2*UTSTIKK)).toFixed(1);    // ved vegg: utstikk kun ut fra bjelken
    const sperreLm=Math.ceil(sperrer*sperreLstk);
    const skrabaandLm=Math.ceil(stolper*2*0.7);                    // 2 per stolpe à ~70 cm (45°)
    const bolter=stolper*4;                                        // doble bjelker klemmer stolpen
    const sperreSkruer=sperrer*2*2;                                // 2 fester à 2 skruer
    const skruePk=Math.ceil(sperreSkruer/100);
    /* Regelstatus */
    let regel;
    if (vegg) regel = areal<=15
      ? {ok:true,  tekst:`<b>Normalt søknadsfri:</b> tilbygg inntil 15 m² (her ${fm1(areal)} m²).`}
      : {ok:false, tekst:`Tilbygg over 15 m² (her ${fm1(areal)} m²) er normalt <b>søknadspliktig</b>.`};
    else regel = areal<=50
      ? {ok:true,  tekst:`<b>Normalt søknadsfri:</b> frittstående inntil 50 m² (her ${fm1(areal)} m²). Hold minst 1,0 m til nabogrensen.`}
      : {ok:false, tekst:`Frittstående over 50 m² (her ${fm1(areal)} m²) er <b>søknadspliktig</b>.`};
    return {L,B,H,areal,vind,vegg,tak,bjelkeId,perRad,feltSpenn,rader,stolper,stolpeL,
            bjelkeLstk,bjelkeLm,vegglektLm,sperrer,sperreId,sperreLstk,sperreLm,
            skrabaandLm,bolter,sperreSkruer,skruePk,regel};
  }

  function render(){
    const r=beregn();

    $("pg-regelsjekk").innerHTML =
      `<div class="alert ${r.regel.ok?"ok":"warn"}">${r.regel.tekst}<span style="display:block;font-size:.75rem;margin-top:.25rem">Åpen pergola uten tak regnes normalt ikke som bygning · arealplan og byggegrenser gjelder uansett</span></div>`
      + (r.tak?`<div class="alert warn" style="margin-top:.5rem"><b>Forberedt for tak:</b> med tett tak (plater/lameller) teller pergolaen som bebygd areal og kan kreve søknad — sjekk utnyttelsesgraden og kommunen. Husk også snølast på taket.</div>`:``)
      + (r.vind?`<div class="alert" style="margin-top:.5rem"><b>Vindutsatt:</b> kortere spenn er lagt inn — bruk frostfritt støpt fundament, ikke jordspyd.</div>`:``);

    const steps=[
      {t:`${r.vegg?"Tilbygg":"Frittstående"} ${fm1(r.L)} × ${fm1(r.B)} m = <b>${fm1(r.areal)} m²</b> → ${r.regel.ok?`<b>normalt søknadsfri</b>`:`<b>søknadspliktig</b>`}`,
       s:`SAK10 §4-1: frittstående ≤ 50 m² · tilbygg ≤ 15 m² · tett tak teller som BYA`},
      {t:`Bærebjelke <b>${FELT[r.bjelkeId].dim} C24</b> (valgt automatisk) → stolpeavstand maks ${fm1(FELT[r.bjelkeId].maks*(r.vind?0.8:1))} m → <b>${r.perRad} stolper per rad</b> (faktisk spenn ${fm1(r.feltSpenn)} m)`,
       s:`Minste dimensjon som ikke koster ekstra stolper${r.vind?" · vindutsatt: spenn × 0,8":""}`},
      {t:`<b>Doble bærebjelker:</b> ${r.rader*2} stk à ${fm1(r.bjelkeLstk)} m (${UTSTIKK*100} cm utstikk per ende) = ${fmt(r.bjelkeLm)} lm${r.vegg?` · vegglekte ${fmt(r.vegglektLm)} lm boltet i husveggen`:``}`,
       s:`Én bjelke på hver side av stolpen, boltet gjennom med M10`},
      {t:`<b>${r.sperrer} sperrer</b> ${FELT[r.sperreId].dim} c/c ${CC_SPERRE*100} cm à ${fm1(r.sperreLstk)} m = ${fmt(r.sperreLm)} lm`,
       s:`Spenn ${fm1(r.B)} m${r.B>3.7?" — over 3,7 m: 48 × 198 valgt":" — 48 × 148 holder"} · utstikket gir det klassiske pergola-uttrykket, endene kan skråkappes`},
      {t:`Avstivning: <b>${fmt(r.skrabaandLm)} lm skråbånd</b> 48 × 98 (2 per stolpe) · ${r.stolper} stolpesko · ${r.bolter} bolter`,
       s:`Uten skråbånd blir en åpen pergola ustabil sideveis — aldri hopp over dette`},
    ];
    $("pg-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make("stolpe_98x98_imp", +(r.stolper*r.stolpeL).toFixed(1), {sourceTool:"pergola",
        note:`${r.stolper} stk à ${fm1(r.stolpeL)} m — på justerbar stolpesko over fundament`, estPrice:P.stolpe_98x98_imp}),
      Catalog.make(r.bjelkeId, r.bjelkeLm+r.vegglektLm, {sourceTool:"pergola",
        note:`${r.rader*2} bærebjelker à ${fm1(r.bjelkeLstk)} m (doble)${r.vegg?` + vegglekte à ${fm1(r.L)} m`:``}`, estPrice:P[r.bjelkeId]}),
    ];
    if (r.sperreId!==r.bjelkeId) rows.push(Catalog.make(r.sperreId, r.sperreLm, {sourceTool:"pergola",
        note:`${r.sperrer} sperrer à ${fm1(r.sperreLstk)} m, c/c ${CC_SPERRE*100} cm`, estPrice:P[r.sperreId]}));
    else rows[1]=Catalog.make(r.bjelkeId, r.bjelkeLm+r.vegglektLm+r.sperreLm, {sourceTool:"pergola",
        note:`${r.rader*2} bærebjelker à ${fm1(r.bjelkeLstk)} m (doble)${r.vegg?` + vegglekte`:``} + ${r.sperrer} sperrer à ${fm1(r.sperreLstk)} m`, estPrice:P[r.bjelkeId]});
    rows.push(Catalog.make("kvirke_48x98_c24", r.skrabaandLm, {sourceTool:"pergola",
        note:`skråbånd — 2 per stolpe à ca. 70 cm, 45°`, estPrice:P.kvirke_48x98_c24}));
    rows.push(Catalog.make("stolpesko_98", r.stolper, {sourceTool:"pergola",
        note:`én per stolpe — på frostfritt støpt eller ferdigstøpt fundament`, estPrice:P.stolpesko_98}));
    rows.push(Catalog.make("bolt_m10", r.bolter, {sourceTool:"pergola",
        note:`4 per stolpe — doble bjelker klemmer stolpetoppen`, estPrice:P.bolt_m10}));
    rows.push(Catalog.make("konstruksjonsskrue_6x90", r.skruePk, {sourceTool:"pergola",
        note:`${fmt(r.sperreSkruer)} skruer — sperrer skråskrus i bjelkene`, estPrice:P.konstruksjonsskrue_6x90}));

    PG.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("pg-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("pg-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("pg-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.areal)}</b><small>m² pergola</small></div>
      <div class="stat"><b>${r.stolper}</b><small>stolper</small></div>
      <div class="stat"><b>${r.sperrer}</b><small>sperrer</small></div>
      <div class="stat"><b>${FELT[r.bjelkeId].dim}</b><small>bærebjelke</small></div>
      <div class="stat"><b>${fmt(r.bjelkeLm+r.vegglektLm+r.sperreLm+r.skrabaandLm)}</b><small>lm virke</small></div>`;

    $("pg-notes").innerHTML=[
      `Fundament er ikke priset: frostfritt støpt punkt eller ferdigstøpt blokk under hver stolpesko.`,
      `Skråkapp sperreendene (f.eks. 30°) for det klassiske pergola-uttrykket — kappes før montering.`,
      r.tak?`Til taket: bruk DryppStop-verktøyet for plater og skruer — sperreavstanden her (c/c 60) passer platene direkte.`:`Åpen pergola kan senere få tak — men da endres både søknadsstatus og snølastkrav.`,
      `Klatreplanter holder fukt mot treverket — bruk impregnert virke og hold planter unna endeved.`,
      `Sjekk kommunens arealplan og byggegrenser før du setter i gang, selv når tiltaket er søknadsfritt.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Pergola ${fm1(r.L)} × ${fm1(r.B)} m (${r.vegg?"inntil vegg":"frittstående"}${r.tak?", forberedt for tak":""})`,
      `Bærebjelke ${FELT[r.bjelkeId].dim} · ${r.stolper} stolper · ${r.sperrer} sperrer c/c ${CC_SPERRE*100} cm · ${r.regel.ok?"normalt søknadsfri":"OBS: se regelsjekk"}`,
    ]);
  }

  /* Plan ovenfra: bjelkelinjer langs L, sperrer på tvers med utstikk */
  function tegn(r){
    const W=660,PAD=52;
    const totB=r.B+(r.vegg?UTSTIKK:2*UTSTIKK);
    const sk=Math.min((W-2*PAD)/(r.L+2*UTSTIKK),300/totB);
    const bw=r.L*sk,x0=(W-(r.L+2*UTSTIKK)*sk)/2+UTSTIKK*sk,y0=PAD;
    const yTopp=r.vegg?y0:y0+UTSTIKK*sk;                  // øvre bjelkelinje/vegg
    const yBunn=yTopp+r.B*sk;                             // nedre bjelkelinje
    const hSvg=yBunn+(r.vegg?UTSTIKK:UTSTIKK)*sk+PAD+14;
    let s=`<svg viewBox="0 0 ${W} ${hSvg}" role="img" aria-label="Pergolaplan: ${r.stolper} stolper, ${r.sperrer} sperrer">`;
    /* sperrer (vertikale, med utstikk) */
    const sperreY1=r.vegg?yTopp:yTopp-UTSTIKK*sk, sperreY2=yBunn+UTSTIKK*sk;
    for(let i=0;i<r.sperrer;i++){
      const x=x0+Math.min(i*CC_SPERRE,r.L)*sk;
      s+=`<line x1="${x}" y1="${sperreY1}" x2="${x}" y2="${sperreY2}" stroke="#E6D9B8" stroke-width="4"/>`;
    }
    /* bjelkelinjer (doble, med utstikk) */
    const bx1=x0-UTSTIKK*sk, bx2=x0+bw+UTSTIKK*sk;
    const linjer=r.vegg?[yBunn]:[yTopp,yBunn];
    linjer.forEach(y=>{
      s+=`<line x1="${bx1}" y1="${y-3}" x2="${bx2}" y2="${y-3}" stroke="#E85D0F" stroke-width="4"/>
          <line x1="${bx1}" y1="${y+3}" x2="${bx2}" y2="${y+3}" stroke="#E85D0F" stroke-width="4"/>`;
      for(let p=0;p<r.perRad;p++){
        const x=x0+Math.min(p*r.feltSpenn,r.L)*sk;
        s+=`<rect x="${x-6}" y="${y-6}" width="12" height="12" fill="#1C2A33" rx="2"/>`;
      }
    });
    /* vegg ved tilbygg */
    if (r.vegg) s+=`<rect x="${bx1-8}" y="${yTopp-12}" width="${bx2-bx1+16}" height="9" fill="#8E979E"/>
        <text x="${bx1-8}" y="${yTopp-18}" font-size="11" fill="#4A5A64" font-family="Inter,sans-serif">Husvegg (vegglekte)</text>`;
    s+=`<text x="${x0+bw/2}" y="${sperreY2+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.L)} m · ${r.sperrer} sperrer c/c ${CC_SPERRE*100} cm</text>
        <text x="${bx1-24}" y="${(yTopp+yBunn)/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${bx1-24} ${(yTopp+yBunn)/2})">${fm1(r.B)} m · spenn</text></svg>`;
    $("pg-planSvg").innerHTML=s;
  }

  function init(){
    ["pg-lengde","pg-bredde","pg-hoyde","pg-vind"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-pergola [data-ptype]").forEach(b=>b.addEventListener("click",()=>{
      st.ptype=b.dataset.ptype;
      document.querySelectorAll("#view-pergola [data-ptype]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-pergola [data-tak]").forEach(b=>b.addEventListener("click",()=>{
      st.tak=b.dataset.tak;
      document.querySelectorAll("#view-pergola [data-tak]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("pg-copyBtn").addEventListener("click",()=>copy(liste,$("pg-copyStatus")));
    $("pg-priserBtn").addEventListener("click",()=>PriceModal.open(PG.products, "Pergola"));
    $("pg-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("pergola","Pergola",readForm("pergola"),PG.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= MALING UTVENDIG ========================= */
const ML = (()=>{
  /* Typiske dekkevner per strøk (leverandørtall): dekkende maling 8-10 m²/l,
     oljedekkbeis ~7, transparent beis 5-8 (suger mer). Grunning ~9 m²/l, ett strøk. */
  const BEHANDLING = {
    maling:   {navn:"Dekkende maling",   id:"utemaling_dekkende", dekkevne:9},
    dekkbeis: {navn:"Oljedekkbeis",      id:"oljedekkbeis",       dekkevne:7},
    beis:     {navn:"Transparent beis",  id:"beis_transparent",   dekkevne:6},
  };
  const GRUNNING_DEKKEVNE = 9, VASK_M2_PER_FLASKE = 75;
  const st = {behandling:"maling", underlag:"behandlet", priser:{}};
  let liste = "";

  /* Fordel liter på vanlige spannstørrelser (10 L + 3 L) */
  function spann(liter){
    let n10=Math.floor(liter/10), rest=liter-n10*10, n3=0;
    if (rest>0){ if (rest<=3) n3=1; else n10+=1; }
    return {n10, n3, tekst:[n10?`${n10} × 10 L`:null, n3?`${n3} × 3 L`:null].filter(Boolean).join(" + ")||"1 × 3 L"};
  }

  function beregn(){
    const vegger = ["ml-veggA","ml-veggB","ml-veggC"]
      .map((id,i)=>({navn:"ABC"[i], L:Math.max(0,parseFloat($(id).value)||0)}))
      .filter(v=>v.L>0.2);
    const H = Math.max(1,parseFloat($("ml-hoyde").value)||0);
    const brutto = +(vegger.reduce((a,v)=>a+v.L*H,0)).toFixed(1);
    const fradrag = Math.min(brutto*0.9, Math.max(0,parseFloat($("ml-fradrag").value)||0));
    const netto = +(brutto-fradrag).toFixed(1);
    const strok = parseInt($("ml-strok").value,10);
    const dekkevne = Math.max(2,parseFloat($("ml-dekkevne").value)||9);
    const b = BEHANDLING[st.behandling];
    const ubehandlet = st.underlag==="ubehandlet";
    const malingL = Math.ceil(netto/dekkevne*strok);
    const malingSpann = spann(malingL);
    const grunningL = ubehandlet ? Math.ceil(netto/GRUNNING_DEKKEVNE) : 0;
    const grunningSpann = spann(grunningL);
    const vask = Math.max(1,Math.ceil(netto/VASK_M2_PER_FLASKE));
    return {vegger,H,brutto,fradrag,netto,strok,dekkevne,b,ubehandlet,malingL,malingSpann,
            grunningL,grunningSpann,vask};
  }

  function render(){
    const r = beregn();
    if (!r.vegger.length){
      $("ml-dimSteps").innerHTML = `<div class="alert">Angi minst én vegglengde over 0,2 m.</div>`;
      $("ml-planSvg").innerHTML=""; $("ml-stats").innerHTML="";
      $("ml-matTable").querySelector("tbody").innerHTML=""; $("ml-notes").innerHTML="";
      ML.products = []; liste=""; return;
    }

    $("ml-regelsjekk").innerHTML =
      `<div class="alert ok"><b>Værvindu:</b> mal ved 10–25 °C på tørt treverk, aldri under +5 °C (husk natt-temperaturen) og ikke i direkte sol.</div>`
      + (r.ubehandlet ? `<div class="alert" style="margin-top:.5rem"><b>Ubehandlet treverk:</b> grunn innen 4 uker etter montering — ubehandlet kledning gråner og trekker vann.</div>` : ``)
      + (st.behandling==="beis" && !r.ubehandlet ? `<div class="alert warn" style="margin-top:.5rem"><b>Beis over gammel behandling:</b> transparent beis kan ikke legges over dekkende maling/beis — da må du velge dekkende, eller fjerne gammel behandling.</div>` : ``);

    const steps=[
      {t:`Veggareal ${r.vegger.map(v=>`${fm1(v.L)} × ${fm1(r.H)}`).join(" + ")} = ${fm1(r.brutto)} m² − ${fm1(r.fradrag)} m² åpninger → <b>${fm1(r.netto)} m²</b>`,
       s:`Trekk kun store åpninger — karmer og gerikter skal ofte også behandles`},
      {t:`${r.b.navn}: ${fm1(r.netto)} m² ÷ ${String(r.dekkevne).replace(".",",")} m²/l × ${r.strok} strøk → <b>${r.malingL} liter</b> (${r.malingSpann.tekst})`,
       s:`Dekkevnen står på spannet — juster feltet når du har valgt produkt`},
      ...(r.ubehandlet?[
      {t:`Grunning: ${fm1(r.netto)} m² ÷ ${GRUNNING_DEKKEVNE} m²/l → <b>${r.grunningL} liter</b> (${r.grunningSpann.tekst}), ett strøk`,
       s:`Grunningsolje metter sugende treverk og gir toppstrøkene feste`}]:[]),
      {t:`Husvask: <b>${r.vask} flaske(r)</b> konsentrat — alltid vask før behandling`,
       s:`Ca. én flaske per ${VASK_M2_PER_FLASKE} m² · skyll godt og la veggen tørke helt`},
      {t:`Tørketid mellom strøkene — sjekk spannet (typisk 12–24 timer)`,
       s:`Mal på formiddagen så veggen rekker å tørke før duggfallet`},
    ];
    $("ml-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make(r.b.id, r.malingL, {sourceTool:"utemaling",
        note:`${r.strok} strøk på ${fm1(r.netto)} m² — kjøp ${r.malingSpann.tekst}`, estPrice:P[r.b.id]}),
    ];
    if (r.grunningL) rows.push(Catalog.make("grunningsolje", r.grunningL, {sourceTool:"utemaling",
        note:`ett strøk på ubehandlet treverk — kjøp ${r.grunningSpann.tekst}`, estPrice:P.grunningsolje}));
    rows.push(Catalog.make("husvask_konsentrat", r.vask, {sourceTool:"utemaling",
        note:`vask, skyll og la tørke før behandling`, estPrice:P.husvask_konsentrat}));
    rows.push(Catalog.make("malerutstyr_sett", 1, {sourceTool:"utemaling",
        note:`ruller til flaten, pensel til detaljer og endeved`, estPrice:P.malerutstyr_sett}));

    ML.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("ml-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("ml-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("ml-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.netto)}</b><small>m² vegg</small></div>
      <div class="stat"><b>${r.malingL}</b><small>liter ${st.behandling==="maling"?"maling":"beis"}</small></div>
      <div class="stat"><b>${r.malingSpann.n10+r.malingSpann.n3}</b><small>spann</small></div>
      <div class="stat"><b>${r.strok}</b><small>strøk</small></div>
      ${r.grunningL?`<div class="stat"><b>${r.grunningL}</b><small>liter grunning</small></div>`:``}`;

    $("ml-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg merke og kvalitet fritt — juster dekkevnen til tallet på spannet, så regnes literne om.`,
      `Bland spannene (fargebland) hvis de har ulike produksjonsnummer — unngår fargeforskjell midt på veggen.`,
      `Sørvegg og værside slites raskest — der er tre strøk vel anvendte penger.`,
      `Behandle endeved og skjøter ekstra nøye — det er der råten starter.`,
      r.ubehandlet?``:`Skrap og puss løs maling før vask — ny maling fester ikke bedre enn underlaget den står på.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `HANDLELISTE — Maling utvendig ${fm1(r.netto)} m² (${r.vegger.map(v=>`${v.navn}=${fm1(v.L)} m`).join(", ")} × ${fm1(r.H)} m)`,
      `${r.b.navn}, ${r.strok} strøk à ${String(r.dekkevne).replace(".",",")} m²/l · underlag: ${r.ubehandlet?"ubehandlet":"tidligere behandlet"}`,
    ]);
  }

  /* Arealoversikt: veggene side om side, målsatt, med antydet fradrag */
  function tegn(r){
    const W=660,PAD=40,GAP=14;
    const sumL=r.vegger.reduce((a,v)=>a+v.L,0);
    const sk=Math.min((W-2*PAD-GAP*(r.vegger.length-1))/sumL,200/r.H);
    const bh=r.H*sk,Hsvg=bh+2*PAD+20;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Arealoversikt: ${fm1(r.netto)} m² som skal behandles">`;
    let x=PAD + (W-2*PAD-(sumL*sk+GAP*(r.vegger.length-1)))/2;
    const fradragAndel=r.brutto>0?r.fradrag/r.brutto:0;
    r.vegger.forEach(v=>{
      const bw=v.L*sk;
      s+=`<rect x="${x}" y="${PAD}" width="${bw}" height="${bh}" fill="#E85D0F" opacity=".8" stroke="#C24C0A"/>`;
      /* antydet fradrag: hvitt "vindu" proporsjonalt med andelen */
      if (fradragAndel>0.01){
        const fw=Math.min(bw*0.35,Math.sqrt(fradragAndel*v.L*r.H)*sk), fh=Math.min(bh*0.45,fw*0.8);
        s+=`<rect x="${x+bw*0.18}" y="${PAD+bh*0.22}" width="${fw}" height="${fh}" fill="#fff" stroke="#C9CFD4"/>`;
      }
      s+=`<text x="${x+bw/2}" y="${PAD+bh+22}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Vegg ${v.navn}: ${fm1(v.L)} m · ${fm1(v.L*r.H)} m²</text>`;
      x+=bw+GAP;
    });
    s+=`<text x="${W/2}" y="${PAD-14}" font-size="12" text-anchor="middle" fill="#4A5A64" font-family="Inter,sans-serif">Netto ${fm1(r.netto)} m² (${fm1(r.brutto)} m² − ${fm1(r.fradrag)} m² åpninger) · høyde ${fm1(r.H)} m</text></svg>`;
    $("ml-planSvg").innerHTML=s;
  }

  function init(){
    ["ml-veggA","ml-veggB","ml-veggC","ml-hoyde","ml-fradrag","ml-strok","ml-dekkevne"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-utemaling [data-behandling]").forEach(b=>b.addEventListener("click",()=>{
      st.behandling=b.dataset.behandling;
      $("ml-dekkevne").value=BEHANDLING[st.behandling].dekkevne;   // typisk dekkevne følger behandlingen — kan justeres etterpå
      document.querySelectorAll("#view-utemaling [data-behandling]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-utemaling [data-underlag]").forEach(b=>b.addEventListener("click",()=>{
      st.underlag=b.dataset.underlag;
      document.querySelectorAll("#view-utemaling [data-underlag]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("ml-copyBtn").addEventListener("click",()=>copy(liste,$("ml-copyStatus")));
    $("ml-priserBtn").addEventListener("click",()=>PriceModal.open(ML.products, "Maling utvendig"));
    $("ml-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("utemaling","Maling utvendig",readForm("utemaling"),ML.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= BELEGNINGSSTEIN ========================= */
const BS = (()=>{
  /* Lagoppbygging etter bruk (leverandørveiledninger): gangareal 15-20 cm bærelag,
     kjørbar oppkjørsel 20-30 cm. Settesand 4 cm. Masser: ~1,5 t/m³, +15 % komprimeringsmonn. */
  const BRUK = {
    gang:    {navn:"Gangareal/platting", baerelag:0.15, steinId:"belegningsstein_5cm", steinTykk:0.05},
    kjorbar: {navn:"Kjørbar oppkjørsel", baerelag:0.25, steinId:"belegningsstein_6cm", steinTykk:0.06},
  };
  const SETTESAND=0.04, KOMPRIMERING=1.15, DENSITET=1.5;
  const FUGESAND_KG_M2=4, SEKK_KG=25, FIBERDUK_RULL=25, STEIN_SVINN=1.05;
  const st = {bruk:"kjorbar", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("bs-lengde").value)||0), B=Math.max(0.5,parseFloat($("bs-bredde").value)||0);
    const areal=+(L*B).toFixed(1);
    const bruk=BRUK[st.bruk];
    const myk=$("bs-mykgrunn").checked;
    const baerelag=bruk.baerelag+(myk?0.10:0);
    const dybde=+(baerelag+SETTESAND+bruk.steinTykk).toFixed(2);
    const utgravM3=+(areal*dybde).toFixed(1);
    const pukkM3=+(areal*baerelag*KOMPRIMERING).toFixed(1);
    const pukkTonn=+(pukkM3*DENSITET).toFixed(1);
    const sandM3=+(areal*SETTESAND*KOMPRIMERING).toFixed(1);
    const sandTonn=+(sandM3*DENSITET).toFixed(1);
    const steinM2=Math.ceil(areal*STEIN_SVINN);
    const fugesandSekker=Math.max(1,Math.ceil(areal*FUGESAND_KG_M2/SEKK_KG));
    const fiberduk=Math.max(1,Math.ceil(areal*1.1/FIBERDUK_RULL));
    const kant=$("bs-kant").checked?Math.ceil(2*(L+B)):0;
    return {L,B,areal,bruk,myk,baerelag,dybde,utgravM3,pukkM3,pukkTonn,sandM3,sandTonn,
            steinM2,fugesandSekker,fiberduk,kant};
  }

  function render(){
    const r=beregn();

    $("bs-regelsjekk").innerHTML =
      `<div class="alert ok"><b>Fall:</b> 1,5–2 cm per meter bort fra husvegg — aldri fall mot grunnmuren. Legg fallet i bærelaget, ikke i settesanden.</div>`
      + (r.myk?`<div class="alert" style="margin-top:.5rem"><b>Myk grunn:</b> 10 cm ekstra bærelag er lagt inn. Ved ren matjord/bløt leire: grav til fast grunn og vurder geonett.</div>`:``);

    const steps=[
      {t:`${r.bruk.navn} ${fm1(r.L)} × ${fm1(r.B)} m = <b>${fm1(r.areal)} m²</b> → utgraving <b>${Math.round(r.dybde*100)} cm</b> dyp = <b>${fm1(r.utgravM3)} m³</b> masse ut`,
       s:`${Math.round(r.baerelag*100)} cm bærelag + ${SETTESAND*100} cm settesand + ${Math.round(r.bruk.steinTykk*100)} cm stein${r.myk?" · inkl. 10 cm for myk grunn":""}`},
      {t:`Bærelag: ${fm1(r.areal)} m² × ${Math.round(r.baerelag*100)} cm × 1,15 = <b>${fm1(r.pukkM3)} m³</b> ≈ <b>${fm1(r.pukkTonn)} tonn</b> pukk 0–32`,
       s:`Komprimeringsmonn ~15 % · tetthet ~1,5 t/m³ · komprimeres i lag à 10–15 cm med vibroplate`},
      {t:`Settesand: ${fm1(r.areal)} m² × ${SETTESAND*100} cm × 1,15 = <b>${fm1(r.sandM3)} m³</b> ≈ <b>${fm1(r.sandTonn)} tonn</b>`,
       s:`Avrettes med rettholt over rør — gå aldri på ferdig avrettet sand`},
      {t:`Stein: ${fm1(r.areal)} m² + 5 % kapp = <b>${r.steinM2} m²</b> (${Math.round(r.bruk.steinTykk*100)} cm tykkelse for ${st.bruk==="kjorbar"?"kjørbar flate":"gangareal"}) · fugesand <b>${r.fugesandSekker} sekker</b>`,
       s:`Kjørbar flate krever minst 6 cm stein · fugesand ~${FUGESAND_KG_M2} kg/m², kostes ned og vibreres`},
      {t:`Fiberduk <b>${r.fiberduk} rull(er)</b> under bærelaget${r.kant?` · kantsikring <b>${fmt(r.kant)} lm</b>`:``}`,
       s:`Duken hindrer at pukken synker i grunnen — 30 cm overlapp i skjøtene`},
    ];
    $("bs-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make(r.bruk.steinId, r.steinM2, {sourceTool:"belegningsstein",
        note:`${fm1(r.areal)} m² flate + 5 % kapp — velg stein, mønster og farge fritt`, estPrice:P[r.bruk.steinId]}),
      Catalog.make("pukk_0_32", r.pukkTonn, {sourceTool:"belegningsstein",
        note:`${fm1(r.pukkM3)} m³ — bigbag ≈ 1 tonn, eller billigere levert løst på lass`, estPrice:P.pukk_0_32}),
      Catalog.make("settesand_0_8", r.sandTonn, {sourceTool:"belegningsstein",
        note:`${fm1(r.sandM3)} m³ — 4 cm avrettet lag`, estPrice:P.settesand_0_8}),
      Catalog.make("fugesand_25kg", r.fugesandSekker, {sourceTool:"belegningsstein",
        note:`~${FUGESAND_KG_M2} kg/m² — kostes ned i fugene og vibreres`, estPrice:P.fugesand_25kg}),
      Catalog.make("fiberduk_25m2", r.fiberduk, {sourceTool:"belegningsstein",
        note:`legges under bærelaget med 30 cm overlapp`, estPrice:P.fiberduk_25m2}),
    ];
    if (r.kant) rows.push(Catalog.make("kantstein_betong", r.kant, {sourceTool:"belegningsstein",
        note:`settes i jordfuktig betong — trekk fra sider som møter husvegg/fast kant`, estPrice:P.kantstein_betong}));

    BS.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("bs-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("bs-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("bs-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.areal)}</b><small>m² flate</small></div>
      <div class="stat"><b>${fm1(r.utgravM3)}</b><small>m³ utgraving</small></div>
      <div class="stat"><b>${fm1(r.pukkTonn)}</b><small>tonn pukk</small></div>
      <div class="stat"><b>${fm1(r.sandTonn)}</b><small>tonn settesand</small></div>
      <div class="stat"><b>${r.steinM2}</b><small>m² stein</small></div>`;

    $("bs-notes").innerHTML=[
      `Verktøyet låser deg ikke til en stein: velg type, mønster og farge fritt — juster pris per m², så regnes totalen om.`,
      `Utgravde masser tar mer plass enn de lå: regn ~25 % ekstra volum på hengeren eller containeren.`,
      `Lei vibroplate (min. 100 kg for kjørbar flate) — komprimér bærelaget i lag, aldri alt på én gang.`,
      `Legg steinen fra ferdig lagt flate — gå aldri i settesanden. Kapp med vinkelsliper og diamantblad.`,
      `Sving og kanter gir mer kapp — velg mønster som tåler tilpasning (f.eks. halvforbandt).`,
      `Etterfyll fugesand etter noen uker — fugene setter seg, og fulle fuger er det som låser flaten.`,
    ].map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Belegningsstein ${fm1(r.L)} × ${fm1(r.B)} m (${fm1(r.areal)} m², ${r.bruk.navn.toLowerCase()})`,
      `Utgraving ${Math.round(r.dybde*100)} cm (${fm1(r.utgravM3)} m³ ut) · bærelag ${Math.round(r.baerelag*100)} cm · fall 1,5–2 cm/m bort fra hus`,
    ]);
  }

  /* Tverrsnitt av lagoppbyggingen, målsatt per lag */
  function tegn(r){
    const W=660,PAD=46,bw=W-2*PAD-120;
    const skala=200/r.dybde;                                 // px per meter dybde
    const lag=[
      {navn:`Belegningsstein ${Math.round(r.bruk.steinTykk*100)} cm`, h:r.bruk.steinTykk, fill:"#E6D9B8"},
      {navn:`Settesand ${SETTESAND*100} cm`,                          h:SETTESAND,        fill:"#C9A96A"},
      {navn:`Bærelag pukk ${Math.round(r.baerelag*100)} cm`,          h:r.baerelag,       fill:"#8E979E"},
    ];
    let y=PAD, s=`<svg viewBox="0 0 ${W} ${PAD*2+r.dybde*skala+46}" role="img" aria-label="Lagoppbygging ${Math.round(r.dybde*100)} cm">`;
    /* fall-pil over flaten */
    s+=`<line x1="${PAD}" y1="${y-14}" x2="${PAD+bw}" y2="${y-8}" stroke="#C24C0A" stroke-width="2"/>
        <polygon points="${PAD+bw},${y-8} ${PAD+bw-10},${y-13} ${PAD+bw-8},${y-3}" fill="#C24C0A"/>
        <text x="${PAD+bw/2}" y="${y-20}" font-size="11" text-anchor="middle" fill="#C24C0A" font-family="Inter,sans-serif">fall 1,5–2 cm/m bort fra hus</text>`;
    lag.forEach(l=>{
      const h=Math.max(l.h*skala,10);
      s+=`<rect x="${PAD}" y="${y}" width="${bw}" height="${h}" fill="${l.fill}" stroke="#fff" stroke-width="1"/>
          <text x="${PAD+bw+10}" y="${y+h/2+4}" font-size="11" fill="#1C2A33" font-family="Inter,sans-serif">${l.navn}</text>`;
      if (l.fill==="#E6D9B8"){ for(let x=PAD+22;x<PAD+bw;x+=44) s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+h}" stroke="#C9CFD4" stroke-width="1.2"/>`; }
      if (l.fill==="#8E979E"){ for(let x=PAD+12;x<PAD+bw-6;x+=26) s+=`<circle cx="${x}" cy="${y+h/2}" r="3" fill="#6E777E"/>`; }
      y+=h;
    });
    /* fiberduk + grunn */
    s+=`<line x1="${PAD}" y1="${y}" x2="${PAD+bw}" y2="${y}" stroke="#E85D0F" stroke-width="3"/>
        <text x="${PAD+bw+10}" y="${y+4}" font-size="11" fill="#C24C0A" font-family="Inter,sans-serif">Fiberduk</text>
        <rect x="${PAD}" y="${y+2}" width="${bw}" height="18" fill="#4A3B2A" opacity=".35"/>
        <text x="${PAD+bw+10}" y="${y+16}" font-size="11" fill="#4A5A64" font-family="Inter,sans-serif">Grunn</text>`;
    /* total dybde-mål */
    s+=`<line x1="${PAD-14}" y1="${PAD}" x2="${PAD-14}" y2="${y}" stroke="#1C2A33" stroke-width="1.2"/>
        <text x="${PAD-20}" y="${(PAD+y)/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${PAD-20} ${(PAD+y)/2})">${Math.round(r.dybde*100)} cm utgraving</text></svg>`;
    $("bs-planSvg").innerHTML=s;
  }

  function init(){
    ["bs-lengde","bs-bredde","bs-mykgrunn","bs-kant"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-belegningsstein [data-bruk]").forEach(b=>b.addEventListener("click",()=>{
      st.bruk=b.dataset.bruk;
      document.querySelectorAll("#view-belegningsstein [data-bruk]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("bs-copyBtn").addEventListener("click",()=>copy(liste,$("bs-copyStatus")));
    $("bs-priserBtn").addEventListener("click",()=>PriceModal.open(BS.products, "Belegningsstein og grus"));
    $("bs-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("belegningsstein","Belegningsstein og grus",readForm("belegningsstein"),BS.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= PLEN ========================= */
const PL = (()=>{
  /* Forbruksnormer: ferdigplen-ruller à 1 m² (+5 % kapp), gressfrø ~2,5 kg/100 m²,
     gjødsel 3-4 kg/100 m², kalk 5-10 kg/100 m². Jordvolum +10 % fordi jorda setter seg. */
  const JORD_SETTING=1.1, RULL_SVINN=1.05, FRO_KG=0.025, GJODSEL_KG=0.035, KALK_KG=0.075;
  const st = {metode:"ferdigplen", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(1,parseFloat($("pl-lengde").value)||0), B=Math.max(1,parseFloat($("pl-bredde").value)||0);
    const areal=+(L*B).toFixed(1);
    const jordCm=Math.max(0,parseFloat($("pl-jordlag").value)||0);
    const jordM3=+(areal*jordCm/100*JORD_SETTING).toFixed(1);
    const ruller=Math.ceil(areal*RULL_SVINN);
    const froKg=Math.max(1,Math.ceil(areal*FRO_KG));
    const medGjodsel=$("pl-gjodsel").checked;
    const gjodselKg=medGjodsel?Math.max(1,Math.ceil(areal*GJODSEL_KG)):0;
    const kalkKg=medGjodsel?Math.max(1,Math.ceil(areal*KALK_KG)):0;
    return {L,B,areal,jordCm,jordM3,ruller,froKg,medGjodsel,gjodselKg,kalkKg};
  }

  function render(){
    const r=beregn();

    $("pl-regelsjekk").innerHTML =
      `<div class="alert ok"><b>Tidspunkt:</b> mai–juni eller august–september gir best etablering. Vanning er kritisk de første 2–3 ukene.</div>`
      + (st.metode==="ferdigplen"
        ? `<div class="alert" style="margin-top:.5rem"><b>Ferdigplen er ferskvare:</b> legg rullene innen 24 timer etter levering — bestill til dagen du skal legge.</div>`
        : ``);

    const steps=[
      {t:r.jordCm>0
        ?`Areal ${fm1(r.L)} × ${fm1(r.B)} m = <b>${fm1(r.areal)} m²</b> → ${r.jordCm} cm vekstjord × 1,1 = <b>${fm1(r.jordM3)} m³</b>`
        :`Areal ${fm1(r.L)} × ${fm1(r.B)} m = <b>${fm1(r.areal)} m²</b> — uten nytt jordlag (eksisterende jord rakes og jevnes)`,
       s:r.jordCm>0?`+10 % fordi jorda setter seg · bigbag ≈ 1 m³ · jevnes og tromles lett før legging/såing`:`fjern stein og røtter, rak til jevn overflate og tromle lett`},
      {t:st.metode==="ferdigplen"
        ?`Ferdigplen: ${fm1(r.areal)} m² + 5 % kapp = <b>${r.ruller} ruller</b> à 1 m²`
        :`Gressfrø: ${fm1(r.areal)} m² × 2,5 kg/100 m² = <b>${r.froKg} kg</b>`,
       s:st.metode==="ferdigplen"?`ruller à 40 × 250 cm — legges i forbandt, tett kant i kant uten overlapp`:`så halvparten på langs og halvparten på tvers for jevn dekning — rak inn og tromle`},
      ...(r.medGjodsel?[
      {t:`Startgjødsel <b>${r.gjodselKg} kg</b> (3,5 kg/100 m²) · hagekalk <b>${r.kalkKg} kg</b> (7,5 kg/100 m²)`,
       s:`gjødsle i vekstsesongen: vår, juni og sensommer — kalk motvirker sur jord og mose`}]:[]),
      {t:`Vanning: grundig første dag, deretter daglig i 2–3 uker til gresset har rotfeste`,
       s:st.metode==="ferdigplen"?`første klipp etter ca. 1 uke, på høyeste innstilling`:`første klipp når gresset er 8–10 cm`},
    ];
    $("pl-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[];
    if (r.jordCm>0) rows.push(Catalog.make("vekstjord", r.jordM3, {sourceTool:"plen",
        note:`${r.jordCm} cm lag over ${fm1(r.areal)} m², inkl. 10 % setting`, estPrice:P.vekstjord}));
    if (st.metode==="ferdigplen") rows.push(Catalog.make("ferdigplen_rull", r.ruller, {sourceTool:"plen",
        note:`${fm1(r.areal)} m² + 5 % kapp — bestill levering til leggedagen`, estPrice:P.ferdigplen_rull}));
    else rows.push(Catalog.make("gressfro_blanding", r.froKg, {sourceTool:"plen",
        note:`~2,5 kg per 100 m² — velg blanding etter sol/skygge og slitasje`, estPrice:P.gressfro_blanding}));
    if (r.gjodselKg) rows.push(Catalog.make("plengjodsel", r.gjodselKg, {sourceTool:"plen",
        note:`startdose — gjenta med 2 kg/100 m² i juni og på sensommeren`, estPrice:P.plengjodsel}));
    if (r.kalkKg) rows.push(Catalog.make("hagekalk", r.kalkKg, {sourceTool:"plen",
        note:`motvirker sur jord og mose — kan spres samtidig med gjødselen`, estPrice:P.hagekalk}));

    PL.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("pl-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("pl-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("pl-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.areal)}</b><small>m² plen</small></div>
      ${r.jordCm>0?`<div class="stat"><b>${fm1(r.jordM3)}</b><small>m³ vekstjord</small></div>`:``}
      <div class="stat"><b>${st.metode==="ferdigplen"?r.ruller:r.froKg}</b><small>${st.metode==="ferdigplen"?"ruller":"kg frø"}</small></div>
      ${r.gjodselKg?`<div class="stat"><b>${r.gjodselKg}</b><small>kg gjødsel</small></div>`:``}`;

    $("pl-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg jord, frøblanding eller plenleverandør fritt — juster pris, så regnes totalen om.`,
      st.metode==="ferdigplen"?`Legg rullene i forbandt (som murstein) og skjøtene tett — kapp med tapetkniv langs kanter.`:`Ikke så på varme, tørre dager — frøene trenger jevn fukt for å spire (10–20 dager).`,
      `Gå på planker, ikke rett på ny jord eller nylagt plen.`,
      `Skrå overganger mot bed og kanter gjør kantklippingen enklere.`,
      r.jordCm===0?`Uten nytt jordlag: luft/vertikalskjær gammel jord og rak inn litt kompost før du ${st.metode==="ferdigplen"?"legger":"sår"}.`:``,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Plen ${fm1(r.L)} × ${fm1(r.B)} m (${fm1(r.areal)} m², ${st.metode==="ferdigplen"?"ferdigplen":"såing"})`,
      `${r.jordCm>0?`${r.jordCm} cm vekstjord (${fm1(r.jordM3)} m³) · `:``}vanning daglig i 2–3 uker`,
    ]);
  }

  /* Leggeplan: baner à 40 cm i forbandt (ferdigplen) eller sådd flate */
  function tegn(r){
    const W=660,PAD=46,sk=Math.min((W-2*PAD)/r.L,280/r.B);
    const bw=r.L*sk,bh=r.B*sk,Hsvg=bh+2*PAD+10,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Plen ${fm1(r.areal)} m²">`;
    s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="#7FB88F" stroke="#1E7A46"/>`;
    if (st.metode==="ferdigplen"){
      const baneH=Math.max(0.4*sk,6), rullW=Math.max(2.5*sk,20);
      let rad=0;
      for(let y=y0;y<y0+bh-1;y+=baneH){
        const h=Math.min(baneH,y0+bh-y);
        s+=`<line x1="${x0}" y1="${y+h}" x2="${x0+bw}" y2="${y+h}" stroke="#1E7A46" stroke-width="1.2"/>`;
        const offset=(rad%2)*rullW/2;
        for(let x=x0+offset;x<x0+bw-1;x+=rullW)
          s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+h}" stroke="#1E7A46" stroke-width="1"/>`;
        rad++;
      }
    } else {
      for(let i=0;i<Math.min(r.areal*3,400);i++){
        const x=x0+4+Math.random()*(bw-8), y=y0+4+Math.random()*(bh-8);
        s+=`<circle cx="${x}" cy="${y}" r="1.1" fill="#1E7A46"/>`;
      }
    }
    s+=`<text x="${x0+bw/2}" y="${y0+bh+28}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">${fm1(r.L)} m${st.metode==="ferdigplen"?` · baner à 40 cm i forbandt`:` · sås i to retninger`}</text>
        <text x="${x0-26}" y="${y0+bh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-26} ${y0+bh/2})">${fm1(r.B)} m</text></svg>`;
    $("pl-planSvg").innerHTML=s;
  }

  function init(){
    ["pl-lengde","pl-bredde","pl-jordlag","pl-gjodsel"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-plen [data-metode]").forEach(b=>b.addEventListener("click",()=>{
      st.metode=b.dataset.metode;
      document.querySelectorAll("#view-plen [data-metode]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("pl-copyBtn").addEventListener("click",()=>copy(liste,$("pl-copyStatus")));
    $("pl-priserBtn").addEventListener("click",()=>PriceModal.open(PL.products, "Plen"));
    $("pl-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("plen","Plen",readForm("plen"),PL.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= GJERDE ========================= */
const GJ = (()=>{
  /* SAK10 §4-1: gjerde/innhegning mot vei er søknadsfritt inntil 1,5 m med åpent, lett
     uttrykk — men må aldri sperre frisikten. Mot nabo gir gjerdeloven §6 rett til å gjerde. */
  const PORT = {ingen:{navn:"ingen port", bredde:0, blader:0}, gang:{navn:"gangport", bredde:1.0, blader:1}, kjore:{navn:"kjøreport", bredde:3.0, blader:2}};
  const UTFORMING = {
    apent: {navn:"Åpent spilegjerde", gap:0.030, aapen:true},   // 30 mm mellom spilene
    tett:  {navn:"Tett gjerde",       gap:-0.010, aapen:false},  // 10 mm omlegg
  };
  const NEDSTOPING = 0.6;
  const st = {gtype:"apent", port:"ingen", priser:{}};
  let liste = "";

  function beregn(){
    const sider = ["gj-sideA","gj-sideB","gj-sideC"]
      .map((id,i)=>({navn:"ABC"[i], L:Math.max(0,parseFloat($(id).value)||0)}))
      .filter(s=>s.L>0.2);
    const H = Math.max(0.4,parseFloat($("gj-hoyde").value)||0);
    const bordB = Math.max(45,parseFloat($("gj-bordbredde").value)||98);
    const motVei = $("gj-motvei").checked, vind = $("gj-vind").checked;
    const u = UTFORMING[st.gtype], p = PORT[st.port];
    const cc = vind ? 1.5 : 1.8;
    const totalL = +(sider.reduce((a,s)=>a+s.L,0)).toFixed(1);

    let stolper = sider.reduce((a,s)=>a+Math.ceil(s.L/cc)+1, 0);
    if (sider.length>1) stolper -= (sider.length-1);        // delte hjørnestolper
    if (p.blader) stolper += 1;                             // ekstra dedikert portstolpe
    const stolpeL = +(H+NEDSTOPING).toFixed(2), stolpeLm = +(stolper*stolpeL).toFixed(1);

    const svillRader = H>1.5 ? 3 : 2;
    const svillLm = Math.ceil(svillRader*totalL*1.05);

    const ccBord = (bordB + u.gap*1000)/1000;              // senteravstand bord/spile (m)
    const bordAntall = Math.ceil(totalL/ccBord);           // hele løpet, porten fylles med samme bord
    const bordLm = Math.ceil(bordAntall*H*1.05);
    const skruer = bordAntall*svillRader*2, skruerPk = Math.ceil(skruer/250);

    /* Port: egen ramme (omkrets + skråbånd per blad) + beslag */
    const bladB = p.blader ? p.bredde/p.blader : 0;
    const rammeLm = p.blader ? Math.ceil((2*(bladB+H) + Math.hypot(bladB,H)) * p.blader * 1.05) : 0;

    /* Regelstatus */
    let regel;
    if (motVei){
      if (H<=1.5 && u.aapen) regel={ok:true,  tekst:`<b>Søknadsfri mot vei:</b> åpent gjerde inntil 1,5 m er normalt unntatt — men det <b>må ikke sperre frisikten</b> mot veien.`};
      else if (H>1.5)        regel={ok:false, tekst:`Gjerde mot vei over 1,5 m er normalt <b>søknadspliktig</b> — sjekk med kommunen.`};
      else                   regel={ok:false, tekst:`Tett gjerde mot vei kan bryte <b>frisiktkravet</b> og være søknadspliktig — åpent uttrykk under 1,5 m er tryggest.`};
    } else {
      regel={ok:true, tekst:`<b>Mot nabo:</b> gjerdeloven §6 gir deg rett til å gjerde inn egen eiendom. Naboen kan protestere ved urimelig ulempe (sol/lys/sikt) — snakk sammen først.`};
    }
    return {sider,H,bordB,motVei,vind,u,p,cc,totalL,stolper,stolpeL,stolpeLm,svillRader,svillLm,
            ccBord,bordAntall,bordLm,skruer,skruerPk,bladB,rammeLm,regel};
  }

  function render(){
    const r = beregn();
    if (!r.sider.length){
      $("gj-dimSteps").innerHTML = `<div class="alert">Angi minst én sidelengde over 0,2 m.</div>`;
      $("gj-planSvg").innerHTML=""; $("gj-stats").innerHTML="";
      $("gj-matTable").querySelector("tbody").innerHTML=""; $("gj-notes").innerHTML="";
      GJ.products = []; liste=""; return;
    }

    $("gj-regelsjekk").innerHTML =
      `<div class="alert ${r.regel.ok?"ok":"warn"}">${r.regel.tekst}<span style="display:block;font-size:.75rem;margin-top:.25rem">Byggesaksforskriften §4-1 / gjerdeloven · arealplan og eventuelle byggegrenser gjelder uansett</span></div>`
      + (r.vind?`<div class="alert" style="margin-top:.5rem"><b>Vindutsatt:</b> stolper c/c 1,5 m og frostfritt støpt fundament — særlig ved tett gjerde som tar mye vind.</div>`:``);

    const steps=[
      {t:`${r.sider.map(s=>`${fm1(s.L)}`).join(" + ")} = <b>${fm1(r.totalL)} m gjerde</b>, høyde ${fm1(r.H)} m → ${r.regel.ok?`<b>${r.motVei?"søknadsfri mot vei":"i orden mot nabo"}</b>`:`<b>krever tiltak</b> (se regelsjekk)`}`,
       s:`${r.p.navn!=="ingen port"?`inkl. ${r.p.navn} (${fm1(r.p.bredde)} m)`:"uten port"}${r.sider.length>1?" · hjørnestolper deles":""}`},
      {t:`Stolper c/c ${fm1(r.cc)} m → <b>${r.stolper} stolper</b> à ${fm1(r.stolpeL)} m (${Math.round(NEDSTOPING*100)} cm under terreng)`,
       s:`98 × 98 imp.${r.p.blader?` · +1 ekstra portstolpe — portstolper bør alltid støpes`:""}${r.vind?" · vindutsatt c/c 1,5 m":""}`},
      {t:`${r.svillRader} sviller 48 × 98 à ${fm1(r.totalL)} m → <b>${fmt(r.svillLm)} lm</b>`,
       s:`${r.H>1.5?"3 sviller over 1,5 m høyde":"topp- og bunnsvill"} — skjøtes over stolpe`},
      {t:`${r.u.navn}: bord c/c ${Math.round(r.ccBord*1000)} mm → <b>${r.bordAntall} bord</b> à ${fm1(r.H)} m = ${fmt(r.bordLm)} lm`,
       s:r.u.aapen?`30 mm luft mellom spilene — lett uttrykk, slipper gjennom vind og lys`:`10 mm omlegg — full skjerming, men tar mer vind`},
      ...(r.p.blader?[
      {t:`Port: <b>${r.p.blader} portblad</b> à ${fm1(r.bladB)} m → ramme ${fmt(r.rammeLm)} lm + <b>beslagssett</b>`,
       s:`ramme med diagonalt skråbånd mot heng — bladene kles med samme bord som gjerdet`}]:[]),
      {t:`${fmt(r.skruer)} skruer → <b>${r.skruerPk} pk</b>`,
       s:`2 skruer per bord per svill`},
    ];
    $("gj-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make("stolpe_98x98_imp", r.stolpeLm, {sourceTool:"gjerde",
        note:`${r.stolper} stk à ${fm1(r.stolpeL)} m — ${Math.round(NEDSTOPING*100)} cm under terreng`, estPrice:P.stolpe_98x98_imp}),
      Catalog.make("losholt_48x98", r.svillLm, {sourceTool:"gjerde",
        note:`${r.svillRader} sviller à ${fm1(r.totalL)} m, inkl. 5 % kapp`, estPrice:P.losholt_48x98}),
      Catalog.make("gjerde_bord_19", r.bordLm + r.rammeLm, {sourceTool:"gjerde",
        note:`${r.bordAntall} bord à ${fm1(r.H)} m${r.rammeLm?` + ${fmt(r.rammeLm)} lm portramme`:""} — ${r.u.navn.toLowerCase()}`, estPrice:P.gjerde_bord_19}),
      Catalog.make("treskrue_42x55_a4", r.skruerPk, {sourceTool:"gjerde",
        note:`${fmt(r.skruer)} skruer — varmforsinket eller rustfri`, estPrice:P.treskrue_42x55_a4}),
      Catalog.make("konstruksjonsskrue_6x90", 1, {sourceTool:"gjerde",
        note:`sviller mot stolper og portramme`, estPrice:P.konstruksjonsskrue_6x90}),
    ];
    if (st.port==="gang") rows.push(Catalog.make("portbeslag_gang", 1, {sourceTool:"gjerde",
        note:`hengsler, vrider og lås til gangporten`, estPrice:P.portbeslag_gang}));
    if (st.port==="kjore") rows.push(Catalog.make("portbeslag_kjore", 1, {sourceTool:"gjerde",
        note:`kraftige hengsler, slå og bakkeboltlås til kjøreporten`, estPrice:P.portbeslag_kjore}));

    GJ.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("gj-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("gj-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("gj-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.totalL)}</b><small>lm gjerde</small></div>
      <div class="stat"><b>${r.stolper}</b><small>stolper</small></div>
      <div class="stat"><b>${r.bordAntall}</b><small>bord/spiler</small></div>
      <div class="stat"><b>${fmt(r.bordLm)}</b><small>lm bord</small></div>
      <div class="stat"><b>${r.p.blader||0}</b><small>portblad</small></div>`;

    $("gj-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg bordtype og behandling fritt — juster bordbredde og pris, så regnes alt om.`,
      `Portstolper må støpes frostfritt — en port som siger, er den vanligste gjerdefeilen. Sett gjerne en diagonal jordstøtte.`,
      r.u.aapen?`Åpent spilegjerde: hold jevn åpning med en kappet klosse som avstandslære.`:`Tett gjerde tar mye vind — vurder litt luft i bunn og støpte stolper.`,
      `Hold bordene 5–10 cm over terreng så endeveden ikke suger fukt.`,
      r.motVei?`Mot vei: hold frisiktsonen i kryss og avkjørsler fri — kommunen kan kreve lavere gjerde der.`:`Snakk med naboen før du setter gjerdet i eller nær grensen.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Gjerde ${fm1(r.totalL)} lm, høyde ${fm1(r.H)} m (${r.u.navn.toLowerCase()})`,
      `${r.sider.map(s=>`${s.navn}=${fm1(s.L)} m`).join(", ")} · ${r.p.navn} · ${r.regel.ok?(r.motVei?"søknadsfri mot vei":"mot nabo"):"OBS: se regelsjekk"}`,
    ]);
  }

  /* Gjerdeoppriss: lengste side, med port markert til høyre hvis valgt */
  function tegn(r){
    const s0 = [...r.sider].sort((a,b)=>b.L-a.L)[0];
    const visL = s0.L, W=660,PAD=52,sk=Math.min((W-2*PAD)/visL,150/r.H);
    const bw=visL*sk,bh=r.H*sk,Hsvg=bh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    const portPx = r.p.bredde*sk, feltPx = bw-portPx;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Gjerdeoppriss ${r.u.navn}${r.p.blader?` med ${r.p.navn}`:""}">`;
    s+=`<line x1="${x0-20}" y1="${y0+bh}" x2="${x0+bw+20}" y2="${y0+bh}" stroke="#8E979E" stroke-width="2"/>`;
    /* sviller */
    const raderY = r.svillRader===2 ? [0.18,0.82] : [0.12,0.5,0.88];
    raderY.forEach(f=>{ const y=y0+bh*f;
      s+=`<line x1="${x0}" y1="${y}" x2="${x0+feltPx}" y2="${y}" stroke="#1C2A33" stroke-width="3"/>`; });
    /* spiler/bord i gjerdefeltet */
    const stepX = r.ccBord*sk, bordPx=Math.max(r.bordB/1000*sk,2);
    for(let x=x0;x<x0+feltPx-1;x+=stepX)
      s+=`<rect x="${x}" y="${y0}" width="${Math.min(bordPx, x0+feltPx-x)}" height="${bh}" fill="#E6D9B8" stroke="#C9CFD4" stroke-width=".5"/>`;
    /* port til høyre */
    if (r.p.blader){
      s+=`<rect x="${x0+feltPx+3}" y="${y0-3}" width="${portPx-6}" height="${bh+3}" fill="none" stroke="#E85D0F" stroke-width="2.5"/>`;
      s+=`<line x1="${x0+feltPx+3}" y1="${y0+bh}" x2="${x0+feltPx+portPx-3}" y2="${y0-3}" stroke="#E85D0F" stroke-width="1.5"/>`;
      if (r.p.blader===2) s+=`<line x1="${x0+feltPx+portPx-3}" y1="${y0+bh}" x2="${x0+feltPx+3}" y2="${y0-3}" stroke="#E85D0F" stroke-width="1.5"/>`;
    }
    /* stolper */
    const nS=Math.ceil(visL/r.cc)+1, sp=bw/(nS-1);
    for(let i=0;i<nS;i++){ const x=x0+Math.min(i*sp,bw);
      s+=`<rect x="${x-4}" y="${y0-5}" width="8" height="${bh+15}" fill="#8E979E" rx="2"/>`; }
    s+=`<text x="${x0+bw/2}" y="${y0+bh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Side ${s0.navn}: ${fm1(s0.L)} m · ${r.u.navn}${r.p.blader?` + ${r.p.navn}`:""}</text>
        <text x="${x0-30}" y="${y0+bh/2}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600" transform="rotate(-90 ${x0-30} ${y0+bh/2})">${fm1(r.H)} m</text></svg>`;
    $("gj-planSvg").innerHTML=s;
  }

  function init(){
    ["gj-sideA","gj-sideB","gj-sideC","gj-hoyde","gj-bordbredde","gj-motvei","gj-vind"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-gjerde [data-gtype]").forEach(b=>b.addEventListener("click",()=>{
      st.gtype=b.dataset.gtype;
      document.querySelectorAll("#view-gjerde [data-gtype]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-gjerde [data-port]").forEach(b=>b.addEventListener("click",()=>{
      st.port=b.dataset.port;
      document.querySelectorAll("#view-gjerde [data-port]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("gj-copyBtn").addEventListener("click",()=>copy(liste,$("gj-copyStatus")));
    $("gj-priserBtn").addEventListener("click",()=>PriceModal.open(GJ.products, "Gjerde"));
    $("gj-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("gjerde","Gjerde",readForm("gjerde"),GJ.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= MALING INNVENDIG ========================= */
const MI = (()=>{
  /* Sparkel: full skimming av ny gips ~1,5 kg/m², punktsparkling av malt flate ~0,15 kg/m².
     Grunning kreves på ny gips/ubehandlet før maling. Spann sparkel à 2,5 kg. */
  const SPARKEL_GIPS=1.5, SPARKEL_PUNKT=0.15, SPANN_KG=2.5, GRUNN_DEKK=10;
  const FLATE = {vegger:{navn:"vegger",vegg:true,tak:false}, begge:{navn:"vegger + tak",vegg:true,tak:true}, tak:{navn:"kun tak",vegg:false,tak:true}};
  const st = {flate:"vegger", underlag:"malt", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("mi-lengde").value)||0), B=Math.max(0.5,parseFloat($("mi-bredde").value)||0);
    const H=Math.max(1.8,parseFloat($("mi-hoyde").value)||0);
    const fradrag=Math.max(0,parseFloat($("mi-fradrag").value)||0);
    const strok=parseInt($("mi-strok").value,10);
    const dekkevne=Math.max(4,parseFloat($("mi-dekkevne").value)||8);
    const f=FLATE[st.flate], gips=st.underlag==="gips";
    const sparkelPaa=$("mi-sparkel").checked || gips;

    const veggBrutto=2*(L+B)*H;
    const veggAreal=f.vegg ? +Math.max(0,veggBrutto-fradrag).toFixed(1) : 0;
    const takAreal=f.tak ? +(L*B).toFixed(1) : 0;
    const totalAreal=+(veggAreal+takAreal).toFixed(1);

    const veggLiter=f.vegg ? +(veggAreal*strok/dekkevne).toFixed(1) : 0;
    const takLiter=f.tak ? +(takAreal*strok/dekkevne).toFixed(1) : 0;
    const grunnLiter=gips ? +(totalAreal/GRUNN_DEKK).toFixed(1) : 0;
    const sparkelKg=sparkelPaa ? Math.ceil(totalAreal*(gips?SPARKEL_GIPS:SPARKEL_PUNKT)) : 0;
    const sparkelSpann=sparkelKg ? Math.ceil(sparkelKg/SPANN_KG) : 0;
    return {L,B,H,fradrag,strok,dekkevne,f,gips,sparkelPaa,veggAreal,takAreal,totalAreal,
            veggLiter,takLiter,grunnLiter,sparkelKg,sparkelSpann};
  }

  function render(){
    const r=beregn();

    $("mi-regelsjekk").innerHTML =
      (r.gips
        ? `<div class="alert ok"><b>Ny gips:</b> grunning og full sparkling er lagt inn. Grunn først, sparkle skjøter og skruehull, slip, og grunn en gang til på sparkelen før toppstrøkene.</div>`
        : `<div class="alert ok"><b>Tidligere malt:</b> vask flatene (grovrengjøring), matt ned blanke flater med lett sliping, og flekksparkle hull og riper.</div>`);

    const steps=[
      {t:`Rom ${fm1(r.L)} × ${fm1(r.B)} m, takhøyde ${fm1(r.H)} m → ${r.f.vegg?`vegger <b>${fm1(r.veggAreal)} m²</b>`:""}${r.f.vegg&&r.f.tak?" · ":""}${r.f.tak?`tak <b>${fm1(r.takAreal)} m²</b>`:""}`,
       s:`${r.f.vegg?`omkrets ${fm1(2*(r.L+r.B))} m × ${fm1(r.H)} m − ${fm1(r.fradrag)} m² åpninger`:"maler kun taket"}`},
      ...(r.f.vegg?[
      {t:`Veggmaling: ${fm1(r.veggAreal)} m² × ${r.strok} strøk ÷ ${String(r.dekkevne).replace(".",",")} m²/l = <b>${fm1(r.veggLiter)} liter</b>`,
       s:`kjøp nærmeste hele spann — rest er verdifull reserve til senere utbedring`}]:[]),
      ...(r.f.tak?[
      {t:`Takmaling: ${fm1(r.takAreal)} m² × ${r.strok} strøk ÷ ${String(r.dekkevne).replace(".",",")} m²/l = <b>${fm1(r.takLiter)} liter</b>`,
       s:`helmatt takmaling skjuler ujevnheter og gir minst gjenskinn`}]:[]),
      ...(r.gips?[
      {t:`Grunning <b>${fm1(r.grunnLiter)} liter</b> over ${fm1(r.totalAreal)} m² + full sparkling <b>${r.sparkelKg} kg</b> (${r.sparkelSpann} spann)`,
       s:`ny gips suger — uten grunning slipper ikke sparkel og maling ordentlig · ~1,5 kg sparkel/m²`}]
       :r.sparkelPaa?[
      {t:`Punktsparkling <b>${r.sparkelKg} kg</b> (${r.sparkelSpann} spann)`,
       s:`hull, skjøter og riper — slip og støvtørk før maling`}]:[]),
      {t:`Rekkefølge: ${r.f.tak&&r.f.vegg?"tak først, så vegger":r.f.tak?"tak":"vegger"} — mal vått-i-vått og hold en jevn kant`,
       s:`luft godt underveis, hold 5–18 °C, og la hvert strøk tørke før neste`},
    ];
    $("mi-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[];
    if (r.f.vegg) rows.push(Catalog.make("innemaling_vegg", Math.max(1,Math.ceil(r.veggLiter)), {sourceTool:"innemaling",
        note:`${fm1(r.veggAreal)} m² × ${r.strok} strøk — velg farge og glans fritt, ${fm1(r.veggLiter)} l netto`, estPrice:P.innemaling_vegg}));
    if (r.f.tak) rows.push(Catalog.make("takmaling", Math.max(1,Math.ceil(r.takLiter)), {sourceTool:"innemaling",
        note:`${fm1(r.takAreal)} m² × ${r.strok} strøk, ${fm1(r.takLiter)} l netto`, estPrice:P.takmaling}));
    if (r.grunnLiter) rows.push(Catalog.make("grunning_inne", Math.max(1,Math.ceil(r.grunnLiter)), {sourceTool:"innemaling",
        note:`1 strøk over ${fm1(r.totalAreal)} m² ny gips`, estPrice:P.grunning_inne}));
    if (r.sparkelSpann) rows.push(Catalog.make("sparkel_inne", r.sparkelSpann, {sourceTool:"innemaling",
        note:r.gips?`full sparkling ~1,5 kg/m² (${r.sparkelKg} kg)`:`punktsparkling (${r.sparkelKg} kg)`, estPrice:P.sparkel_inne}));
    rows.push(Catalog.make("maskeringstape", 1, {sourceTool:"innemaling",
        note:`tape mot lister/karmer og plast på gulv og møbler`, estPrice:P.maskeringstape}));
    rows.push(Catalog.make("malerutstyr_sett", 1, {sourceTool:"innemaling",
        note:`ruller, pensler, skaft, malebrett — gjenbrukes prosjekt etter prosjekt`, estPrice:P.malerutstyr_sett}));

    MI.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("mi-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("mi-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("mi-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.totalAreal)}</b><small>m² som males</small></div>
      ${r.f.vegg?`<div class="stat"><b>${fm1(r.veggLiter)}</b><small>l veggmaling</small></div>`:``}
      ${r.f.tak?`<div class="stat"><b>${fm1(r.takLiter)}</b><small>l takmaling</small></div>`:``}
      ${r.grunnLiter?`<div class="stat"><b>${fm1(r.grunnLiter)}</b><small>l grunning</small></div>`:``}
      ${r.sparkelKg?`<div class="stat"><b>${r.sparkelKg}</b><small>kg sparkel</small></div>`:``}`;

    $("mi-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg merke, farge og glans fritt — juster dekkevne og pris, så regnes literne om.`,
      `Dekkevnen står på spannet og varierer mye — mørke og sterke farger dekker dårligere og trenger ofte 3 strøk.`,
      `Mal tak og vegger i dagslys fra siden, så ser du gjenskinn og misser mens malingen er våt.`,
      r.gips?`Ny gips: slip lett mellom sparkelstrøkene og støvtørk grundig — støv gir dårlig heft.`:`Vask alltid kjøkken- og badevegger for fett og såperester før maling.`,
      `Ta vare på restmalingen med farge- og romnavn på lokket — uvurderlig ved senere utbedring.`,
    ].filter(Boolean).map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `HANDLELISTE — Maling innvendig, ${r.f.navn} (${fm1(r.totalAreal)} m²)`,
      `Rom ${fm1(r.L)} × ${fm1(r.B)} m, takhøyde ${fm1(r.H)} m · ${r.strok} strøk · ${r.gips?"ny gips (grunning + sparkling)":"tidligere malt"}`,
    ]);
  }

  /* Enkel arealoversikt: rom sett i perspektiv-lite, vegger/tak markert etter valg */
  function tegn(r){
    const W=660,H=300,PAD=50;
    const rw=W-2*PAD, rh=H-2*PAD, x0=PAD, y0=PAD, dp=44;   // dp = perspektivdybde
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Arealoversikt ${r.f.navn}">`;
    const vegg=r.f.vegg?"#E85D0F":"#EFF1EE", tak=r.f.tak?"#8E979E":"#EFF1EE";
    /* tak */
    s+=`<polygon points="${x0},${y0} ${x0+rw},${y0} ${x0+rw-dp},${y0+dp} ${x0+dp},${y0+dp}" fill="${tak}" opacity="${r.f.tak?.85:.3}" stroke="#C9CFD4"/>`;
    /* bakvegg */
    s+=`<rect x="${x0+dp}" y="${y0+dp}" width="${rw-2*dp}" height="${rh-2*dp}" fill="${vegg}" opacity="${r.f.vegg?.85:.3}" stroke="#C9CFD4"/>`;
    /* venstre og høyre vegg */
    s+=`<polygon points="${x0},${y0} ${x0+dp},${y0+dp} ${x0+dp},${y0+rh-dp} ${x0},${y0+rh}" fill="${vegg}" opacity="${r.f.vegg?.6:.25}" stroke="#C9CFD4"/>`;
    s+=`<polygon points="${x0+rw},${y0} ${x0+rw-dp},${y0+dp} ${x0+rw-dp},${y0+rh-dp} ${x0+rw},${y0+rh}" fill="${vegg}" opacity="${r.f.vegg?.6:.25}" stroke="#C9CFD4"/>`;
    /* gulv (nøytralt) */
    s+=`<polygon points="${x0},${y0+rh} ${x0+dp},${y0+rh-dp} ${x0+rw-dp},${y0+rh-dp} ${x0+rw},${y0+rh}" fill="#EFF1EE" stroke="#C9CFD4"/>`;
    /* fradrag antydet som hvitt vindu på bakvegg hvis vegger males */
    if (r.f.vegg && r.fradrag>0) s+=`<rect x="${x0+dp+30}" y="${y0+dp+24}" width="46" height="38" fill="#fff" stroke="#C9CFD4"/>`;
    s+=`<text x="${W/2}" y="${H-14}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Maler ${r.f.navn} — ${fm1(r.totalAreal)} m²</text></svg>`;
    $("mi-planSvg").innerHTML=s;
  }

  function init(){
    ["mi-lengde","mi-bredde","mi-hoyde","mi-fradrag","mi-strok","mi-dekkevne","mi-sparkel"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-innemaling [data-flate]").forEach(b=>b.addEventListener("click",()=>{
      st.flate=b.dataset.flate;
      document.querySelectorAll("#view-innemaling [data-flate]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    document.querySelectorAll("#view-innemaling [data-underlag]").forEach(b=>b.addEventListener("click",()=>{
      st.underlag=b.dataset.underlag;
      document.querySelectorAll("#view-innemaling [data-underlag]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("mi-copyBtn").addEventListener("click",()=>copy(liste,$("mi-copyStatus")));
    $("mi-priserBtn").addEventListener("click",()=>PriceModal.open(MI.products, "Maling innvendig"));
    $("mi-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("innemaling","Maling innvendig",readForm("innemaling"),MI.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= FLIS TIL BAD ========================= */
const FB = (()=>{
  /* Forbruk etter flisstørrelse (leverandørnormer):
     lim ~2/4,5/7 kg/m², fug ~1,8/1,0/0,6 kg/m² (skaleres med fugebredde), svinn 8/10/15 %.
     Smøremembran ~2 strøk, spann dekker ca. 5 m². Membranremse i alle hjørner og rundt sluk/rør. */
  const STR = {
    mosaikk:    {navn:"Mosaikk/liten", lim:3.0, fug:1.8, svinn:0.08, tann:"6 mm"},
    standard:   {navn:"Standard 20–30 cm", lim:4.5, fug:1.0, svinn:0.10, tann:"8–10 mm"},
    storformat: {navn:"Storformat", lim:7.0, fug:0.6, svinn:0.15, tann:"10–12 mm"},
  };
  const LIM_SEKK=20, FUG_POSE=5, MEMBRAN_DEKK=5, PRIMER_DEKK=8;
  const st = {storrelse:"standard", priser:{}};
  let liste = "";

  function beregn(){
    const L=Math.max(0.5,parseFloat($("fb-lengde").value)||0), B=Math.max(0.5,parseFloat($("fb-bredde").value)||0);
    const flishoyde=Math.max(0,parseFloat($("fb-flishoyde").value)||0);
    const fradrag=Math.max(0,parseFloat($("fb-fradrag").value)||0);
    const fugebredde=Math.max(1,parseFloat($("fb-fugebredde").value)||3);
    const membran=$("fb-membran").checked;
    const s=STR[st.storrelse];

    const gulvAreal=+(L*B).toFixed(2);
    const omkrets=2*(L+B);
    const veggAreal=flishoyde>0 ? +Math.max(0,omkrets*flishoyde-fradrag).toFixed(2) : 0;
    const totalAreal=+(gulvAreal+veggAreal).toFixed(2);

    const fliserM2=Math.ceil(totalAreal*(1+s.svinn));
    const limKg=Math.ceil(totalAreal*s.lim);
    const limSekk=Math.max(1,Math.ceil(limKg/LIM_SEKK));
    const fugKg=Math.ceil(totalAreal*s.fug*(fugebredde/3));
    const fugPose=Math.max(1,Math.ceil(fugKg/FUG_POSE));

    /* Membran: gulv + veggflis-areal (våtsone bak fliser), 2 strøk */
    const membranAreal=membran ? totalAreal : 0;
    const membranSpann=membran ? Math.max(1,Math.ceil(membranAreal/MEMBRAN_DEKK)) : 0;
    const remseLm=membran ? Math.ceil(omkrets + 4*flishoyde + 6) : 0;   // gulv/vegg-skjøt + loddrette hjørner + sluk/rør
    const primerL=membran ? Math.max(1,Math.ceil(membranAreal/PRIMER_DEKK)) : 0;

    const silikon=Math.max(1,Math.ceil((omkrets + 4*flishoyde)/8));
    const kryssPk=Math.max(1,Math.ceil(totalAreal/12));
    return {L,B,flishoyde,fradrag,fugebredde,membran,s,gulvAreal,omkrets,veggAreal,totalAreal,
            fliserM2,limKg,limSekk,fugKg,fugPose,membranAreal,membranSpann,remseLm,primerL,silikon,kryssPk};
  }

  function render(){
    const r=beregn();

    $("fb-regelsjekk").innerHTML =
      `<div class="alert warn"><b>Fagansvar:</b> rørarbeid skal utføres av registrert rørlegger og elektrisk arbeid av autorisert elektriker — uansett hvem som gjør resten. Dette er lovpålagt.</div>`
      + (r.membran
        ? `<div class="alert ok" style="margin-top:.5rem"><b>Våtromsnorm:</b> membran med forsterkningsremser i alle hjørner, gulv/vegg-skjøter og rundt sluk og rørgjennomføringer er lagt inn. Fall til sluk minst 1:50 i dusjsonen.</div>`
        : `<div class="alert warn" style="margin-top:.5rem"><b>Uten membran:</b> et bad uten godkjent membran er ikke et lovlig våtrom, og forsikringen dekker normalt ikke vannskade. Membran anbefales sterkt.</div>`)
      + `<div class="alert" style="margin-top:.5rem"><b>Dokumentér arbeidet:</b> ta bilder av membranen før flisene legges, og ta vare på produktdatablad — kreves ved salg og forsikringsoppgjør.</div>`;

    const steps=[
      {t:`Gulv ${fm1(r.L)} × ${fm1(r.B)} m = ${fm1(r.gulvAreal)} m²${r.veggAreal?` + vegg ${fm1(r.veggAreal)} m² (${fm1(r.omkrets)} m × ${fm1(r.flishoyde)} m − ${fm1(r.fradrag)} m²)`:""} → <b>${fm1(r.totalAreal)} m² flis</b>`,
       s:`${r.flishoyde>0?"gulv og vegg":"kun gulv"} — bestill <b>${r.fliserM2} m²</b> inkl. ${Math.round(r.s.svinn*100)} % svinn (${r.s.navn.toLowerCase()})`},
      {t:`Flislim <b>${r.limKg} kg</b> (${r.limSekk} sekker) med ${r.s.tann} tannsparkel`,
       s:`${r.s.navn} bruker ~${String(r.s.lim).replace(".",",")} kg/m² — storformat og ujevnt underlag krever mest`},
      {t:`Fugemasse <b>${r.fugKg} kg</b> (${r.fugPose} poser) ved ${String(r.fugebredde).replace(".",",")} mm fuge`,
       s:`små fliser gir mer fugelengde, store gir mindre — skalert etter fugebredden`},
      ...(r.membran?[
      {t:`Membran <b>${r.membranSpann} spann</b> over ${fm1(r.membranAreal)} m² + remser <b>${fmt(r.remseLm)} lm</b> + primer <b>${r.primerL} l</b>`,
       s:`2 strøk smøremembran · remse i hvert hjørne, gulv/vegg-skjøt og rundt sluk/rør · mansjetter på gjennomføringer`}]:[]),
      {t:`Våtromssilikon <b>${r.silikon} tuber</b> · flisekryss ${r.kryssPk} pk`,
       s:`silikon i alle innvendige hjørner og mot sanitær — aldri fugemasse der det beveger seg`},
    ];
    $("fb-dimSteps").innerHTML=steps.map((s,i)=>`<div class="dim-step"><span class="no">${i+1}</span><div>${s.t}<span class="src">${s.s}</span></div></div>`).join("");

    const P=st.priser;
    const rows=[
      Catalog.make("fliser_bad", r.fliserM2, {sourceTool:"flis",
        note:`${fm1(r.totalAreal)} m² + ${Math.round(r.s.svinn*100)} % svinn — velg flis fritt, sjekk at gulvflis er sklisikker (R10+)`, estPrice:P.fliser_bad}),
      Catalog.make("flislim_20kg", r.limSekk, {sourceTool:"flis",
        note:`${r.limKg} kg — bruk flekslim/C2 i våtrom`, estPrice:P.flislim_20kg}),
      Catalog.make("fugemasse_5kg", r.fugPose, {sourceTool:"flis",
        note:`${r.fugKg} kg ved ${String(r.fugebredde).replace(".",",")} mm fuge`, estPrice:P.fugemasse_5kg}),
    ];
    if (r.membran){
      rows.push(Catalog.make("smoremembran", r.membranSpann, {sourceTool:"flis",
        note:`2 strøk over ${fm1(r.membranAreal)} m² gulv og våtsonevegger`, estPrice:P.smoremembran}));
      rows.push(Catalog.make("membranremse", r.remseLm, {sourceTool:"flis",
        note:`hjørner, gulv/vegg-skjøt og rundt sluk/rør — legges i første membranstrøk`, estPrice:P.membranremse}));
      rows.push(Catalog.make("membranprimer", r.primerL, {sourceTool:"flis",
        note:`grunn underlaget før membranen`, estPrice:P.membranprimer}));
    }
    rows.push(Catalog.make("vatromssilikon", r.silikon, {sourceTool:"flis",
        note:`innvendige hjørner og mot sanitær`, estPrice:P.vatromssilikon}));
    rows.push(Catalog.make("flisekryss", r.kryssPk, {sourceTool:"flis",
        note:`for jevne fuger — kiler holder store fliser i flukt`, estPrice:P.flisekryss}));
    rows.push(Catalog.make("tannsparkel_flis", 1, {sourceTool:"flis",
        note:`${r.s.tann} tenner passer flisstørrelsen`, estPrice:P.tannsparkel_flis}));

    FB.products = rows;   // eksponert for "Finn priser"-modalen og fremtidig CSV/PDF-eksport
    $("fb-matTable").querySelector("tbody").innerHTML = Renderer.renderRows(rows) + Renderer.renderSumRow(rows);
    $("fb-matTable").querySelectorAll("input.price").forEach(inp=>inp.addEventListener("change",e=>{
      st.priser[e.target.dataset.key]=Math.max(0,parseFloat(e.target.value)||0); render();
    }));

    $("fb-stats").innerHTML=`
      <div class="stat"><b>${fm1(r.totalAreal)}</b><small>m² flis</small></div>
      <div class="stat"><b>${r.fliserM2}</b><small>m² å bestille</small></div>
      <div class="stat"><b>${r.limSekk}</b><small>sekker lim</small></div>
      <div class="stat"><b>${r.fugPose}</b><small>poser fug</small></div>
      ${r.membran?`<div class="stat"><b>${r.membranSpann}</b><small>spann membran</small></div>`:``}`;

    $("fb-notes").innerHTML=[
      `Verktøyet låser deg ikke til et produkt: velg flis, lim og membran fritt — men hold deg til ett godkjent membransystem, blanding av fabrikat kan velte reklamasjonsretten.`,
      `Gulvflis skal være sklisikker (R10 eller høyere i våtsone) — sjekk R-verdien før du bestiller.`,
      `Bygg fallet i gulvet mot sluk før membranen — minst 1:50 i dusjsonen, ellers blir det stående vann.`,
      `Legg membranremse i alle hjørner og bruk mansjetter rundt sluk og rør — det er her lekkasjer nesten alltid starter.`,
      `Legg en helflis synlig og de kappede mot minst synlige hjørne. Tørrlegg raden først for å unngå en smal stripe til slutt.`,
      `La membranen tørke helt (følg databladet) før du limer — og lim aldri gjennom membranen.`,
    ].map(n=>`<li>${n}</li>`).join("");

    tegn(r);
    liste = Renderer.toPlainText(rows, [
      `BESTILLINGSLISTE — Flis til bad ${fm1(r.totalAreal)} m² (${r.s.navn.toLowerCase()})`,
      `Gulv ${fm1(r.L)} × ${fm1(r.B)} m${r.flishoyde?` + vegg ${fm1(r.flishoyde)} m`:""} · ${r.membran?"med membran":"UTEN membran (se regelsjekk)"} · rør/el av fagperson`,
    ]);
  }

  /* Flateoversikt: gulv sett ovenfra med sluk, veggflis antydet som ramme */
  function tegn(r){
    const W=660,PAD=54,sk=Math.min((W-2*PAD)/r.L,220/r.B);
    const bw=r.L*sk,bh=r.B*sk,Hsvg=bh+2*PAD+14,x0=(W-bw)/2,y0=PAD;
    let s=`<svg viewBox="0 0 ${W} ${Hsvg}" role="img" aria-label="Baderomsgulv ${fm1(r.gulvAreal)} m²${r.membran?" med membran":""}">`;
    /* membran-sone (litt utenfor flisen) */
    if (r.membran) s+=`<rect x="${x0-8}" y="${y0-8}" width="${bw+16}" height="${bh+16}" fill="#3B8BC4" opacity=".25" stroke="#3B8BC4" stroke-width="1.5" rx="3"/>`;
    /* gulvflis-rutenett */
    s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="#E6D9B8" stroke="#8E979E"/>`;
    const rute = r.s===STR.mosaikk ? 0.1 : r.s===STR.storformat ? 0.6 : 0.3;
    for(let x=x0+rute*sk;x<x0+bw-1;x+=rute*sk) s+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+bh}" stroke="#C9CFD4" stroke-width="1"/>`;
    for(let y=y0+rute*sk;y<y0+bh-1;y+=rute*sk) s+=`<line x1="${x0}" y1="${y}" x2="${x0+bw}" y2="${y}" stroke="#C9CFD4" stroke-width="1"/>`;
    /* sluk + fallpiler */
    const sx=x0+bw*0.5, sy=y0+bh*0.62;
    s+=`<circle cx="${sx}" cy="${sy}" r="${Math.min(bw,bh)*0.06}" fill="#1C2A33"/><circle cx="${sx}" cy="${sy}" r="${Math.min(bw,bh)*0.03}" fill="#4A5A64"/>`;
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy])=>{
      s+=`<line x1="${sx+dx*bw*0.28}" y1="${sy+dy*bh*0.24}" x2="${sx+dx*bw*0.10}" y2="${sy+dy*bh*0.09}" stroke="#C24C0A" stroke-width="1.5"/>`;
    });
    s+=`<text x="${sx}" y="${sy-Math.min(bw,bh)*0.09}" font-size="10" text-anchor="middle" fill="#C24C0A" font-family="Inter,sans-serif">fall til sluk 1:50</text>`;
    s+=`<text x="${x0+bw/2}" y="${y0+bh+30}" font-size="12" text-anchor="middle" fill="#1C2A33" font-family="Inter" font-weight="600">Gulv ${fm1(r.L)} × ${fm1(r.B)} m = ${fm1(r.gulvAreal)} m²${r.veggAreal?` · + ${fm1(r.veggAreal)} m² vegg`:""}</text></svg>`;
    $("fb-planSvg").innerHTML=s;
  }

  function init(){
    ["fb-lengde","fb-bredde","fb-flishoyde","fb-fradrag","fb-fugebredde","fb-membran"].forEach(id=>{
      $(id).addEventListener("input",render); $(id).addEventListener("change",render);
    });
    document.querySelectorAll("#view-flis [data-storrelse]").forEach(b=>b.addEventListener("click",()=>{
      st.storrelse=b.dataset.storrelse;
      document.querySelectorAll("#view-flis [data-storrelse]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render();
    }));
    $("fb-copyBtn").addEventListener("click",()=>copy(liste,$("fb-copyStatus")));
    $("fb-priserBtn").addEventListener("click",()=>PriceModal.open(FB.products, "Flis til bad"));
    $("fb-lagreBtn").addEventListener("click",()=>Projects.openSaveModal("flis","Flis til bad",readForm("flis"),FB.products));
    render();
  }
  return {init, products:[]};
})();

/* ========================= Oppstart =========================
   Verktøysidene (terrasse.html, parkett.html …) inneholder bare sin egen
   visning, mens index.html har alle. Vi starter derfor kun de modulene som
   faktisk har markup i dokumentet. */
[["terrasse",TE], ["dryppstop",DS], ["rekkverk",RK], ["parkett",PK],
 ["kledning",KL], ["levegg",LV], ["pergola",PG], ["utemaling",ML],
 ["belegningsstein",BS], ["plen",PL], ["gjerde",GJ], ["innemaling",MI], ["flis",FB]
].forEach(([id, mod])=>{ if (document.getElementById("view-"+id)) mod.init(); });

if (window.ShopCompare && document.getElementById("view-terrasse"))
  ShopCompare.mount("te", ()=>TE.products);

route();   // ren URL → forsiden; #terrasse / #dryppstop / … / #innemaling / #flis → riktig verktøy