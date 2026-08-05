/* ============================================================================
   TOMMESTOKK1 — BUTIKKSAMMENLIGNING (logikklag)
   ============================================================================
   Ren logikk: ingen DOM, ingen mockdata. Kan kjøres i nettleser og i test.

   Lagdeling
     Provider-grensesnitt   StoreProvider / ProductDataProvider /
                            PriceProvider / InventoryProvider
     ProductMatcher         generisk materialbehov → butikkprodukt
     LineCalculator         ÉN felles beregning brukt av alle butikker
     StoreQuote             hele handlelisten priset hos én butikk
     Ranking                billigst / nærmest / komplett / dekning

   Datakilder byttes ved å sende en annen provider inn i createEngine().
   Mockdata ligger i retail-mockdata.js og er ikke kjent for dette laget.
   ========================================================================= */
(function (root) {
  "use strict";

  /* ======================= Konstanter ======================= */

  /** Kategorier der feil produkt får konstruksjons- eller sikkerhetsmessige
   *  konsekvenser. Alternative produkter her må godkjennes av brukeren. */
  const KRITISKE_KATEGORIER = [
    "terrassebjelke", "baerebjelke", "stolpe", "konstruksjonsvirke",
    "beslag", "festemiddel", "skrue", "bolt",
    "membran", "isolasjon", "fundament", "duk",
  ];

  const MATCH_IDENTISK   = "identisk";
  const MATCH_LIKEVERDIG = "likeverdig";
  const MATCH_ALTERNATIV = "alternativ";

  const LAGER = {
    PA_LAGER:   "pa_lager",
    BEGRENSET:  "begrenset",
    IKKE_NOK:   "ikke_nok",
    IKKE_PA_LAGER: "ikke_pa_lager",
    UKJENT:     "ukjent",
  };

  const LAGER_TEKST = {
    [LAGER.PA_LAGER]:      "På lager",
    [LAGER.BEGRENSET]:     "Begrenset lager",
    [LAGER.IKKE_NOK]:      "Ikke nok på lager",
    [LAGER.IKKE_PA_LAGER]: "Ikke på lager",
    [LAGER.UKJENT]:        "Lagerstatus ukjent",
  };

  /** Data eldre enn dette regnes som utdatert og merkes i UI-et. */
  const UTDATERT_ETTER_DAGER = 14;
  /** Lager under dette forholdstallet over behovet regnes som "begrenset". */
  const BEGRENSET_FAKTOR = 1.25;

  /* ======================= Hjelpere ======================= */

  function haversineKm(a, b) {
    if (!a || !b) return null;
    const R = 6371, rad = d => d * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return +(2 * R * Math.asin(Math.sqrt(s))).toFixed(1);
  }

  function daysSince(iso, now) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return ((now ? now.getTime() : Date.now()) - t) / 86400000;
  }

  function isCritical(category) {
    return KRITISKE_KATEGORIER.includes(String(category || "").toLowerCase());
  }

  /* ======================= Provider-grensesnitt =======================
     Et provider-objekt må tilby disse metodene. MockRetailDataProvider
     under er referanseimplementasjonen; en NOBB- eller kjedeadapter
     implementerer samme signaturer og kan settes rett inn.

       StoreProvider:        getRetailers(), getStores(), resolvePostalCode(nr)
       ProductDataProvider:  getProduct(id), getMatches(genericId)
       PriceProvider:        getOffer(storeId, productId)
       InventoryProvider:    inngår i getOffer() (stockQuantity/lastUpdated)
       meta:                 {dataSource, isLive, label}
     =================================================================== */

  function createMockProvider(data) {
    const stores    = data.stores;
    const retailers = data.retailers;
    const byProduct = Object.fromEntries(data.products.map(p => [p.id, p]));
    const offerKey  = (s, p) => s + "|" + p;
    const byOffer   = Object.fromEntries(data.offers.map(o => [offerKey(o.storeId, o.retailerProductId), o]));
    const byGeneric = {};
    data.matches.forEach(m => {
      (byGeneric[m.genericMaterialId] = byGeneric[m.genericMaterialId] || []).push(m);
    });

    return {
      meta: data.meta,
      /* StoreProvider */
      getRetailers: () => retailers.slice(),
      getStores:    () => stores.slice(),
      resolvePostalCode(nr) {
        const key = String(nr || "").trim();
        const hit = data.postalCodes[key];
        return hit ? Object.assign({ postnummer: key }, hit) : null;
      },
      /* ProductDataProvider */
      getProduct:  id => byProduct[id] || null,
      getMatches:  genericId => (byGeneric[genericId] || []).slice(),
      /* PriceProvider + InventoryProvider */
      getOffer: (storeId, productId) => byOffer[offerKey(storeId, productId)] || null,
    };
  }

  /* ======================= Materialbehov =======================
     Bygger GenericMaterialRequirement fra kalkulatorenes Product[].
     Merk: Product.quantity inneholder ALLEREDE svinn der kalkulatoren har
     lagt det til. Svinn skal derfor aldri ganges på her — vi leser bare
     råbehovet fra product.need når kalkulatoren har oppgitt det.
     =========================================================== */

  function toRequirement(product) {
    const need = product.need || null;
    return {
      id: product.id,
      category: product.category || "",
      name: product.title || product.id,
      dimensions: product.dimensions || null,
      requiredProperties: {
        dimensjon: product.dimensions || null,
        kvalitet:  product.quality || null,
        behandling: product.treatment || null,
      },
      /** Mengde inkludert svinn, i quantityUnit. */
      requiredQuantity: product.quantity,
      quantityUnit: product.unit,
      /** Råbehov før svinn (samme enhet som baseUnit). */
      baseQuantity: need ? need.quantity : product.quantity,
      baseUnit:     need ? need.unit     : product.unit,
      wastePercentage: need ? (need.wastePercentage || 0) : 0,
      note: product.note || "",
      lookup: product.lookup || {},
      estPrice: product.estPrice ?? null,
    };
  }

  /* ======================= ProductMatcher ======================= */

  const ProductMatcher = {
    /** Slår opp matcher fra provideren og velger beste kandidat for én butikk. */
    resolve(provider, requirement, store) {
      const kandidater = provider.getMatches(requirement.id)
        .map(m => {
          const produkt = provider.getProduct(m.retailerProductId);
          if (!produkt || produkt.retailerId !== store.retailerId) return null;
          const tilbud = provider.getOffer(store.id, produkt.id);
          if (!tilbud) return null;
          return { match: this.decorate(m, requirement), produkt, tilbud };
        })
        .filter(Boolean);

      if (!kandidater.length) return null;
      // Beste match: høyest matchScore, identisk foran likeverdig foran alternativ.
      const rang = { [MATCH_IDENTISK]: 3, [MATCH_LIKEVERDIG]: 2, [MATCH_ALTERNATIV]: 1 };
      kandidater.sort((a, b) =>
        (rang[b.match.matchType] - rang[a.match.matchType]) ||
        (b.match.matchScore - a.match.matchScore));
      return kandidater[0];
    },

    /** Fyller ut requiresApproval ut fra kategori og matchtype. */
    decorate(match, requirement) {
      const alternativ = match.matchType === MATCH_ALTERNATIV;
      return Object.assign({}, match, {
        differences: match.differences || [],
        requiresApproval: match.requiresApproval != null
          ? match.requiresApproval
          : (alternativ && isCritical(requirement.category)),
      });
    },

    /** Klassifiserer en match ut fra rådata — brukes når ekte feed mangler
     *  ferdige ProductMatch-rader (NOBB/GTIN → identisk, egenskaper → likeverdig). */
    classify(requirement, produkt) {
      const nobb = requirement.lookup && requirement.lookup.nobb;
      const ean  = requirement.lookup && requirement.lookup.ean;
      if ((nobb && produkt.nobbNumber && nobb === produkt.nobbNumber) ||
          (ean && produkt.gtin && ean === produkt.gtin)) {
        return { matchType: MATCH_IDENTISK, matchScore: 1, differences: [] };
      }
      const differences = [];
      const krav = requirement.requiredProperties || {};
      const egen = produkt.properties || {};
      if (krav.dimensjon && produkt.width && produkt.thickness) {
        const faktisk = `${produkt.thickness}x${produkt.width}`;
        if (krav.dimensjon !== faktisk) differences.push(`Dimensjon ${faktisk} mot ${krav.dimensjon}`);
      }
      if (krav.behandling && egen.behandling &&
          !String(egen.behandling).toLowerCase().includes(String(krav.behandling).toLowerCase())) {
        differences.push(`Behandling ${egen.behandling} mot ${krav.behandling}`);
      }
      const type = differences.length ? MATCH_ALTERNATIV : MATCH_LIKEVERDIG;
      return { matchType: type, matchScore: differences.length ? 0.7 : 0.9, differences };
    },
  };

  /* ======================= LineCalculator =======================
     ÉN felles beregning for alle butikker. Regner reell prosjektkostnad,
     ikke stykkpris: behov + svinn → produktlengde/pakning → hele enheter.
     =========================================================== */

  function unitsNeeded(requirement, produkt) {
    const total = requirement.requiredQuantity;         // inkl. svinn
    const pkg   = produkt.packageQuantity || 1;

    // Pakkevare der kalkulatoren kjenner råantallet (f.eks. 576 skruer):
    // regn mot butikkens faktiske pakningsstørrelse, ikke katalogens.
    if (pkg > 1 && requirement.baseUnit === "stk" && requirement.baseQuantity > 0) {
      return { units: Math.ceil(requirement.baseQuantity / pkg), basis: "pakning",
               forklaring: `${fmtNum(requirement.baseQuantity)} stk ÷ ${pkg} per pakke` };
    }
    // Løpemeter mot en fysisk produktlengde (f.eks. 4,8 m bord):
    if (requirement.quantityUnit === "lm" && produkt.length > 0) {
      return { units: Math.ceil(total / produkt.length), basis: "lengde",
               forklaring: `${fmtNum(total)} lm ÷ ${fmtNum(produkt.length)} m per ${produkt.salesUnit}` };
    }
    // Kvadratmeter mot dekning per enhet:
    if (requirement.quantityUnit === "m2" && produkt.coverage > 0) {
      return { units: Math.ceil(total / produkt.coverage), basis: "dekning",
               forklaring: `${fmtNum(total)} m² ÷ ${fmtNum(produkt.coverage)} m² per ${produkt.salesUnit}` };
    }
    // Stykk/pakke mot samme enhet:
    if (pkg > 1) {
      return { units: Math.ceil(total / pkg), basis: "pakning",
               forklaring: `${fmtNum(total)} ÷ ${pkg} per pakke` };
    }
    return { units: Math.ceil(total), basis: "stk",
             forklaring: `${fmtNum(total)} ${requirement.quantityUnit} avrundet opp` };
  }

  function stockStatusFor(stockQuantity, units) {
    if (stockQuantity == null) return LAGER.UKJENT;
    if (stockQuantity <= 0)    return LAGER.IKKE_PA_LAGER;
    if (stockQuantity < units) return LAGER.IKKE_NOK;
    if (stockQuantity < units * BEGRENSET_FAKTOR) return LAGER.BEGRENSET;
    return LAGER.PA_LAGER;
  }

  /** Beregner én varelinje hos én butikk. Returnerer alltid et objekt —
   *  manglende match/pris/lager gis som tilstand, ikke som unntak. */
  function calculateLine(requirement, kandidat, opts) {
    const now = (opts && opts.now) || new Date();
    const base = {
      requirement,
      genericId: requirement.id,
      name: requirement.name,
      category: requirement.category,
      dimensions: requirement.dimensions,
      baseQuantity: requirement.baseQuantity,
      baseUnit: requirement.baseUnit,
      wastePercentage: requirement.wastePercentage,
      totalNeed: requirement.requiredQuantity,
      totalNeedUnit: requirement.quantityUnit,
    };

    if (!kandidat) {
      return Object.assign(base, {
        matched: false, issue: "ingen_match",
        issueText: "Produkt kunne ikke matches i denne butikken",
        units: null, unitPrice: null, lineSum: null,
        stockStatus: LAGER.UKJENT, stockQuantity: null,
        sufficient: false, requiresApproval: false,
      });
    }

    const { produkt, tilbud, match } = kandidat;
    const { units, basis, forklaring } = unitsNeeded(requirement, produkt);
    const unitPrice = tilbud.campaignPrice != null ? tilbud.campaignPrice : tilbud.price;
    const harPris = unitPrice != null && !Number.isNaN(unitPrice);
    const stockStatus = stockStatusFor(tilbud.stockQuantity, units);
    const alder = daysSince(tilbud.lastUpdated, now);

    return Object.assign(base, {
      matched: true,
      produkt, tilbud, match,
      matchType: match.matchType,
      requiresApproval: !!match.requiresApproval,
      differences: match.differences || [],
      units,
      unitsBasis: basis,
      unitsForklaring: forklaring,
      salesUnit: produkt.salesUnit,
      packageQuantity: produkt.packageQuantity || 1,
      productLength: produkt.length || null,
      unitPrice: harPris ? unitPrice : null,
      campaign: tilbud.campaignPrice != null,
      previousPrice: tilbud.previousPrice != null ? tilbud.previousPrice : null,
      lineSum: harPris ? unitPrice * units : null,
      stockQuantity: tilbud.stockQuantity,
      stockStatus,
      stockText: LAGER_TEKST[stockStatus],
      shortfallText: stockStatus === LAGER.IKKE_NOK
        ? `Trenger ${units} – ${tilbud.stockQuantity} på lager` : null,
      sufficient: stockStatus === LAGER.PA_LAGER || stockStatus === LAGER.BEGRENSET,
      lastUpdated: tilbud.lastUpdated,
      dataSource: tilbud.dataSource,
      isLive: !!tilbud.isLive,
      stale: alder != null && alder > UTDATERT_ETTER_DAGER,
      productUrl: produkt.productUrl || null,
      issue: !harPris ? "mangler_pris" : null,
      issueText: !harPris ? "Pris mangler for dette produktet" : null,
    });
  }

  /* ======================= StoreQuote ======================= */

  /** Priser hele handlelisten hos én butikk. */
  function quoteStore(provider, requirements, store, opts) {
    opts = opts || {};
    const retailer = provider.getRetailers().find(r => r.id === store.retailerId) || null;
    const lines = requirements.map(req =>
      calculateLine(req, ProductMatcher.resolve(provider, req, store), opts));

    const linjerMedPris   = lines.filter(l => l.lineSum != null);
    const subtotal        = linjerMedPris.reduce((s, l) => s + l.lineSum, 0);
    const manglerPris     = lines.filter(l => l.matched && l.unitPrice == null);
    const ikkeMatchet     = lines.filter(l => !l.matched);
    const tilstrekkelig   = lines.filter(l => l.sufficient);
    const utilstrekkelig  = lines.filter(l => l.matched && !l.sufficient && l.stockStatus !== LAGER.UKJENT);
    const ukjentLager     = lines.filter(l => l.matched && l.stockStatus === LAGER.UKJENT);
    const kreverGodkjenning = lines.filter(l => l.requiresApproval);
    const utdaterte       = lines.filter(l => l.stale);

    const coveragePct = lines.length ? Math.round(tilstrekkelig.length / lines.length * 100) : 0;
    const isComplete  = lines.length > 0 &&
                        tilstrekkelig.length === lines.length &&
                        manglerPris.length === 0 &&
                        ikkeMatchet.length === 0;

    const eldsteOppdatering = lines
      .map(l => l.lastUpdated).filter(Boolean)
      .sort()[0] || null;

    return {
      store, retailer,
      lines,
      lineCount: lines.length,
      linesInStock: tilstrekkelig.length,
      linesMissing: utilstrekkelig.length + ikkeMatchet.length,
      linesUnknownStock: ukjentLager.length,
      linesWithoutPrice: manglerPris.length,
      linesUnmatched: ikkeMatchet.length,
      linesNeedingApproval: kreverGodkjenning.length,
      linesStale: utdaterte.length,
      subtotal,
      shippingFee: store.shippingFee != null ? store.shippingFee : null,
      total: subtotal,                       // frakt holdes utenfor totalen (hentes i butikk)
      coveragePct,
      isComplete,
      priceIsPartial: manglerPris.length > 0 || ikkeMatchet.length > 0,
      distanceKm: opts.origin ? haversineKm(opts.origin, store) : null,
      lastUpdated: eldsteOppdatering,
      dataSource: provider.meta ? provider.meta.dataSource : null,
      isLive: provider.meta ? !!provider.meta.isLive : false,
    };
  }

  /* ======================= Rangering ======================= */

  const Ranking = {
    /** Billigste varehus uavhengig av manglende varer. */
    cheapest(quotes) {
      return quotes.slice().sort((a, b) => a.total - b.total);
    },
    /** Billigste varehus som har alt på lager. */
    cheapestComplete(quotes) {
      return quotes.filter(q => q.isComplete).sort((a, b) => a.total - b.total);
    },
    /** Nærmeste varehus (ukjent avstand havner bakerst). */
    nearest(quotes) {
      return quotes.slice().sort((a, b) =>
        (a.distanceKm == null ? Infinity : a.distanceKm) -
        (b.distanceKm == null ? Infinity : b.distanceKm));
    },
    /** Nærmeste varehus som har alt på lager. */
    nearestComplete(quotes) {
      return Ranking.nearest(quotes.filter(q => q.isComplete));
    },
    /** Best lagerdekning — brukes når ingen butikk er komplett. */
    bestCoverage(quotes) {
      return quotes.slice().sort((a, b) =>
        (b.coveragePct - a.coveragePct) || (a.total - b.total));
    },
    /** Prisforskjell mot billigste alternativ, i kroner. */
    priceDiffs(quotes) {
      const billigst = Math.min(...quotes.map(q => q.total));
      return quotes.map(q => ({ storeId: q.store.id, diff: q.total - billigst, isCheapest: q.total === billigst }));
    },
    diffFromCheapest(quote, quotes) {
      const billigst = Math.min(...quotes.map(q => q.total));
      return quote.total - billigst;
    },
  };

  /* ======================= Motor ======================= */

  /** Bygger motoren rundt en valgfri provider. Bytt provider → bytt datakilde. */
  function createEngine(provider) {
    return {
      provider,
      meta: provider.meta,

      requirementsFrom(products) {
        return (products || [])
          .filter(p => p && p.quantity > 0)
          .map(toRequirement);
      },

      resolveOrigin(postnummer) {
        const treff = provider.resolvePostalCode(postnummer);
        if (!treff) return { ok: false, error: "ugyldig_postnummer",
          errorText: `Fant ikke postnummer ${postnummer} i testdataene` };
        return { ok: true, origin: treff };
      },

      /** Priser handlelisten hos alle butikker. */
      quoteAll(requirements, opts) {
        opts = opts || {};
        const stores = provider.getStores()
          .filter(s => !opts.retailerId || s.retailerId === opts.retailerId);
        if (!stores.length) {
          return { ok: false, error: "ingen_butikker", errorText: "Ingen butikker funnet", quotes: [] };
        }
        if (!requirements.length) {
          return { ok: false, error: "tom_liste", errorText: "Handlelisten er tom", quotes: [] };
        }
        const quotes = stores.map(s => quoteStore(provider, requirements, s, opts));
        const komplette = quotes.filter(q => q.isComplete);
        return {
          ok: true,
          quotes,
          anyComplete: komplette.length > 0,
          bestCoverage: Ranking.bestCoverage(quotes)[0] || null,
          meta: provider.meta,
        };
      },

      quoteStore: (requirements, store, opts) => quoteStore(provider, requirements, store, opts),
      Ranking,
    };
  }

  /* ======================= Formattering (delt) ======================= */

  function fmtNum(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const rounded = Math.round(n * 10) / 10;
    return rounded.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  }
  function fmtKr(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Math.round(n).toLocaleString("nb-NO") + " kr";
  }
  function fmtKm(n) {
    if (n == null) return "ukjent avstand";
    return n.toLocaleString("nb-NO", { maximumFractionDigits: 1 }) + " km";
  }
  function fmtKlokke(iso) {
    if (!iso) return "ukjent tidspunkt";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "ukjent tidspunkt";
    return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtDatoTid(iso) {
    if (!iso) return "ukjent tidspunkt";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "ukjent tidspunkt";
    return d.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
  }

  /* ======================= Eksport ======================= */

  const API = {
    createEngine, createMockProvider,
    ProductMatcher, Ranking,
    calculateLine, quoteStore, unitsNeeded, stockStatusFor, toRequirement,
    haversineKm, daysSince, isCritical,
    LAGER, LAGER_TEKST, KRITISKE_KATEGORIER,
    MATCH_IDENTISK, MATCH_LIKEVERDIG, MATCH_ALTERNATIV,
    UTDATERT_ETTER_DAGER, BEGRENSET_FAKTOR,
    fmt: { num: fmtNum, kr: fmtKr, km: fmtKm, klokke: fmtKlokke, datoTid: fmtDatoTid },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.TommestokkRetail = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
