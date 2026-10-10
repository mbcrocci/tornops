import { playerAttackLink } from "./links";
import { formatStats, type PlanMember, type Target } from "./war-plan";

export type PlanMessageInput = {
  title: string;
  when: string;
  ours: number;
  theirs: number;
  theirStrength: number;
  cap?: number;
  targets: Target[];
  threats: PlanMember[];
  rally: PlanMember[];
};

/** Plain text that pastes cleanly into Discord or Torn faction chat. */
export function buildPlanMessage(plan: PlanMessageInput) {
  const lines = [
    `⚔️ ${plan.title}: ${plan.when}`,
    `Expected online: us ~${Math.round(plan.ours)} · them ~${Math.round(plan.theirs)}${
      plan.theirStrength ? ` (${formatStats(plan.theirStrength)} stats)` : ""
    }`,
  ];
  if (plan.targets.length) {
    lines.push(
      "",
      `🎯 Targets, usually offline then${plan.cap ? ` (≤ ${formatStats(plan.cap)})` : ""}:`,
      ...plan.targets.map(
        (target, index) =>
          `${index + 1}. ${target.name} [${target.id}] · ${formatStats(target.bs)} · offline ${Math.round(
            target.offline * 100,
          )}% — ${playerAttackLink(target.id)}`,
      ),
    );
  }
  if (plan.threats.length) {
    lines.push(
      "",
      `⚠️ Usually online then: ${plan.threats
        .map((member) => `${member.name} (${formatStats(member.bs)})`)
        .join(", ")}`,
    );
  }
  if (plan.rally.length) {
    lines.push("", `📣 Need online: ${plan.rally.map((member) => member.name).join(", ")}`);
  }
  return lines.join("\n");
}
