import { BarcodeType, CameraView } from 'expo-camera';

import { isValidBarcode } from './barcode';

// Ei UPC-E:tä: nopeasti liikkuvasta kamerasta lukija voi tulkita osan EAN-13-koodista lyhyeksi
// UPC-E-koodiksi. Suomalaisissa tuotteissa on EAN-13 tai EAN-8.
export const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a'];

/** Väärin luettu koodi (tarkistenumero ei täsmää) luetaan uudelleen enintään näin monta kertaa. */
const RETRIES = 2;

/**
 * Avaa Googlen viivakoodinlukijan ja palauttaa luetun koodin, tai null jos käyttäjä perui.
 * Heittää virheen, jos lukija ei ole käytettävissä.
 */
export async function scanBarcodeOnce(): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const code = await scanOnce();
    if (code === null || isValidBarcode(code) || attempt >= RETRIES) return code;
  }
}

function scanOnce(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const sub = CameraView.onModernBarcodeScanned(({ data }) => {
      sub.remove();
      resolve(data?.trim() || null);
    });
    CameraView.launchScanner({ barcodeTypes: BARCODE_TYPES }).catch((e: unknown) => {
      sub.remove();
      const message = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(message)) resolve(null);
      else reject(new Error(message));
    });
  });
}
