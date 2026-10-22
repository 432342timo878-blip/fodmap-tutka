// Sydänmerkki-tuotteen tunnistus nimen perusteella.
//
// sydanmerkki.fi ei julkaise viivakoodeja, joten skannatun tuotteen nimeä verrataan
// Sydänmerkki-tuotteiden nimiin (esim. "pirkka-luomu-paseerattu-tomaatti-500-g").
// Tuote tunnistetaan, kun kaikki Sydänmerkki-nimen sanat löytyvät tuotteen nimestä.

const UNIT = /^(\d+([.,]\d+)?|g|kg|ml|cl|dl|l|kpl|x|%|rs|ps)$/;

export function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)([a-zåäö%])/g, '$1 $2')
    .split(/[^a-z0-9åäöéü%]+/)
    .filter((t) => t.length > 0 && !UNIT.test(t));
}

export function createHeartSymbolMatcher(productSlugs: string[]) {
  const products = productSlugs.map(nameTokens).filter((tokens) => tokens.length >= 2);
  return (productName: string): boolean => {
    const tokens = new Set(nameTokens(productName));
    return products.some((p) => p.every((t) => tokens.has(t)));
  };
}
