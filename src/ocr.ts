import * as ImagePicker from 'expo-image-picker';

import { recognizeTextAsync } from '../modules/text-recognition';
import { ingredientsFromOcrLines } from './analysis/ocrText';

/**
 * Avaa kameran, käyttäjä rajaa ainesosaluettelon, ja teksti tunnistetaan laitteella.
 * Palauttaa tunnistetun ainesosatekstin tai null, jos kuvaus peruttiin.
 */
export async function photographIngredients(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Kameran käyttölupa puuttuu.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
  if (result.canceled || result.assets.length === 0) return null;
  const lines = await recognizeTextAsync(result.assets[0].uri);
  return ingredientsFromOcrLines(lines);
}
