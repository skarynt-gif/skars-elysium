/**
 * Word-wraps a collection title onto a small pixel sign: up to `maxLines`
 * lines of `maxChars`, breaking long words and adding "…" if it overflows.
 */
export function wrapSignText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushLine = (line: string) => lines.push(line);

  for (let word of words) {
    // Break words longer than a whole line.
    while (word.length > maxChars) {
      if (current) {
        pushLine(current);
        current = '';
      }
      pushLine(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      pushLine(current);
      current = word;
    }
  }
  if (current) pushLine(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]!;
    kept[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
}
