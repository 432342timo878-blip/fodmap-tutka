// Lisäravinnetietokannan päivitys ilman uutta APK:ta. APK-työnkulku julkaisee joka käännöksessä
// uusimman tietokannan GitHubin julkaisuun "supplements-db"; sovellus hakee sen kerran viikossa
// ja tallentaa puhelimeen (noin 5 Mt, liian iso AsyncStorageen).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

import { adoptDatabaseIfNewer, isSupplementDb, supplementDbInfo } from './database';

export const DB_URL = 'https://github.com/432342timo878-blip/fodmap-tutka/releases/download/supplements-db/supplements-db.json';
const CHECKED_KEY = 'supplementDbCheckedAt';
const CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 60000;

const savedFile = () => new File(Paths.document, 'supplements-db.json');

/** Käynnistyksessä: aiemmin ladattu tietokanta käyttöön, jos se on uudempi kuin sovelluksen mukana tullut. */
export async function loadSavedDatabase(): Promise<boolean> {
  try {
    const file = savedFile();
    if (!file.exists) return false;
    const db = JSON.parse(await file.text());
    return isSupplementDb(db) && adoptDatabaseIfNewer(db);
  } catch {
    return false;
  }
}

export type UpdateResult = 'updated' | 'upToDate' | 'notDue' | 'failed';

/** Hakee uusimman tietokannan, jos edellisestä tarkistuksesta on viikko (tai `force`). */
export async function updateDatabase(force = false): Promise<UpdateResult> {
  try {
    const checked = Number(await AsyncStorage.getItem(CHECKED_KEY)) || 0;
    if (!force && Date.now() - checked < CHECK_EVERY_MS) return 'notDue';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let text: string;
    try {
      const res = await fetch(DB_URL, { signal: controller.signal });
      if (!res.ok) return 'failed';
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    const db = JSON.parse(text);
    if (!isSupplementDb(db) || db.products.length < 500) return 'failed';
    await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
    if (db.updated === supplementDbInfo().updated || !adoptDatabaseIfNewer(db)) return 'upToDate';
    const file = savedFile();
    if (!file.exists) file.create();
    await file.write(text);
    return 'updated';
  } catch {
    return 'failed';
  }
}
