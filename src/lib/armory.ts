export type ArmoryNews = { id: string; text: string; timestamp: number };

// Members stack energy with Xanax before a war starts, so those count too. A full stack
// starts about 28 hours out; spacing doses to avoid an overdose stretches it to about 48.
export const PRE_WAR_XANAX_SECONDS = 48 * 60 * 60;

export type XanaxUse = { total: number; beforeWar: number };

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

export function countArmoryXanax(
  news: (ArmoryNews & { beforeWar: boolean })[],
): Map<number, XanaxUse> {
  const counts = new Map<number, XanaxUse>();
  for (const item of news) {
    const use = parseArmoryXanax(item.text);
    if (!use) continue;
    const counted = counts.get(use.playerId) ?? { total: 0, beforeWar: 0 };
    counted.total += use.count;
    if (item.beforeWar) counted.beforeWar += use.count;
    counts.set(use.playerId, counted);
  }
  return counts;
}
