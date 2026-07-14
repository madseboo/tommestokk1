# Tommestokk1

Digitale verktøy for deg som bygger — terrasse, dryppstopp og rekkverk,
med bruker og prosjektlagring på vei.

## Status
- `index.html` — hele nettsiden (forside + tre verktøy), statisk, ingen backend ennå.
- Live på: https://tommestokk1.no via Cloudflare Pages.

## Neste steg (i denne rekkefølgen)

1. **Git + GitHub**
   ```
   git init
   git add .
   git commit -m "Første versjon: terrasse, dryppstopp, rekkverk"
   gh repo create tommestokk1 --public --source=. --push
   ```
   (Krever `gh auth login` første gang — gjøres av deg, ikke av Claude.)

2. **Cloudflare Pages**
   - Cloudflare-dashbord → Workers & Pages → Create → Pages → Connect to Git
   - Velg `tommestokk1`-repoet
   - Build command: (tom — statisk HTML)
   - Output-mappe: `/`
   - Custom domain: `tommestokk1.no`

3. **Supabase (bruker + prosjekter)**
   - Opprett prosjekt på supabase.com
   - Hent `Project URL` og `anon public key` fra Settings → API
   - Gi disse til Claude Code — de limes inn i en config-seksjon i `index.html`
     (de er trygge å ha i klientkoden; sikkerheten ligger i Row Level Security-reglene)

4. **Databaseskjema** (Claude Code setter opp via Supabase SQL-editor eller migrasjonsfil):
   - `projects`: id, user_id, navn, opprettet_at
   - `calculations`: id, project_id, verktoy ('terrasse'|'dryppstop'|'rekkverk'), inndata (jsonb), resultat (jsonb), opprettet_at
   - RLS-policy: bruker kan kun lese/skrive egne rader (via `auth.uid() = user_id`)

5. **Frontend-endringer i `index.html`**:
   - Innloggingsmodal (e-post/passord eller magisk lenke via Supabase Auth)
   - "Lagre i prosjekt"-knapp i hvert verktøy → lagrer inndata som JSON i `calculations`
   - Prosjektoversikt på forsiden når man er innlogget

## Designsystem (viktig å bevare)
- Farger, fonter og komponentklasser (`.card`, `.field`, `.segment`, `.btn` osv.)
  er definert i `<style>` i `index.html` — gjenbruk disse, ikke lag nye mønstre.
- `color-scheme: light` må beholdes overalt — siden skal ikke endre utseende i mørk modus.
- Hver kalkulator er isolert i sin egen IIFE (`TE`, `DS`, `RK`) — følg samme mønster
  for auth-logikk, f.eks. en egen `AUTH`-modul.
