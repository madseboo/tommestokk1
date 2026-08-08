# Tommestokk1

Byggekalkulatorer for deg som bygger selv. Legg inn mål, få komplett
materialliste, kappliste og handleliste — dimensjonert etter norske
spenntabeller og produsentenes monteringsregler.

Live på **https://tommestokk1.no**

## Viktig: kjør `build.py` før du committer

All redigering skjer i **`index.html`**. Verktøysidene (`terrasse.html`,
`parkett.html` …) og `app.js` er **generert** — rediger dem aldri direkte.

```bash
python3 build.py     # etter hver endring i index.html
```

Glemmer du dette, blir verktøysidene liggende igjen med gammelt innhold
mens forsiden er oppdatert.

Teksten på hver verktøyside redigeres i `ARTIKLER` øverst i `build.py`.

## Kjøre lokalt

```bash
python3 serve.py     # http://localhost:5173
```

Bruk `serve.py`, ikke `python3 -m http.server` — den etterligner Cloudflare
sin ruting, slik at `/terrasse` faktisk virker.

## Filer

| Fil | Rolle |
|---|---|
| `index.html` | **Kilden.** Forsiden + alle 13 verktøy, CSS og JS |
| `build.py` | Genererer verktøysidene og `app.js`. Fagtekstene bor her |
| `serve.py` | Lokal utviklingsserver med samme ruting som Cloudflare |
| `retail.js` | Butikksammenligning: logikk, matching, rangering (ingen DOM) |
| `retail-mockdata.js` | **Testdata** for butikksammenligning — byttes ved ekte integrasjon |
| `retail.tests.js` + `tests.html` | 36 tester for butikksammenligningen |
| `wrangler.jsonc` | Cloudflare-konfigurasjon. Må ligge på `main` for at deploy skal kjøre |
| `.assetsignore` | Hva som *ikke* publiseres (`.git`, `serve.py`, `build.py` …) |
| `supabase/schema.sql` | Databaseskjema med RLS-policyer |
| 13 × `*.html` | **Generert** av `build.py` — ikke rediger |
| `app.js` | **Generert** av `build.py` — ikke rediger |

## Arkitektur

**Én kilde, mange sider.** `index.html` inneholder alt og fungerer som SPA:
klikk på et verktøykort bytter visning uten sidelast. `build.py` klipper i
tillegg ut én statisk side per verktøy, med egen tittel, beskrivelse og
fagtekst i selve kildekoden — det er de sidene Google indekserer.

**Produktmodellen.** Hver kalkulator bygger `Product[]` via `Catalog`, aldri
HTML direkte. `Renderer` gjør listen om til tabell, tekst eller CSV. Derfor
kan samme liste brukes til utskrift, prosjektlagring og prisoppslag uten at
kalkulatorene endres.

**Butikksammenligning.** `retail.js` snakker kun med et provider-grensesnitt.
Å bytte fra testdata til NOBB eller en kjedefeed betyr å sende inn en annen
provider — UI og beregning er uendret.

## Designsystem (viktig å bevare)

- Farger, fonter og komponentklasser (`.card`, `.field`, `.segment`, `.btn`)
  er definert i `<style>` i `index.html` — gjenbruk dem, ikke lag nye mønstre.
- `color-scheme: light` må beholdes overalt — siden skal ikke endre utseende
  i mørk modus.
- Hver kalkulator er isolert i sin egen IIFE (`TE`, `DS`, `RK`, `PK` …) —
  følg samme mønster for nye verktøy.
- Status og regelsjekker må alltid stå som **tekst**, ikke bare farge.

## Priser og data

Prisene i materiallistene er **veiledende utgangspunkt**, redigerbare av
brukeren. Butikksammenligningen kjører på **testdata** og er merket som det
i UI-et. Ingenting hentes live fra byggevarekjedene ennå.

## Deploy

Push til `main` → Cloudflare bygger automatisk. Krever at `wrangler.jsonc`
ligger på `main`; uten den kjører ingen deploy.
