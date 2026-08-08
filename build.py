#!/usr/bin/env python3
"""Genererer én statisk HTML-side per verktøy fra index.html.

Hvorfor: alle verktøyene bor i samme index.html. Uten dette steget serverer
/terrasse og /parkett byte-identisk HTML, og Google har ingen grunn til å
rangere dem på hver sin søkeintensjon. Skriptet klipper ut én visning per
side, setter tittel/beskrivelse/canonical i selve kildekoden, og legger på
en fagtekst som gjør siden reelt forskjellig.

Kjøres manuelt før commit — Cloudflare kjører ingen byggkommando:

    python3 build.py

Redigere teksten på en verktøyside? Se ARTIKLER nederst i denne filen.
"""
import html
import re
import sys
from pathlib import Path

ROT = Path(__file__).parent
KILDE = ROT / "index.html"


# ---------------------------------------------------------------- fagtekster
# Én oppføring per verktøy. "ingress" vises rett under beregneren,
# "seksjoner" er (overskrift, [avsnitt]) og blir <h3> + <p>.
ARTIKLER = {
"terrasse": {
  "ingress": "Terrassen er som regel det første større byggeprosjektet folk gjør selv. "
             "Det meste går bra — det som går galt, er nesten alltid bæresystemet under, "
             "ikke bordene du ser.",
  "seksjoner": [
    ("Slik regner verktøyet ut bjelkelaget", [
      "Bordtypen bestemmer alt nedstrøms. 28 mm bord tåler 600 mm senteravstand mellom "
      "terrassebjelkene, mens 21 mm bord krever 400 mm. Velger du tynnere bord for å spare "
      "penger, øker antall bjelker — og totalprisen kan bli høyere.",
      "Selve spennet hentes fra spenntabell for terrassebjelker i C24-kvalitet med "
      "dimensjonerende snølast 4,5 kN/m². En 48 × 148 klarer 2,3 m ved c/c 600, mens en "
      "48 × 198 klarer 3,1 m. Legges bjelkene i bjelkesko i stedet for oppå bærebjelken, "
      "ganges spennet med 0,9.",
      "Ut fra dybden på terrassen regnes antall bærebjelkelinjer, og ut fra bærebjelkens "
      "dimensjon hvor tett stolpene må stå. Verktøyet viser hvert steg, så du kan "
      "etterprøve tallene mot din egen tabell."]),
    ("Kappliste i standardlengder", [
      "Trelast selges i faste lengder — 3,0, 3,6, 4,2, 4,8, 5,4 og 6,0 meter. Verktøyet "
      "finner den korteste standardlengden som dekker behovet, slik at du slipper å kappe "
      "en halv meter av hver eneste bjelke.",
      "Er terrassen dypere enn 6 meter, må bjelkene skjøtes. Da får du beskjed om det, og "
      "skjøten skal ligge over en bærebjelke med lask på begge sider."]),
    ("Vanlige feil", [
      "Å spare på fundamentet er den dyreste feilen. Jordspyd holder for en lav platting, "
      "men en terrasse i høyde med last fra mennesker og møbler trenger frostfritt fundament.",
      "Husk 3–5 mm mellom bordene for svelling og drenering, og start med et helt bord "
      "ytterst — kapp mot veggen, ikke motsatt.",
      "Er fallhøyden over 0,5 meter, kreves rekkverk. Over 1,0 meter høyde er terrassen "
      "normalt søknadspliktig. Begge deler flagges av verktøyet."]),
  ]},

"dryppstop": {
  "ingress": "DryppStop gjør plassen under terrassen eller balkongen til tørr uteplass. "
             "Systemet er enkelt, men reklamasjonsretten forutsetter at du følger "
             "monteringsveiledningen og bruker riktige skruer og fugemasse.",
  "seksjoner": [
    ("Slik regnes platene", [
      "Platene er 60 × 160 cm og legges med 10 cm overlapp i fallretningen, slik at hver "
      "plate dekker 150 cm. Verktøyet regner antall felt ut fra senteravstanden mellom "
      "sperrene, og antall plater per felt ut fra lengden.",
      "Standard senteravstand er 60 cm, som passer platebredden. Har du tettere sperrer, "
      "må platene kappes i bredden, og du får mer kapp."]),
    ("Fall er ikke valgfritt", [
      "Kravet er minst 1,5 cm fall per meter. Med 4 meter lengde betyr det minimum 6 cm "
      "høydeforskjell fra vegg til ytterkant. Uten nok fall blir det stående vann i "
      "profilene, og systemet virker ikke som det skal."]),
    ("Med eller uten beslag", [
      "Med beslag slipper du å fuge profilene, forutsatt at raden er maks 3 meter og uten "
      "bærebjelke i spennet. Uten beslag må du regne rikelig med fugemasse — omtrent én "
      "tube per 20 meter profil, i tillegg til det som går med i plateskjøtene.",
      "Alu-profiler kan korrodere i saltholdig miljø. Bor du kystnært, er det verdt å "
      "sjekke hva leverandøren anbefaler."]),
  ]},

"rekkverk": {
  "ingress": "Rekkverk er det eneste på terrassen som er direkte sikkerhetskritisk. "
             "Kravene i TEK17 er konkrete, og de handler like mye om åpningene som om høyden.",
  "seksjoner": [
    ("Høyde etter fallhøyde", [
      "Er fallhøyden fra dekket over 0,5 meter, skal det være rekkverk. Kravet er minst "
      "1,0 meter høyde ved nivåforskjell inntil 10 meter, og 1,2 meter over det.",
      "Bygg gjerne 1–2 cm over kravet. Treverket setter seg, og kontrollmålet tas fra "
      "overkant ferdig dekke."]),
    ("Spileavstand er det folk bommer på", [
      "Åpninger skal aldri overstige 10 cm. Verktøyet dimensjonerer mot 98 mm for å ha "
      "byggemargin, og fordeler spilene helt jevnt innenfor hvert felt — så du ikke ender "
      "med en for vid åpning ved siste stolpe.",
      "Bruk kun vertikale spiler. Liggende spiler gjør rekkverket klatrbart for barn og "
      "bryter TEK17 § 12-15.",
      "Lag ett felt som mal, kontrollmål lysåpningen, og bruk en kappet klosse som "
      "avstandslære for resten."]),
    ("Innfesting", [
      "Stolpene skal boltes med to gjennomgående bolter mot bjelkelaget. Skruer alene er "
      "ikke nok — rekkverket skal tåle at noen faller mot det.",
      "Åpningen mellom dekket og bunnsvillen regnes med: maks 10 cm, eller 5 cm hvis "
      "rekkverket står utenpå bjelkelaget."]),
  ]},

"parkett": {
  "ingress": "Parkett og laminat legges flytende, og de aller fleste problemene kommer av "
             "at gulvet ikke får bevege seg — eller at underlaget ikke var klart.",
  "seksjoner": [
    ("Svinn etter leggemønster", [
      "Rett legging gir omtrent 5 % svinn, diagonal rundt 12 %, og fiskebein opp mot 18 %. "
      "Fiskebein krever i tillegg egne A- og B-bord, som er et annet produkt enn vanlige "
      "klikkbord.",
      "Antall pakker regnes mot m² per pakke, som varierer mellom produkter. Tallet står "
      "på pakken, og du justerer det i verktøyet slik at beregningen treffer akkurat det "
      "gulvet du vurderer."]),
    ("Siste rad og veggavstand", [
      "Blir siste rad smalere enn 5 cm, ser det dårlig ut og bordene knekker lett. Da "
      "kapper du første rad i stedet, slik at første og siste rad blir like brede. "
      "Verktøyet regner ut når det er nødvendig.",
      "Veggavstanden skal være 1,5 mm per breddemeter, minst 10 mm hele veien rundt. "
      "Gulvet må flyte fritt — avstanden skjules av gulvlisten."]),
    ("Underlag og fuktsperre", [
      "På betong eller varmekabler kreves fuktsperre med SD-verdi over 75, lagt med 20 cm "
      "overlapp. Alternativt et kombiunderlag som har fuktsperren innebygd.",
      "Store flater må deles med ekspansjonsfuge: rundt 12 × 6 meter for parkett og "
      "10 × 10 meter for laminat. Legg fugen i en døråpning hvis du kan.",
      "La pakkene ligge 48 timer i rommet før legging, uåpnet og flatt."]),
  ]},

"kledning": {
  "ingress": "Kledning er mye løpemeter, og forbruket avhenger av profilens faktiske "
             "dekkbredde — ikke bordbredden du leser i katalogen.",
  "seksjoner": [
    ("Dekkbredde, ikke bordbredde", [
      "Tømmermannskledning består av under- og overliggere med overlapp. Med 148 mm bord "
      "og 25 mm overlapp per side blir forbruket omtrent 8,1 løpemeter per kvadratmeter.",
      "Dobbeltfals har fals i kanten, og dekkbredden blir bordbredden minus omtrent 15 mm "
      "— rundt 7,5 løpemeter per kvadratmeter. Forskjellen utgjør mye på en hel husvegg."]),
    ("Lufting bak kledningen", [
      "Det skal være minst 23 mm luftespalte bak kledningen, åpen i både bunn og topp. "
      "Stående kledning trenger sløyfer vertikalt og lekter horisontalt utenpå; liggende "
      "kledning klarer seg med stående lekter, som gir både feste og lufting.",
      "Lektene bør være minst 30 × 48 mm for skruer og 36 × 48 mm for spiker, med maks "
      "60 cm senteravstand."]),
    ("Spikring og detaljer", [
      "På tømmermannskledning settes én spiker i underliggeren og to i overliggeren — "
      "aldri gjennom begge bord, da sprekker treverket når det svinner.",
      "Kledningen skal slutte 20–30 cm over terreng, og nederste bord kappes med dryppnese "
      "på cirka 15 grader.",
      "Musebånd i bunn lukker luftespalten for gnagere uten å stenge luftingen."]),
  ]},

"levegg": {
  "ingress": "En levegg er enkel å bygge, men reglene for hva du kan sette opp uten å søke "
             "er konkrete — og de handler om både høyde, lengde og avstand til nabogrensen.",
  "seksjoner": [
    ("Når slipper du å søke", [
      "Etter byggesaksforskriften § 4-1 er en levegg inntil 1,8 meter høy og 5 meter lang "
      "unntatt søknadsplikt selv om den står helt inntil nabogrensen. Er den inntil 10 "
      "meter lang, må avstanden til grensen være minst 1,0 meter.",
      "Unntaket gjelder én levegg. Flere levegger i kombinasjon må vurderes samlet av "
      "kommunen, og arealplanen for området gjelder uansett."]),
    ("Utforming påvirker vindlasten", [
      "En tett vegg gir best le, men tar full vindlast og stiller størst krav til "
      "stolpene og fundamentet. Tosidig forskjøvet kledning gir nesten like god le med "
      "vesentlig mindre belastning, fordi vinden slipper gjennom.",
      "En spilevegg med 30 mm åpning er den letteste konstruksjonen, men skjermer bare "
      "delvis."]),
    ("Stolpene er det svake punktet", [
      "Stolpene skal 90 cm ned i komprimert pukk eller støpes fast — aldri bare graves ned "
      "i jord. På vindutsatt tomt bør senteravstanden ned til 1,2 meter og fundamentet "
      "støpes frostfritt.",
      "Hold bordene 5–10 cm over terreng, ellers suger endeveden fukt."]),
  ]},

"pergola": {
  "ingress": "En pergola er en åpen konstruksjon, og nettopp derfor undervurderes både "
             "avstivningen og hva som skjer den dagen du vurderer å legge tak på den.",
  "seksjoner": [
    ("Bjelkedimensjon etter spenn", [
      "Verktøyet velger minste bærebjelke som klarer stolpeavstanden. En 48 × 148 holder "
      "til rundt 3 meter, mens du bør opp i 48 × 198 nærmere 4 meter.",
      "Klassisk utførelse er doble bærebjelker, én på hver side av stolpen, boltet "
      "gjennom. Det gir en langt stivere konstruksjon enn én bjelke på toppen."]),
    ("Sperrer og avstivning", [
      "Sperrene legges på tvers med rundt 60 cm senteravstand, med utstikk forbi bjelkene "
      "— det er utstikket som gir pergolaen uttrykket sitt.",
      "Skråbånd i hjørnene er ikke pynt. En åpen rammekonstruksjon uten avstivning vil "
      "bevege seg i vind, og boltene arbeider seg løse over tid."]),
    ("Tak endrer regelverket", [
      "En åpen pergola regnes ikke som bygning og er i utgangspunktet ikke søknadspliktig. "
      "Frittstående inntil 50 m² og tilbygg inntil 15 m² er normalt unntatt.",
      "Legger du tett tak eller skyvbare lameller på den, teller den derimot som bebygd "
      "areal og går inn i utnyttelsesgraden på tomta. Det er det vanligste vippepunktet, "
      "og verktøyet varsler om det."]),
  ]},

"utemaling": {
  "ingress": "Utvendig maling er billig i materialer og dyr i arbeid. Det avgjørende for "
             "hvor lenge det holder, er forarbeidet og været du maler i.",
  "seksjoner": [
    ("Dekkevne og antall strøk", [
      "Vanlig utendørs maling dekker omtrent 8–10 m² per liter per strøk. Oljedekkbeis "
      "ligger noe lavere, og transparent beis varierer mye med hvor mye underlaget suger.",
      "To strøk er standard. Ett strøk holder bare til oppfriskning av samme farge, og "
      "på sterkt værutsatte flater eller ved stort fargeskifte trengs tre.",
      "Dekkevnen står på spannet og varierer mellom produkter — juster tallet i verktøyet "
      "så beregningen treffer den malingen du faktisk kjøper."]),
    ("Ubehandlet treverk trenger grunning", [
      "Ny, ubehandlet kledning skal grunnes før toppstrøkene. Uten grunning suger treverket "
      "ujevnt, og malingen slipper tidligere. Grunning dekker omtrent 9 m² per liter.",
      "Endeved suger mest av alt. Forsegl alle kapp før montering — det er der råten "
      "starter."]),
    ("Værvinduet", [
      "Mal på tørt treverk, i temperatur over 5 grader, og unna direkte sol på den flaten "
      "du jobber med. Malingen skal ikke tørke raskere enn du rekker å holde en våt kant.",
      "Vask huset først. Fett, pollen og algevekst gir dårlig heft, uansett hvor god "
      "malingen er."]),
  ]},

"belegningsstein": {
  "ingress": "Belegningsstein er det prosjektet der folk oftest bommer på bestillingen — "
             "fordi masser selges i tonn, mens du måler i kvadratmeter.",
  "seksjoner": [
    ("Fra kvadratmeter til tonn", [
      "Bærelaget regnes som areal ganger lagtykkelse, pluss omtrent 15 % komprimeringsmonn, "
      "og gjøres om til tonn med en tetthet på rundt 1,5 tonn per kubikkmeter. En "
      "oppkjørsel på 28 m² trenger dermed rundt 12 tonn pukk.",
      "Utgravde masser sveller. Regn cirka 25 % ekstra volum når du bestiller container "
      "eller henger til det som skal bort."]),
    ("Lagoppbygging etter bruk", [
      "Gangareal og plattinger klarer seg med 15 cm bærelag og 5 cm stein. Kjørbar "
      "oppkjørsel trenger 20–30 cm bærelag og minst 6 cm stein — tynnere stein sprekker "
      "under bil.",
      "Settesanden skal være omtrent 4 cm avrettet. Fallet bygges i bærelaget, ikke i "
      "settesanden.",
      "På myk grunn som leire eller matjord bør du legge på ytterligere 10 cm, og vurdere "
      "geonett."]),
    ("Fall og komprimering", [
      "Fallet skal være 1,5–2 cm per meter, alltid bort fra husveggen. Aldri fall mot "
      "grunnmuren.",
      "Komprimer bærelaget i lag på 10–15 cm med vibroplate. Alt på én gang gir setninger "
      "du oppdager først året etter.",
      "Etterfyll fugesand etter noen uker. Fulle fuger er det som låser flaten."]),
  ]},

"plen": {
  "ingress": "Plen er det billigste og mest utakknemlige prosjektet i hagen: alt avgjøres "
             "de tre første ukene, og da handler det om vann.",
  "seksjoner": [
    ("Jord er halve jobben", [
      "Regn 10 cm ny vekstjord over et jevnet underlag. Volumet ganges med omtrent 1,1 "
      "fordi jorda setter seg etter utlegging.",
      "Har du god jord fra før, klarer du deg uten nytt lag — men luft eller "
      "vertikalskjær, fjern stein og røtter, og rak til en jevn overflate."]),
    ("Ferdigplen eller såing", [
      "Ferdigplen kommer i ruller på cirka 1 m², vanligvis 40 × 250 cm. Legg dem i "
      "forbandt som murstein, tett kant i kant uten overlapp.",
      "Ferdigplen er ferskvare. Rullene skal legges innen 24 timer etter levering — "
      "bestill til den dagen du faktisk skal legge.",
      "Sår du selv, regn omtrent 2,5 kg frø per 100 m². Så halvparten på langs og "
      "halvparten på tvers for jevn dekning, rak lett inn og tromle."]),
    ("Vanning og tidspunkt", [
      "Mai–juni og august–september gir best etablering. Midtsommer er verst.",
      "Vann grundig første dag, deretter daglig i to til tre uker til gresset har rotfeste. "
      "Dette er det eneste punktet der folk faktisk mislykkes.",
      "Første klipp tas etter cirka en uke for ferdigplen, eller når sådd gress er 8–10 cm. "
      "Bruk høyeste innstilling."]),
  ]},

"gjerde": {
  "ingress": "Gjerde er både en byggejobb og en nabosak. Reglene er forskjellige avhengig "
             "av om gjerdet står mot vei eller mot nabo.",
  "seksjoner": [
    ("Mot vei og mot nabo", [
      "Et gjerde mot vei er normalt unntatt søknadsplikt hvis det er inntil 1,5 meter høyt "
      "og har et åpent, lett uttrykk. Det må uansett aldri sperre frisikten i kryss og "
      "avkjørsler — kommunen kan kreve lavere gjerde der.",
      "Mot nabo gir gjerdeloven § 6 deg rett til å gjerde inn egen eiendom. Naboen kan "
      "likevel protestere hvis gjerdet gir urimelig ulempe med sol, lys eller sikt. "
      "Snakk sammen før du begynner."]),
    ("Porten er der det svikter", [
      "En port henger og vil sige. Portstolpene må støpes frostfritt, og de bør være "
      "kraftigere enn de øvrige stolpene. En diagonal jordstøtte i portbladet hindrer at "
      "rammen faller sammen over tid.",
      "Kjøreport lages som to blad snarere enn ett stort — kortere arm gir mindre "
      "belastning på hengslene."]),
    ("Konstruksjon", [
      "Stolper 98 × 98 med 60 cm nedstøping, senteravstand 1,8 meter, eller 1,5 meter på "
      "vindutsatt tomt. To sviller opp til 1,5 meter høyde, tre over det.",
      "Åpent spilegjerde med 30 mm luft slipper gjennom vind og lys. Tett gjerde skjermer "
      "bedre, men tar mye mer vind — og krever tilsvarende stivere konstruksjon."]),
  ]},

"innemaling": {
  "ingress": "Innvendig maling ser enkelt ut, og er det stort sett — helt til du maler på "
             "ny gips uten å grunne først.",
  "seksjoner": [
    ("Areal og liter", [
      "Veggarealet er rommets omkrets ganget med takhøyden, minus dører og vinduer. "
      "Takarealet er lengde ganger bredde.",
      "Med en dekkevne på rundt 8 m² per liter trenger et rom på 4 × 3 meter med 2,4 meters "
      "takhøyde omtrent 7,4 liter til to strøk på veggene.",
      "Mørke og sterke farger dekker dårligere og trenger ofte tre strøk. Dekkevnen står "
      "på spannet og varierer mye."]),
    ("Ny gips krever mer", [
      "Ubehandlet gips suger kraftig. Grunn først, sparkle deretter skjøter og skruehull, "
      "slip, og grunn en gang til på sparkelen før toppstrøkene.",
      "Full sparkling bruker omtrent 1,5 kg per kvadratmeter. Punktsparkling på en "
      "tidligere malt vegg trenger bare en brøkdel.",
      "Slip lett mellom sparkelstrøkene og støvtørk grundig — støv gir dårlig heft."]),
    ("Rekkefølge og resultat", [
      "Mal taket først, så veggene. Hold en våt kant og jobb systematisk, ellers ser du "
      "skjøtene når malingen tørker.",
      "Mal i dagslys som faller fra siden. Da ser du gjenskinn og misser mens malingen "
      "fortsatt er våt.",
      "Ta vare på restmalingen med farge og romnavn på lokket."]),
  ]},

"flis": {
  "ingress": "Bad er det eneste prosjektet på Tommestokk1 der deler av arbeidet er "
             "lovpålagt fagarbeid, og der en feil gir vannskade i stedet for et skjevt bord.",
  "seksjoner": [
    ("Hva du ikke kan gjøre selv", [
      "Rørarbeid skal utføres av registrert rørleggerforetak, og elektrisk arbeid av "
      "autorisert elektriker. Dette gjelder uansett hvem som gjør resten av jobben.",
      "Dokumentér arbeidet underveis. Ta bilder av membranen før flisene legges, og ta "
      "vare på produktdatabladene. Det kreves ved salg av boligen og ved "
      "forsikringsoppgjør etter en lekkasje."]),
    ("Membran er ikke valgfritt", [
      "Uten godkjent membran er badet ikke et lovlig våtrom, og forsikringen dekker "
      "normalt ikke vannskade.",
      "Bruk forsterkningsremser i alle hjørner, i gulv/vegg-skjøten og rundt sluk og "
      "rørgjennomføringer. Det er der lekkasjer nesten alltid starter.",
      "Hold deg til ett godkjent membransystem. Blander du fabrikat, kan reklamasjonsretten "
      "falle bort."]),
    ("Lim, fug og fall", [
      "Limforbruket følger flisstørrelsen: rundt 3 kg per m² for mosaikk, 4,5 kg for "
      "standardformat og opp mot 7 kg for storformat — med tilhørende tannsparkel.",
      "Fugemassen går motsatt vei: små fliser gir mer fugelengde og høyere forbruk.",
      "Fallet mot sluk skal være minst 1:50 i dusjsonen, og det bygges i gulvet før "
      "membranen legges. Gulvflis skal være sklisikker, R10 eller høyere."]),
  ]},
}


# ------------------------------------------------------------------ generering
def hent_visninger(kilde: str) -> dict:
    """Plukker ut hver <main class="view" id="view-X">…</main> som egen blokk."""
    blokker = {}
    for m in re.finditer(r'<main class="view[^"]*" id="view-(\w+)">.*?</main>', kilde, re.S):
        blokker[m.group(1)] = m.group(0)
    return blokker


def hent_ruteinfo(kilde: str) -> dict:
    """Leser tittel/beskrivelse/sti rett ut av VIEWS-tabellen, så det aldri
    kan komme i utakt med det appen selv bruker."""
    blokk = re.search(r'const VIEWS = \{(.*?)\n\};', kilde, re.S).group(1)
    info = {}
    for m in re.finditer(
            r'(\w+):\s*\{crumb:"([^"]*)",\s*sti:"([^"]*)",\s*'
            r'title:"([^"]*)",\s*desc:"([^"]*)"\}', blokk, re.S):
        nokkel, _crumb, sti, tittel, desc = m.groups()
        info[nokkel] = {"sti": sti, "title": tittel, "desc": desc}
    return info


def artikkel_html(nokkel: str) -> str:
    a = ARTIKLER.get(nokkel)
    if not a:
        return ""
    deler = [f'<p class="artikkel-ingress">{html.escape(a["ingress"])}</p>']
    for overskrift, avsnitt in a["seksjoner"]:
        deler.append(f"<h3>{html.escape(overskrift)}</h3>")
        deler.extend(f"<p>{html.escape(t)}</p>" for t in avsnitt)
    return ('\n<section class="card artikkel" aria-label="Om beregningen">\n'
            + "\n".join(deler) + "\n</section>\n")


def skriv_appjs(kilde: str) -> str:
    """Skiller ut den inline JS-en til app.js, så nettleseren kan cache den på
    tvers av verktøysidene. index.html beholder sin inline kopi og er fortsatt
    den eneste filen som redigeres."""
    m = re.search(r"<script>\n(.*?)\n</script>", kilde, re.S)
    (ROT / "app.js").write_text(m.group(1), encoding="utf-8")
    return m.group(0)


def bygg_side(kilde: str, nokkel: str, visninger: dict, ruter: dict, inline_js: str) -> str:
    ut = kilde
    info = ruter[nokkel]

    # Behold kun denne visningen, og gjør den aktiv
    for navn, blokk in visninger.items():
        if navn == nokkel:
            ut = ut.replace(blokk, blokk.replace('<main class="view"', '<main class="view active"', 1), 1)
        else:
            ut = ut.replace(blokk, "", 1)

    # Tittel, beskrivelse og canonical i selve kildekoden — ikke bare via JS
    ut = re.sub(r"<title>[^<]*</title>", f"<title>{html.escape(info['title'])}</title>", ut, count=1)
    ut = re.sub(r'(<meta name="description" content=")[^"]*(">)',
                lambda m: m.group(1) + html.escape(info["desc"], quote=True) + m.group(2), ut, count=1)
    ut = re.sub(r'(<link rel="canonical" href=")[^"]*(">)',
                lambda m: m.group(1) + "https://tommestokk1.no" + info["sti"] + m.group(2), ut, count=1)
    ut = ut.replace("<head>", "<head>\n<!-- Generert av build.py fra index.html — ikke rediger direkte -->", 1)

    # Fagteksten legges inn rett før footeren
    ut = ut.replace("<footer>", artikkel_html(nokkel) + "\n<footer>", 1)

    # Del JS-en med de andre sidene i stedet for å gjenta 200 kB per side
    ut = ut.replace(inline_js, '<script src="app.js"></script>', 1)
    return ut


def main() -> int:
    kilde = KILDE.read_text(encoding="utf-8")
    visninger = hent_visninger(kilde)
    ruter = hent_ruteinfo(kilde)

    mangler = [k for k in visninger if k != "home" and k not in ruter]
    if mangler:
        print(f"FEIL: mangler ruteinfo for {mangler}", file=sys.stderr)
        return 1
    uten_tekst = [k for k in visninger if k != "home" and k not in ARTIKLER]
    if uten_tekst:
        print(f"Advarsel: ingen fagtekst for {uten_tekst}", file=sys.stderr)

    inline_js = skriv_appjs(kilde)

    skrevet = []
    for nokkel in visninger:
        if nokkel == "home":
            continue                      # index.html er allerede forsiden
        side = bygg_side(kilde, nokkel, visninger, ruter, inline_js)
        fil = ROT / f"{nokkel}.html"
        fil.write_text(side, encoding="utf-8")
        skrevet.append((nokkel, len(side)))

    print(f"Genererte {len(skrevet)} verktøysider + app.js fra index.html "
          f"({len(kilde)//1024} kB kilde):\n")
    for navn, storrelse in sorted(skrevet):
        ord_ = len(re.sub(r"<[^>]+>", " ", artikkel_html(navn)).split())
        print(f"  {navn+'.html':<22} {storrelse//1024:>4} kB   {ord_:>4} ord fagtekst")
    return 0


if __name__ == "__main__":
    sys.exit(main())
