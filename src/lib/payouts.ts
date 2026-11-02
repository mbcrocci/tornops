import type { FactionAttack } from "@/lib/faction";
import { isBonusHit, isHit } from "@/lib/war-analysis";

const MONEY_SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** Reads amounts such as `750000000`, `$750,000,000`, `750m` or `1.5b`. */
export function parseMoney(input: string): number | null {
  const match = /^\$?\s*([\d.,]+)\s*([kmb]?)$/i.exec(input.trim());
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * (MONEY_SUFFIXES[match[2].toLowerCase()] ?? 1));
}

export type PayType = "respect" | "hit";

export type PayoutSettings = {
  /** The pool shared between the members, in dollars. */
  payout: number;
  payType: PayType;
  /** When false, each chain bonus hit counts `bonusRespect` instead of what it earned. */
  includeBonus: boolean;
  /**
   * A fixed respect per bonus hit, or "average" for the member's average respect over their
   * other hits.
   */
  bonusRespect: number | "average";
};

export type PayoutMember = {
  id: number;
  name: string;
  hits: number;
  bonusHits: number;
  /** Respect the faction earned from this member's hits. */
  respect: number;
  /** Respect after the bonus hit setting is applied, which per-respect pay is based on. */
  countedRespect: number;
  /** What each of this member's bonus hits counted as, when bonuses are replaced. */
  bonusHitRespect: number | null;
  share: number;
  payout: number;
};

export type PayoutSummary = {
  members: PayoutMember[];
  hits: number;
  bonusHits: number;
  respect: number;
  countedRespect: number;
  /** Dollars per counted respect or per hit, depending on the pay type. */
  rate: number;
  /** Dollars left over after every payout is rounded down to a whole dollar. */
  remainder: number;
};

/**
 * Splits the payout between the members who attacked, by respect or by hits. Only hits that
 * earned respect count. Payouts are rounded down so the total never exceeds the pool.
 */
export function summarizePayouts(
  outgoing: FactionAttack[],
  { payout, payType, includeBonus, bonusRespect }: PayoutSettings,
): PayoutSummary {
  const byMember = new Map<
    number,
    { id: number; name: string; hits: number; bonusHits: number; respect: number; bonus: number }
  >();
  for (const attack of outgoing) {
    if (!attack.attacker || !isHit(attack)) continue;
    const member = byMember.get(attack.attacker.id) ?? {
      id: attack.attacker.id,
      name: attack.attacker.name,
      hits: 0,
      bonusHits: 0,
      respect: 0,
      bonus: 0,
    };
    // Attacks come oldest first, so the latest name wins.
    member.name = attack.attacker.name;
    member.hits += 1;
    member.respect += attack.respect_gain;
    if (isBonusHit(attack)) {
      member.bonusHits += 1;
      member.bonus += attack.respect_gain;
    }
    byMember.set(member.id, member);
  }

  // A member whose only hits were bonus hits has no average of their own, so they get the
  // faction's average over every other hit.
  const tallies = [...byMember.values()];
  const otherHits = tallies.reduce((total, m) => total + m.hits - m.bonusHits, 0);
  const otherRespect = tallies.reduce((total, m) => total + m.respect - m.bonus, 0);
  const factionAverage = otherHits > 0 ? otherRespect / otherHits : 0;
  const rows = tallies.map(({ bonus, ...member }) => {
    if (includeBonus || member.bonusHits === 0) {
      return { ...member, countedRespect: member.respect, bonusHitRespect: null };
    }
    const others = member.hits - member.bonusHits;
    const bonusHitRespect =
      bonusRespect !== "average"
        ? bonusRespect
        : others > 0
          ? (member.respect - bonus) / others
          : factionAverage;
    return {
      ...member,
      countedRespect: member.respect - bonus + member.bonusHits * bonusHitRespect,
      bonusHitRespect,
    };
  });
  const sum = (pick: (member: (typeof rows)[number]) => number) =>
    rows.reduce((total, member) => total + pick(member), 0);
  const hits = sum((member) => member.hits);
  const countedRespect = sum((member) => member.countedRespect);
  const units = payType === "respect" ? countedRespect : hits;
  const rate = units > 0 ? payout / units : 0;

  const members = rows
    .map((member) => {
      const memberUnits = payType === "respect" ? member.countedRespect : member.hits;
      const share = units > 0 ? memberUnits / units : 0;
      return { ...member, share, payout: Math.floor(payout * share) };
    })
    .sort((a, b) => b.share - a.share || b.hits - a.hits || a.name.localeCompare(b.name));

  return {
    members,
    hits,
    bonusHits: sum((member) => member.bonusHits),
    respect: sum((member) => member.respect),
    countedRespect,
    rate,
    remainder: units > 0 ? payout - members.reduce((total, m) => total + m.payout, 0) : 0,
  };
}
