// Sydänmerkki-kelpoisuuden arvio ravintosisällön perusteella.
//
// Kriteerit: sydanmerkki.fi/elintarviketeollisuus/tuotteiden_myontamisperusteet (haettu 10/2026).
// Kaikki raja-arvot ovat per 100 g. Tuoteryhmä päätellään tuotteen nimestä ja luokista,
// ja käyttäjä voi vaihtaa sen. Arvio ei ole virallinen Sydänmerkki – se kertoo, täyttäisikö
// tuote ravintosisältönsä puolesta oman tuoteryhmänsä kriteerit.

import { normalize } from './parse';
import { Nutrition } from './nutrition';

export type Rule =
  /** Rasva enintään `max`, tai jos rasvaa enintään `upTo`, tyydyttynyttä rasvaa enintään `satG` g tai `satPct` % rasvasta. */
  | { kind: 'fat'; max: number; upTo?: number; satG?: number; satPct?: number }
  | { kind: 'fatMin'; min: number }
  | { kind: 'sat'; maxG?: number; maxPct?: number }
  | { kind: 'sugars'; max: number }
  | { kind: 'fiber'; min: number }
  | { kind: 'salt'; max: number }
  | { kind: 'noAdded'; what: 'fat' | 'sugar' | 'salt' }
  /** Valmispuurot: sokereita enintään 7 g ja kuitua 1 g, tai sokereita 7,1–10 g ja kuitua 2,5 g. */
  | { kind: 'porridgeSugarFiber' }
  /** Ei tarkistettavissa ravintosisällöstä (esim. kasvisten osuus). */
  | { kind: 'manual'; text: string };

export interface HeartGroup {
  id: string;
  name: string;
  category: string;
  rules: Rule[];
  /** Tuoteryhmä ei voi saada Sydänmerkkiä (esim. lopetettu tai poissuljettu). */
  excluded?: string;
  note?: string;
  /** Tunnistus nimestä ja luokista (pienet kirjaimet). Järjestys ratkaisee: ensimmäinen osuma voittaa. */
  match?: RegExp;
  /** Ei valita, jos tämä osuu (esim. "maito" mutta ei "maitosuklaa"). */
  unless?: RegExp;
}

const fat = (max: number, upTo?: number, sat?: { g?: number; pct?: number }): Rule => ({
  kind: 'fat',
  max,
  upTo,
  satG: sat?.g,
  satPct: sat?.pct,
});
const PREPARED = 'Kriteerit koskevat käyttövalmista tai ohjeen mukaan valmistettua tuotetta – pakkauksen arvot voivat olla kuivatuotteen.';

// Järjestys on tunnistuksen järjestys: tarkemmat ryhmät ennen yleisempiä.
export const HEART_GROUPS: HeartGroup[] = [
  // --- Poissuljetut
  {
    id: 'excluded-drinks', name: 'Mehut, virvoitusjuomat, kahvi ja tee', category: 'Juomat', rules: [],
    excluded: 'Mehut, virvoitusjuomat, vedet, kahvi- ja teetuotteet, energia- ja alkoholijuomat eivät voi saada Sydänmerkkiä.',
    match: /mehu|juice|nektari|limonadi|limsa|cola|virvoitus|kivennäisvesi|lähdevesi|makuvesi|energiajuoma|energy drink|olut|siideri|lonkero|viini|kahvi(?!kerma)|coffee|(^|[^a-zåäö])tee([^a-zåäö]|$)|(^|\s)tea(\s|$)|soft drink|sodas|ateriankorvike|meal replacement/,
    unless: /smoothie|kiisseli|kasvijuoma|kauramaito|kaurajuoma/,
  },
  {
    id: 'excluded-pastries', name: 'Pullat, kakut ja makeat leivonnaiset', category: 'Leipä ja viljavalmisteet', rules: [],
    excluded: 'Tuoteryhmä poistui Sydänmerkki-järjestelmästä 5/2025 (siirtymäaika 31.12.2026 asti).',
    match: /pulla|kakku|leivos|munkki|donitsi|muffin|korvapuusti|croissant|wiener|viineri|kääretorttu|brownie|mokkapala|cake|pastries|pastry/,
    unless: /riisikakku|maissikakku|rice cake|corn cake/,
  },
  {
    id: 'excluded-icecream', name: 'Jäätelöt ja sorbetit', category: 'Maitotuotteet', rules: [],
    excluded: 'Tuoteryhmä poistui Sydänmerkki-järjestelmästä 5/2025 (siirtymäaika 31.12.2026 asti).',
    match: /jäätelö|sorbetti|ice cream|ice-cream|sorbet/,
  },

  // --- Mausteet ja maustekastikkeet
  { id: 'ketchup', name: 'Ketsupit', category: 'Mausteet ja maustekastikkeet', rules: [{ kind: 'sugars', max: 20 }, { kind: 'salt', max: 1.38 }], match: /ketsuppi|ketchup/ },
  { id: 'mustard', name: 'Sinapit', category: 'Mausteet ja maustekastikkeet', rules: [{ kind: 'salt', max: 1.38 }], match: /sinappi|mustard/ },
  {
    id: 'stock', name: 'Liemikuutiot, jauheet ja fondit', category: 'Mausteet ja maustekastikkeet',
    rules: [{ kind: 'salt', max: 0.5 }], note: 'Suolan raja koskee ohjeen mukaan valmistettua lientä.',
    match: /liemi|liemikuutio|fondi|buljong|bouillon|broth|stock cube/,
  },
  { id: 'spices', name: 'Mausteet ja mausteseokset', category: 'Mausteet ja maustekastikkeet', rules: [{ kind: 'noAdded', what: 'salt' }], match: /mauste(?!kurkku)|pippuri|kaneli|kurkuma|paprikajauhe|spice|seasoning/ },

  // --- Rasvat
  {
    id: 'dressing', name: 'Salaatinkastikkeet ja majoneesit', category: 'Rasvat',
    rules: [{ kind: 'fatMin', min: 25 }, { kind: 'sat', maxPct: 20 }, { kind: 'sugars', max: 15 }, { kind: 'salt', max: 1 }],
    match: /majoneesi|salaatinkastike|aioli|hampurilaiskastike|voileipäkastike|mayonnaise|dressing|remoulade/,
  },
  {
    id: 'plant-spread', name: 'Kasvipohjaiset levitteet ja tahnat', category: 'Rasvat',
    rules: [{ kind: 'sat', maxPct: 20 }, { kind: 'sugars', max: 10 }, { kind: 'salt', max: 0.7 }],
    match: /hummus|pähkinävoi|maapähkinävoi|mantelivoi|tahini|seesamitahna|levite.*(papu|herne|pähkinä|siemen)|peanut butter|nut butter|spread.*(bean|nut)/,
  },
  {
    id: 'spread', name: 'Levitettävät rasvat', category: 'Rasvat', rules: [{ kind: 'sat', maxPct: 30 }, { kind: 'salt', max: 1 }],
    match: /margariini|levite|rasvaseos|becel|flora|keiju|oivariini|voi-rypsi|margarine|spreadable/,
  },
  {
    id: 'liquid-fat', name: 'Juoksevat rasvat', category: 'Rasvat', rules: [{ kind: 'sat', maxPct: 20 }, { kind: 'salt', max: 1 }],
    match: /juokseva|paistoneste|liquid margarine/,
  },
  {
    id: 'oil', name: 'Kasviöljyt', category: 'Rasvat',
    rules: [{ kind: 'sat', maxPct: 20 }, { kind: 'noAdded', what: 'sugar' }, { kind: 'noAdded', what: 'salt' }],
    match: /(^|\s)(rypsi|rapsi|oliivi|auringonkukka|pellava|kasvi)?öljy(\s|$)|öljyspray|vegetable oil|olive oil|rapeseed oil|(^|\s)oils?(\s|$)/,
    unless: /öljyssä|in oil|kala|tonnikala/,
  },

  // --- Kala (ennen valmisruokia, jotta "kalapuikko" ja "tonnikala öljyssä" osuvat oikein)
  {
    id: 'fish-dish', name: 'Kalaruokavalmisteet', category: 'Valmisruoat',
    rules: [fat(18), { kind: 'sat', maxPct: 25 }, { kind: 'salt', max: 1 }, { kind: 'manual', text: 'Kalaa vähintään 55 % tuotteesta' }],
    match: /kalapuik|kalapihv|kalapyöry|kalamurek|leivitetty.*(kala|lohi|seiti|turska)|paneroitu|fish ?finger|fish stick|fish cake/,
  },
  {
    id: 'canned-fish', name: 'Säilykekala', category: 'Kala',
    rules: [fat(2, Infinity, { pct: 25 }), { kind: 'salt', max: 1.13 }, { kind: 'manual', text: 'Kalaa vähintään 55 % tuotteesta' }],
    match: /tonnikala|sardiini|makrilli.*(tomaatti|öljy)|säilyke.*(kala|lohi)|(kala|lohi|silakka).*(öljyssä|vedessä|kastikkeessa)|canned (fish|tuna)|tuna/,
  },
  {
    id: 'smoked-fish', name: 'Graavi- ja lämminsavukala', category: 'Kala',
    rules: [{ kind: 'noAdded', what: 'fat' }, { kind: 'noAdded', what: 'sugar' }, { kind: 'salt', max: 1.38 }],
    match: /graavi|lämminsavu|kylmäsavu|savustettu (lohi|kirjolohi|kala)|savulohi|smoked (salmon|fish)/,
  },
  {
    id: 'marinated-fish', name: 'Marinoidut ja maustetut raa\'at kalatuotteet', category: 'Kala',
    rules: [{ kind: 'salt', max: 1 }, { kind: 'manual', text: 'Marinadissa tyydyttynyttä rasvaa enintään 20 % rasvasta' }],
    match: /(marinoi|maustettu|maustet).*(lohi|kala|katkarapu|silli|silakka)|silli|marinated (fish|salmon)/,
  },
  {
    id: 'fish', name: 'Tuoreet ja pakastetut raa\'at kalatuotteet', category: 'Kala',
    rules: [{ kind: 'noAdded', what: 'fat' }, { kind: 'noAdded', what: 'salt' }],
    match: /lohi|kirjolohi|kala|silakka|muikku|seiti|turska|ahven|kuha|hauki|katkarapu|äyriäi|simpukka|fish|salmon|cod|shrimp|prawn/,
  },

  // --- Suolaiset leivonnaiset ennen leikkeleitä, jotta "kinkkupizza" on pizza
  {
    id: 'savory-pastry', name: 'Suolaiset leivonnaiset ja täytetyt leivät', category: 'Valmisruoat',
    rules: [fat(15), { kind: 'sat', maxPct: 30 }, { kind: 'sugars', max: 7 }, { kind: 'fiber', min: 2 }, { kind: 'salt', max: 1 }],
    match: /piirakka|piiras|pasteija|pizza|wrap|täytetty|kolmioleipä|voileipä|sandwich|patonki.*täyte|lihapiirakka|samosa|quiche/,
  },

  // --- Lihavalmisteet
  {
    id: 'plant-sausage', name: 'Kasvipohjaiset makkarat, nakit ja leikkeleet', category: 'Lihavalmisteet',
    rules: [fat(15), { kind: 'sat', maxPct: 20 }, { kind: 'salt', max: 1.5 }],
    match: /(kasvis|kasvi|vege|vegaani|härkis|soija|vegan|plant).*(makkara|nakki|leike|wiener|sausage)|(makkara|nakki|leike).*(kasvis|vege|vegaani|vegan)/,
  },
  {
    id: 'sausage', name: 'Leikkele- ja ruokamakkarat', category: 'Lihavalmisteet',
    rules: [fat(12), { kind: 'sat', maxPct: 38 }, { kind: 'salt', max: 1.5 }],
    match: /makkara|nakki|lenkki|grillimakkara|meetvursti|salami|sausage|frankfurter|hot ?dog/,
  },
  {
    id: 'cold-cut', name: 'Leivän päälle tarkoitetut leikkeleet', category: 'Lihavalmisteet',
    rules: [fat(4, 12, { pct: 20 }), { kind: 'salt', max: 1.9 }],
    match: /leike|leikkele|kinkku|pastrami|viipaleet|siivu|cold cut|sliced (ham|turkey|chicken)|ham/,
  },

  // --- Valmisruoat
  {
    id: 'plant-protein', name: 'Kasviproteiinituotteet ja kasvisruokavalmisteet', category: 'Valmisruoat',
    rules: [fat(3, 15, { pct: 25 }), { kind: 'sugars', max: 8 }, { kind: 'salt', max: 1 }],
    match: /tofu|härkis|härkäpapuvalmiste|nyhtökaura|pulled oats|seitan|tempeh|kasvispihvi|kasvispyörykkä|kasvisnugget|falafel|kasvisjauhis|kasvijauhis|kasviproteiini|soijasuikale|vege(?!table)|vegaaninen pihvi|veggie/,
  },
  {
    id: 'meat-dish', name: 'Liharuokavalmisteet', category: 'Valmisruoat',
    rules: [fat(12), { kind: 'sat', maxPct: 38 }, { kind: 'salt', max: 1 }],
    match: /lihapulla|lihapyörykkä|jauhelihapihvi|kääryle|kebab|nugget|pihvi|pyörykkä|meatball|burger|hampurilaispihvi|mureke/,
  },
  {
    id: 'side-salad', name: 'Lisäkesalaatit', category: 'Valmisruoat',
    rules: [fat(0.5, 6, { pct: 20 }), { kind: 'salt', max: 0.75 }],
    match: /perunasalaatti|rosolli|coleslaw|kaalisalaatti|pastasalaatti|salaatti.*(majoneesi|kastike)/,
  },
  {
    id: 'soup', name: 'Keitot ja keittopohjat', category: 'Valmisruoat',
    rules: [fat(3, 6, { g: 1.5 }), { kind: 'salt', max: 0.7 }], note: PREPARED,
    match: /keitto|soup|soppa/,
    unless: /marjakeitto|hedelmäkeitto|mustikkakeitto|mansikkakeitto|ruusunmarjakeitto/,
  },
  {
    id: 'sauce', name: 'Kastikkeet', category: 'Valmisruoat',
    rules: [fat(4, 8, { pct: 30 }), { kind: 'salt', max: 0.75 }], note: PREPARED,
    match: /kastike|sauce|pesto/,
  },
  {
    id: 'veg-side', name: 'Kasvislisäkkeet', category: 'Valmisruoat',
    rules: [fat(1.5, 3, { pct: 20 }), { kind: 'salt', max: 0.5 }, { kind: 'manual', text: 'Kasviksia vähintään 70 % (ei perunaa)' }],
    match: /kasvissekoitus|wokkivihannes|vihannessekoitus|kasvislisäke|paistokasvikset|vegetable mix/,
  },
  {
    id: 'ready-meal', name: 'Valmiit ateriat ja puolivalmisteet', category: 'Valmisruoat',
    rules: [fat(3, 8, { pct: 30 }), { kind: 'sugars', max: 7 }, { kind: 'salt', max: 0.75 }], note: PREPARED,
    match: /laatikko|lasagne|lasagnette|ateria|valmisruoka|risotto|wok|curry|chili con carne|bolognese|kaalikääryle|lettu|letut|pannukakku|ohukainen|ready meal|meals/,
  },

  // --- Liha
  {
    id: 'marinated-meat', name: 'Maustettu tai marinoitu raaka liha', category: 'Liha',
    rules: [fat(7), { kind: 'salt', max: 0.88 }, { kind: 'manual', text: 'Marinadissa tyydyttynyttä rasvaa enintään 20 % rasvasta' }],
    match: /(marinoi|maustet|grilli|bbq|teriyaki).*(liha|broileri|kana|kalkkuna|porsas|possu|sika|nauta|filee|suikale|siipi|koipi)|marinated/,
  },
  {
    id: 'cooked-meat', name: 'Kypsä liha', category: 'Liha',
    rules: [fat(9), { kind: 'salt', max: 1 }],
    match: /(kypsä|kypsennetty|savustettu|grillattu|paistettu|sous ?vide|nyhtö|pulled|cooked).*(liha|broileri|kana|kalkkuna|porsas|possu|sika|nauta|filee|suikale|paisti|meat|chicken|beef|pork|turkey)/,
  },
  {
    id: 'meat', name: 'Maustamaton liha', category: 'Liha',
    rules: [fat(7, 10, { pct: 30 }), { kind: 'noAdded', what: 'salt' }],
    match: /jauheliha|paisti|filee|suikale|kuutio|broileri|kana|kalkkuna|nauta|naudan|sika|sian|porsas|possu|karitsa|lammas|riista|poro|liha|minced|chicken|beef|pork|turkey/,
  },

  // --- Maitotuotteet ja juomat
  {
    id: 'cottage-cheese', name: 'Raejuustot', category: 'Maitotuotteet',
    rules: [fat(2), { kind: 'salt', max: 0.75 }], match: /raejuusto|cottage/,
  },
  {
    id: 'fresh-cheese', name: 'Tuorejuustot ja kypsyttämättömät juustot', category: 'Maitotuotteet',
    rules: [fat(15, 30, { pct: 30 }), { kind: 'salt', max: 1.2 }],
    match: /tuorejuusto|mozzarella|feta|fetajuusto|salaattijuusto|vuohenjuusto|halloumi|ricotta|mascarpone|philadelphia|cream cheese|fresh cheese/,
  },
  {
    id: 'cheese', name: 'Kypsytetyt juustot', category: 'Maitotuotteet',
    rules: [fat(17, 30, { pct: 30 }), { kind: 'salt', max: 1.2 }],
    match: /juusto|edam|emmental|gouda|cheddar|parmesan|oltermanni|polar|koskenlaskija|cheese|(^|\s)ost(\s|$)/,
  },
  {
    id: 'veg-drink', name: 'Kasviksia sisältävät välipalajuomat', category: 'Juomat',
    rules: [fat(0.5, 3, { g: 0.4 }), { kind: 'sugars', max: 11 }, { kind: 'salt', max: 0.13 }, { kind: 'manual', text: 'Kasviksia vähintään 35 % tuotteesta' }],
    match: /smoothie|kiisseli|marjakeitto|hedelmäkeitto|mustikkakeitto|mansikkakeitto|ruusunmarjakeitto/,
    unless: /maitokiisseli/,
  },
  {
    id: 'snack-drink', name: 'Välipalajuomat', category: 'Juomat',
    rules: [fat(0.5, 3, { g: 0.4 }), { kind: 'sugars', max: 8 }, { kind: 'salt', max: 0.13 }],
    match: /jogurttijuoma|juotava|välipalajuoma|kaakao|suklaamaito|maitojuoma.*(mansikka|suklaa|kahvi|vanilja|banaani)|protein(i)?juoma|shake|drinking yog/,
  },
  {
    id: 'yogurt', name: 'Jogurtit, rahkat, viilit ja vanukkaat', category: 'Maitotuotteet',
    rules: [fat(1, 5, { g: 1 }), { kind: 'sugars', max: 10 }, { kind: 'salt', max: 0.25 }],
    match: /jogurtti|rahka|viili|vanukas|maitokiisseli|skyr|kvarg|quark|yoghurt|yogurt|pudding|vaahto/,
  },
  {
    id: 'cream', name: 'Kermat ja ruoanvalmistustuotteet', category: 'Maitotuotteet',
    rules: [fat(7, 15, { pct: 30 }), { kind: 'salt', max: 0.75 }],
    match: /kerma|kermaviili|ranskankerma|smetana|creme fraiche|crème fraîche|ruokakerma|cream/,
  },
  {
    id: 'plant-drink', name: 'Maustamattomat kasvijuomat', category: 'Juomat',
    rules: [fat(3), { kind: 'sat', maxG: 0.4 }, { kind: 'sugars', max: 5 }, { kind: 'noAdded', what: 'sugar' }, { kind: 'salt', max: 0.1 }],
    match: /kaurajuoma|kauramaito|soijajuoma|mantelijuoma|riisijuoma|kasvijuoma|kookosjuoma|hernejuoma|oat drink|soy drink|almond drink|plant[- ]milk|plant[- ]based drink/,
  },
  {
    id: 'milk', name: 'Maidot, maitojuomat ja piimät', category: 'Juomat',
    rules: [fat(0.5), { kind: 'sat', maxG: 0.4 }, { kind: 'sugars', max: 5 }, { kind: 'salt', max: 0.13 }],
    match: /maito|maitojuoma|piimä|kefiiri|milk(s)?(\s|$)/,
    unless: /maitosuklaa|maitojauhe|maitokiisseli|kookosmaito/,
  },

  // --- Leipä ja viljavalmisteet
  {
    id: 'crispbread', name: 'Näkkileivät, hapankorput ja riisikakut', category: 'Leipä ja viljavalmisteet',
    rules: [fat(5, 10, { g: 1.5 }), { kind: 'sugars', max: 5 }, { kind: 'fiber', min: 10 }, { kind: 'salt', max: 1.2 }],
    match: /näkkileipä|näkki|hapankorppu|riisikakku|maissikakku|knäcke|crispbread|rice cake|corn cake/,
  },
  {
    id: 'biscuit', name: 'Välipalakeksit, patukat ja kovat leivonnaiset', category: 'Leipä ja viljavalmisteet',
    rules: [fat(20), { kind: 'sat', maxPct: 30 }, { kind: 'sugars', max: 20 }, { kind: 'fiber', min: 6 }, { kind: 'salt', max: 1 }],
    match: /keksi|patukka|korppu|cracker|biscuit|cookie|(^|\s)bars?(\s|$)|välipalapala|protein bar/,
  },
  {
    id: 'muesli', name: 'Murot, myslit ja maustetut viljavalmisteet', category: 'Leipä ja viljavalmisteet',
    rules: [fat(5, 15, { pct: 30 }), { kind: 'sugars', max: 15 }, { kind: 'fiber', min: 6 }, { kind: 'salt', max: 1 }],
    match: /mysli|muro|granola|talkkuna|cornflakes|breakfast cereal|muesli|cereal/,
  },
  {
    id: 'porridge', name: 'Valmispuurot ja maustetut puurohiutaleet', category: 'Leipä ja viljavalmisteet',
    rules: [fat(3, 5, { pct: 30 }), { kind: 'porridgeSugarFiber' }, { kind: 'salt', max: 0.3 }], note: PREPARED,
    match: /puuro|porridge/,
  },
  {
    id: 'bread', name: 'Leivät, sämpylät ja tortillat', category: 'Leipä ja viljavalmisteet',
    rules: [fat(5, 10, { g: 1.5 }), { kind: 'sugars', max: 7 }, { kind: 'fiber', min: 6 }, { kind: 'salt', max: 0.9 }],
    match: /leipä|leip|sämpylä|limppu|ruispala|kaurapala|vehnäpala|jälkiuuni|reikä|patonki|tortilla|rieska|bagel|rinkeli|paahtoleipä|bread|toast|bun(s)?(\s|$)|wrap ?leipä/,
  },
  {
    id: 'rice', name: 'Riisi ja riisinuudeli (kuiva)', category: 'Hiilihydraattilisäkkeet',
    rules: [{ kind: 'fiber', min: 3 }], match: /riisi|rice/,
  },
  {
    id: 'grain-side', name: 'Pasta, suurimot ja muut viljalisäkkeet (kuiva)', category: 'Hiilihydraattilisäkkeet',
    rules: [{ kind: 'fiber', min: 6 }],
    match: /pasta|makaroni|spagetti|spaghetti|penne|fusilli|tagliatelle|nuudeli|noodle|suurimo|ryyni|kuskus|couscous|bulgur|kvinoa|quinoa|ohrasuurimo/,
  },
  {
    id: 'plain-grain', name: 'Maustamattomat viljavalmisteet', category: 'Leipä ja viljavalmisteet',
    rules: [{ kind: 'noAdded', what: 'fat' }, { kind: 'noAdded', what: 'sugar' }, { kind: 'noAdded', what: 'salt' }, { kind: 'fiber', min: 6 }],
    match: /hiutale|lese|jauho|alkiot|flakes|bran|flour|oats/,
    unless: /perunajauho|maissitärkkelys/,
  },
  {
    id: 'potato', name: 'Peruna- ja bataattituotteet', category: 'Hiilihydraattilisäkkeet',
    rules: [fat(5), { kind: 'sat', maxG: 1 }, { kind: 'salt', max: 0.6 }], note: PREPARED,
    match: /peruna|bataatti|ranskalaiset|lohkoperuna|muusi|gratiini|potato|fries/,
  },

  // --- Kasvikset
  {
    id: 'legumes', name: 'Prosessoidut pavut, linssit, herneet ja soijatuotteet', category: 'Kasvikset',
    rules: [{ kind: 'noAdded', what: 'fat' }, { kind: 'noAdded', what: 'sugar' }, { kind: 'salt', max: 0.5 }],
    match: /pavut|papu|kikherne|linssi|soijarouhe|härkäpapurouhe|hernerouhe|beans|chickpea|lentil/,
  },
  {
    id: 'canned-veg', name: 'Säilykekasvikset', category: 'Kasvikset',
    rules: [fat(2, 10, { pct: 20 }), { kind: 'noAdded', what: 'salt' }],
    match: /säilyke|purkki|maissi|herne-maissi|kurkkusalaatti|punajuuri.*(viipale|kuutio)|sienisäilyke|canned/,
    unless: /tomaatti/,
  },
  {
    id: 'vegetables', name: 'Kasvikset, hedelmät, marjat, pähkinät ja siemenet', category: 'Kasvikset',
    rules: [{ kind: 'noAdded', what: 'fat' }, { kind: 'noAdded', what: 'sugar' }, { kind: 'noAdded', what: 'salt' }],
    note: 'Kuivattuja tai jauhettuja marjoja ja hedelmiä sekä kookosta ei hyväksytä.',
    match: /kasvis|vihannes|porkkana|tomaatti|kurkku|paprika|salaatti|kaali|sipuli|peruna|omena|banaani|päärynä|appelsiini|marja|mustikka|mansikka|vadelma|puolukka|herne|pakaste|sieni|pähkinä|manteli|siemen|vegetable|fruit|berr|nuts?(\s|$)|seeds?(\s|$)/,
  },
];

export const HEART_GROUP_BY_ID = new Map(HEART_GROUPS.map((g) => [g.id, g]));

const findGroup = (text: string) => HEART_GROUPS.find((g) => g.match && g.match.test(text) && !(g.unless && g.unless.test(text)));

/**
 * Päättelee tuoteryhmän. Open Food Factsin luokat (esim. "en:rye-breads") ovat luotettavampia
 * kuin nimi ("Bite Protein Cheesecake" on patukka, ei kakku), joten ne kokeillaan ensin.
 * Luokat ovat yleisestä tarkkaan, joten vain viimeiset ovat hyödyllisiä.
 */
export function classifyHeartGroup(name: string, categories: string[] = []): HeartGroup | undefined {
  const specific = categories.slice(-3).map((c) => c.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '));
  return (specific.length > 0 ? findGroup(normalize(specific.join(' '))) : undefined) ?? findGroup(normalize(name));
}

export type RuleStatus = 'pass' | 'fail' | 'unknown';

export interface RuleResult {
  status: RuleStatus;
  label: string;
  /** Esim. "0,73 g (raja enintään 1,00 g)" */
  detail: string;
}

export interface HeartAssessment {
  group: HeartGroup;
  status: 'eligible' | 'notEligible' | 'unknown' | 'excluded';
  results: RuleResult[];
}

const g = (v: number, decimals = 1) => `${v.toFixed(decimals).replace('.', ',')} g`;

const ADDED: Record<'fat' | 'sugar' | 'salt', { label: string; re: RegExp }> = {
  fat: { label: 'Ei lisättyä rasvaa', re: /öljy|margariini|rasva(?!ton)|(^|[^a-zåäö])voi([^a-zåäö]|$)|(^|\s)(oil|fat|butter)(\s|$)|ghee/ },
  sugar: {
    label: 'Ei lisättyä sokeria',
    re: /sokeri(?!ton|herne)|siirappi|hunaja|glukoosi|dekstroosi|fruktoosi|maltoosi|sakkaroosi|agave|mehutiiviste|sugar|syrup|honey/,
  },
  salt: { label: 'Ei lisättyä suolaa', re: /suola(?!ton)|natrium|(^|\s)salt(\s|$)|sodium/ },
};

function evaluateRule(rule: Rule, n: Nutrition, ingredients: string | undefined): RuleResult {
  const satPct = n.fat !== undefined && n.saturatedFat !== undefined && n.fat > 0 ? (n.saturatedFat / n.fat) * 100 : undefined;
  const unknown = (label: string, what: string): RuleResult => ({ status: 'unknown', label, detail: `${what} puuttuu` });

  switch (rule.kind) {
    case 'fat': {
      const label = 'Rasva';
      if (n.fat === undefined) return unknown(label, 'Rasvan määrä');
      const limit = `enintään ${g(rule.max)}`;
      if (n.fat <= rule.max) return { status: 'pass', label, detail: `${g(n.fat)} (${limit})` };
      if (rule.upTo === undefined || n.fat > rule.upTo) {
        const range = rule.upTo !== undefined && Number.isFinite(rule.upTo) ? `, tai ${g(rule.upTo)} jos tyydyttynyttä vähän` : '';
        return { status: 'fail', label, detail: `${g(n.fat)} (${limit}${range})` };
      }
      // Rasvaa välillä max–upTo: ratkaisee tyydyttyneen rasvan määrä.
      if (rule.satG !== undefined) {
        if (n.saturatedFat === undefined) return unknown('Rasva ja tyydyttynyt rasva', 'Tyydyttyneen rasvan määrä');
        const ok = n.saturatedFat <= rule.satG;
        return { status: ok ? 'pass' : 'fail', label: 'Rasva ja tyydyttynyt rasva', detail: `rasva ${g(n.fat)}, tyydyttynyttä ${g(n.saturatedFat)} (enintään ${g(rule.satG)})` };
      }
      if (satPct === undefined) return unknown('Rasva ja tyydyttynyt rasva', 'Tyydyttyneen rasvan määrä');
      const ok = satPct <= (rule.satPct ?? 100);
      return { status: ok ? 'pass' : 'fail', label: 'Rasva ja tyydyttynyt rasva', detail: `rasva ${g(n.fat)}, tyydyttynyttä ${Math.round(satPct)} % rasvasta (enintään ${rule.satPct} %)` };
    }
    case 'fatMin':
      if (n.fat === undefined) return unknown('Rasva', 'Rasvan määrä');
      return { status: n.fat >= rule.min ? 'pass' : 'fail', label: 'Rasva', detail: `${g(n.fat)} (vähintään ${g(rule.min)})` };
    case 'sat': {
      const label = 'Tyydyttynyt rasva';
      if (rule.maxG !== undefined) {
        if (n.saturatedFat === undefined) return unknown(label, 'Tyydyttyneen rasvan määrä');
        return { status: n.saturatedFat <= rule.maxG ? 'pass' : 'fail', label, detail: `${g(n.saturatedFat)} (enintään ${g(rule.maxG)})` };
      }
      if (satPct === undefined) return unknown(label, 'Tyydyttyneen rasvan määrä');
      return { status: satPct <= (rule.maxPct ?? 100) ? 'pass' : 'fail', label, detail: `${Math.round(satPct)} % rasvasta (enintään ${rule.maxPct} %)` };
    }
    case 'sugars':
      if (n.sugars === undefined) return unknown('Sokerit', 'Sokerien määrä');
      return { status: n.sugars <= rule.max ? 'pass' : 'fail', label: 'Sokerit', detail: `${g(n.sugars)} (enintään ${g(rule.max)})` };
    case 'fiber':
      if (n.fiber === undefined) return unknown('Kuitu', 'Kuidun määrä');
      return { status: n.fiber >= rule.min ? 'pass' : 'fail', label: 'Kuitu', detail: `${g(n.fiber)} (vähintään ${g(rule.min)})` };
    case 'salt':
      if (n.salt === undefined) return unknown('Suola', 'Suolan määrä');
      return { status: n.salt <= rule.max ? 'pass' : 'fail', label: 'Suola', detail: `${g(n.salt, 2)} (enintään ${g(rule.max, 2)})` };
    case 'porridgeSugarFiber': {
      const label = 'Sokerit ja kuitu';
      if (n.sugars === undefined || n.fiber === undefined) return unknown(label, 'Sokerien tai kuidun määrä');
      const ok = (n.sugars <= 7 && n.fiber >= 1) || (n.sugars <= 10 && n.fiber >= 2.5);
      return { status: ok ? 'pass' : 'fail', label, detail: `sokereita ${g(n.sugars)}, kuitua ${g(n.fiber)} (sokereita ≤ 7 g ja kuitua ≥ 1 g, tai sokereita ≤ 10 g ja kuitua ≥ 2,5 g)` };
    }
    case 'noAdded': {
      const { label, re } = ADDED[rule.what];
      if (!ingredients) return unknown(label, 'Ainesosaluettelo');
      const text = normalize(ingredients);
      return re.test(text)
        ? { status: 'fail', label, detail: 'ainesosaluettelossa on lisättyä' }
        : { status: 'pass', label, detail: 'ei ainesosaluettelossa' };
    }
    case 'manual':
      return { status: 'unknown', label: rule.text, detail: 'tarkista pakkauksesta' };
  }
}

export function assessHeartSymbol(group: HeartGroup, nutrition: Nutrition | undefined, ingredients?: string): HeartAssessment {
  if (group.excluded) return { group, status: 'excluded', results: [] };
  const results = group.rules.map((r) => evaluateRule(r, nutrition ?? {}, ingredients));
  const measurable = results.filter((_, i) => group.rules[i].kind !== 'manual');
  let status: HeartAssessment['status'];
  if (measurable.some((r) => r.status === 'fail')) status = 'notEligible';
  else if (measurable.some((r) => r.status === 'unknown')) status = 'unknown';
  else status = 'eligible';
  return { group, status, results };
}
