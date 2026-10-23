import * as ImagePicker from 'expo-image-picker';

import { recognizeTextAsync } from '../modules/text-recognition';
import { Nutrition, parseNutritionText } from './analysis/nutrition';
import { ingredientsFromOcrLines } from './analysis/ocrText';

/** Avaa kameran, käyttäjä rajaa kuvan, ja teksti tunnistetaan laitteella. null = kuvaus peruttiin. */
async function photographLines(): Promise<string[] | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Kameran käyttölupa puuttuu.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
  if (result.canceled || result.assets.length === 0) return null;
  return recognizeTextAsync(result.assets[0].uri);
}

/** Kuvaa ainesosaluettelon ja palauttaa siistityn tekstin. */
export async function photographIngredients(): Promise<string | null> {
  const lines = await photographLines();
  return lines && ingredientsFromOcrLines(lines);
}

/** Kuvaa ravintoarvotaulukon ja palauttaa luetut arvot (per 100 g). */
export async function photographNutrition(): Promise<Nutrition | null> {
  const lines = await photographLines();
  return lines && parseNutritionText(lines.join('\n'));
}

/** Kuvaa minkä tahansa tekstin (esim. lisäravinteen vitamiinitaulukon) ja palauttaa sen. */
export async function photographText(): Promise<string | null> {
  const lines = await photographLines();
  return lines && lines.join('\n');
}
