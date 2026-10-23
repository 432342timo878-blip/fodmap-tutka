import { BarcodeType, CameraView } from 'expo-camera';

export const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

/**
 * Avaa Googlen viivakoodinlukijan ja palauttaa luetun koodin, tai null jos käyttäjä perui.
 * Heittää virheen, jos lukija ei ole käytettävissä.
 */
export function scanBarcodeOnce(): Promise<string | null> {
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
