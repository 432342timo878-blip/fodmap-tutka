import { describe, expect, it } from '@jest/globals';

import { catalogueCode, isInStoreCode, isValidBarcode } from '../barcode';

describe('barcodes', () => {
  it('checks the check digit of EAN-13, EAN-8 and UPC-A', () => {
    expect(isValidBarcode('6411402202208')).toBe(true); // Fazer Puikula
    expect(isValidBarcode('6411402202209')).toBe(false);
    // Kaksi vierekkäistä numeroa väärin päin.
    expect(isValidBarcode('6414102202208')).toBe(false);
    expect(isValidBarcode('96195529')).toBe(true); // EAN-8
    expect(isValidBarcode('96195528')).toBe(false);
    expect(isValidBarcode('036000291452')).toBe(true); // UPC-A
    expect(isValidBarcode('12345')).toBe(false);
  });

  it('turns in-store bakery codes into the catalogue code (price part zero)', () => {
    // Coop voicroissant: tarran hinta 1,23 € → S-kauppojen koodi.
    expect(isInStoreCode('2001302801232')).toBe(true);
    expect(catalogueCode('2001302801232')).toBe('2001302800006');
    expect(catalogueCode('2001302800006')).toBe('2001302800006');
    expect(catalogueCode('2002045100385')).toBe('2002045100002');
    expect(isValidBarcode(catalogueCode('2007723912345'))).toBe(true);
    // Tavalliset koodit ennallaan.
    expect(catalogueCode('6411402202208')).toBe('6411402202208');
    expect(catalogueCode('20013028')).toBe('20013028');
  });
});
