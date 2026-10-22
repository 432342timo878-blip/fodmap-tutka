import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Näppäimistön korkeus. Android 15+ piirtää sovelluksen koko näytölle (edge-to-edge),
 * jolloin näppäimistö peittää alareunan kentät eikä näkymä kutistu itsestään.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
