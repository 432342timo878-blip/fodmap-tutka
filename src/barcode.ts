// Viivakoodin tarkistus ja kaupan omat koodit.

/** GTIN-tarkistenumero (EAN-13, EAN-8, UPC-A): painot 3,1,3,… oikealta ilman tarkistenumeroa. */
function checkDigit(digits: string): number {
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10;
}

/** Onko koodi kelvollinen EAN-13, EAN-8 tai UPC-A? Väärin luettu koodi jää yleensä kiinni tarkistenumerosta. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Kaupan oma koodi (EAN-13, alkaa 2:lla): paistopisteen ja punnittavien tuotteiden tarrat. Koodissa on
 * tuotenumero ja hinta tai paino, esim. Coop voicroissant 2001302801232 = tuote 20013028 + hinta 0123.
 */
export const isInStoreCode = (code: string) => /^2\d{12}$/.test(code);

/**
 * Kaupan oman koodin tuotenumero ilman hintaa: S-kaupat listaa tuotteen koodilla, jossa hinnan
 * paikalla on nollat (2001302800006). Muut koodit palautetaan sellaisenaan.
 */
export function catalogueCode(code: string): string {
  if (!isInStoreCode(code)) return code;
  const body = `${code.slice(0, 8)}0000`;
  return `${body}${checkDigit(body)}`;
}
