import type { Member } from "./faction";
import { playerAttackLink } from "./links";
import { cleanStatusDescription } from "./status";

export type CommunicationKind = "help" | "online" | "travel" | "dibs";

export type CommunicationPlayer = Pick<Member, "name" | "last_action" | "status"> & { id: number };

export const COMMUNICATIONS: { kind: CommunicationKind; label: string }[] = [
  { kind: "help", label: "Request help" },
  { kind: "online", label: "Alert online" },
  { kind: "travel", label: "Report travel status" },
  { kind: "dibs", label: "Request dibs" },
];

export function playerAttackMarkdownLink(player: Pick<CommunicationPlayer, "id" | "name">) {
  return `[${player.name} ${player.id}](${playerAttackLink(player.id)})`;
}

function formatEta(arrivalAt: number, now: number) {
  const minutes = Math.max(0, Math.ceil((arrivalAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  // Torn City Time is UTC; an absolute time stays useful after the message ages in chat.
  const arrival = new Date(arrivalAt).toISOString().slice(11, 16);
  return `${hours ? `${hours}h ` : ""}${minutes % 60}m (~${arrival} TCT)`;
}

/** Markdown message for Torn faction chat, linking the player to their attack page. */
export function buildCommunication(
  kind: CommunicationKind,
  player: CommunicationPlayer,
  options: { arrivalAt?: number; now?: number; emojis?: boolean } = {},
) {
  const link = playerAttackMarkdownLink(player);
  const emoji = (symbol: string) => (options.emojis === false ? "" : `${symbol} `);
  switch (kind) {
    case "help":
      return `${emoji("🆘")}Need help on ${link}`;
    case "online":
      return `${emoji("🟢")}${link} is online and out!`;
    case "travel": {
      const description = cleanStatusDescription(player.status.description);
      const eta =
        player.status.state !== "Traveling"
          ? ""
          : options.arrivalAt
            ? ` · ETA ≈ ${formatEta(options.arrivalAt, options.now ?? Date.now())}`
            : " · ETA unknown";
      return `${emoji("✈️")}${link}: ${description}${eta}`;
    }
    case "dibs":
      return `${emoji("🎯")}Dibs on ${link}`;
  }
}
