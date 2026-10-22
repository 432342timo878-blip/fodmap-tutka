import { requireOptionalNativeModule } from 'expo';

interface TextRecognitionModule {
  recognizeAsync(uri: string): Promise<string[]>;
}

// Puuttuu esim. Expo Go -sovelluksesta; silloin tekstintunnistus ei ole käytettävissä.
const native = requireOptionalNativeModule<TextRecognitionModule>('TextRecognition');

export const isTextRecognitionAvailable = native !== null;

/** Tunnistaa tekstin kuvasta (file:// tai content:// -osoite). Palauttaa rivit. */
export function recognizeTextAsync(uri: string): Promise<string[]> {
  if (!native) return Promise.reject(new Error('Tekstintunnistus ei ole käytettävissä tässä versiossa.'));
  return native.recognizeAsync(uri);
}
