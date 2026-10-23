// Väliaikainen: missä muodossa Tokmannin tuotesivun ainesosat ja ravintosisältö ovat.
const urls = [
  'https://www.tokmanni.fi/kulta-muro-225-g-keksi-7310520005540',
  'https://www.tokmanni.fi/puru-magnesium-puhdistamo-90-kpl-6430039229303',
  'https://www.tokmanni.fi/valipalapatukka-sportlife-70-g-kauraherkku-jogurt-6430018362687',
];
for (const u of urls) {
  const html = await (await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' } })).text();
  console.log(`\n##### ${u} (${html.length})`);
  for (const word of ['Ainesosat', 'Ravintosisältö', 'Ravintoarvo', 'Vaikuttavat', 'Päivittäisannos', 'Sisältää']) {
    let i = -1, n = 0;
    while ((i = html.indexOf(word, i + 1)) >= 0 && n++ < 2) {
      console.log(`--- ${word} @${i}:`, html.slice(Math.max(0, i - 250), i + 700).replace(/\s+/g, ' '));
    }
  }
}
