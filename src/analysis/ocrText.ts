// Kuvasta tunnistetun tekstin siistiminen ainesosaluetteloksi.
//
// Pakkauksissa luettelo on usein usealla kielellä ja rivitetty tavutuksin:
//   "Ainesosat: vesi, vehnä-" / "jauho, suola." / "Ingredienser: vatten, ..."

const START = /(ainesosat|ainekset)\s*:?/i;

export function ingredientsFromOcrLines(lines: string[]): string {
  let text = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (text.endsWith('-') && /^[a-zåäö]/.test(line)) text = text.slice(0, -1) + line;
    else text = text ? `${text} ${line}` : line;
  }
  const start = text.match(START);
  if (start && start.index !== undefined) text = text.slice(start.index + start[0].length);
  // Ruotsinkielinen luettelo ja muut osiot jäävät pois analyysin siivouksessa (cleanIngredientText).
  return text.replace(/\s+/g, ' ').trim();
}
