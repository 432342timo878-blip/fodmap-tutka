import { describe, expect, it } from '@jest/globals';

import { adoptDatabaseIfNewer, findSupplement, isSupplementDb, searchSupplements, supplementDbInfo } from '../database';

const product = (ean: string, name: string, labelText: string, ingredients?: string) => ({ eans: [ean], name, shop: 'Testikauppa', labelText, ingredients });

describe('supplement database', () => {
  it('takes a downloaded database into use only when it is newer', () => {
    // Päiväykset kaukana tulevaisuudessa: sovelluksen mukana tuleva tietokanta (CI:ssä oikea, tänään koottu) on aina vanhempi.
    const v1 = { updated: '2999-01-01', products: [product('6400000000001', 'Magnesium 100', 'Magnesium 100 mg')] };
    expect(isSupplementDb(v1)).toBe(true);
    expect(adoptDatabaseIfNewer(v1)).toBe(true);
    expect(supplementDbInfo()).toEqual({ updated: '2999-01-01', size: 1 });
    expect(findSupplement('6400000000001')?.label.amounts).toEqual({ magnesium: 100 });

    // Sama tai vanhempi päiväys ei korvaa nykyistä.
    expect(adoptDatabaseIfNewer({ updated: '2998-12-01', products: [product('6400000000002', 'Vanha', '')] })).toBe(false);
    expect(findSupplement('6400000000002')).toBeUndefined();

    const v2 = { updated: '2999-02-01', products: [product('6400000000003', 'Magnesia purutabletti', '', 'magnesiumoksidi, sorbitoli, fruktoosi')] };
    expect(adoptDatabaseIfNewer(v2)).toBe(true);
    expect(findSupplement('6400000000001')).toBeUndefined();
    // Tuote ilman vitamiinitaulukkoa: ainesosat FODMAP-arvioon, ei määriä.
    const m = findSupplement('6400000000003');
    expect(m?.ingredients).toMatch(/sorbitoli/);
    expect(m?.label.amounts).toEqual({});
    expect(searchSupplements('magnesia').map((x) => x.name)).toEqual(['Magnesia purutabletti']);
  });

  it('rejects files that are not a database', () => {
    expect(isSupplementDb({ updated: '2026-10-25' })).toBe(false);
    expect(isSupplementDb({ updated: '2026-10-25', products: [{ name: 'x' }] })).toBe(false);
    expect(isSupplementDb(null)).toBe(false);
  });
});
