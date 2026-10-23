import { requireOptionalNativeModule } from 'expo';

export type Share = { kind: 'text'; text: string; subject: string } | { kind: 'image'; uri: string };

interface ShareIntentModule {
  consumeInitialShare(): Share | null;
  addListener(event: 'onShare', listener: (share: Share) => void): { remove: () => void };
}

// Puuttuu esim. Expo Go -sovelluksesta; silloin jakaminen ei ole käytettävissä.
const native = requireOptionalNativeModule<ShareIntentModule>('ShareIntent');

/** Sovellukseen "Jaa"-valikosta jaettu sisältö: käynnistyksessä ja sovelluksen ollessa auki. */
export function subscribeToShares(listener: (share: Share) => void): () => void {
  if (!native) return () => {};
  const initial = native.consumeInitialShare();
  if (initial) listener(initial);
  const sub = native.addListener('onShare', listener);
  return () => sub.remove();
}
