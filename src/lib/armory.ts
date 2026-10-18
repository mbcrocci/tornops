export type ArmoryNews = { id: string; text: string; timestamp: number };

// Armory news reads like `<a href="…profiles.php?XID=123">mocci</a> used one of the faction's
// Xanax items`. The profile link is the only reliable way to tell members apart.
const XANAX_USE =
  /XID=(\d+)[^>]*>[^<]*<\/a>\s*used\s+(\S+)\s+of\s+the\s+faction's\s+Xanax\s+items?/i;

export function parseArmoryXanax(text: string): { playerId: number; count: number } | null {
  const match = XANAX_USE.exec(text);
  if (!match) return null;
  const amount = Number(match[2]);
  return {
    playerId: Number(match[1]),
    count: Number.isSafeInteger(amount) && amount > 0 ? amount : 1,
  };
}

export function countArmoryXanax(news: ArmoryNews[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of news) {
    const use = parseArmoryXanax(item.text);
    if (use) counts.set(use.playerId, (counts.get(use.playerId) ?? 0) + use.count);
  }
  return counts;
}
