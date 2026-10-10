import { describe, expect, it } from "vite-plus/test";
import { buildCommunication, type CommunicationPlayer } from "./communications";

const player: CommunicationPlayer = {
  id: 123,
  name: "BigLuigi",
  last_action: { status: "Online", timestamp: 0, relative: "2 minutes ago" },
  status: {
    state: "Traveling",
    description: "Traveling to Japan",
    details: "",
    color: "blue",
    until: 0,
  },
};

const anchor = `[BigLuigi [123]](https://www.torn.com/page.php?sid=attack&user2ID=123)`;

describe("communications", () => {
  it("links the player to their attack page", () => {
    expect(buildCommunication("help", player)).toBe(`🆘 Need help on ${anchor}`);
    expect(buildCommunication("dibs", player)).toBe(`🎯 Dibs on ${anchor}`);
  });
  it("alerts that the player is out", () => {
    expect(buildCommunication("online", player)).toBe(`🟢 ${anchor} is online and out!`);
  });
  it("reports travel status with ETA when known", () => {
    expect(buildCommunication("travel", player)).toBe(
      `✈️ ${anchor}: Traveling to Japan · ETA unknown`,
    );
    expect(buildCommunication("travel", player, { arrivalAt: 90 * 60_000, now: 0 })).toBe(
      `✈️ ${anchor}: Traveling to Japan · ETA ≈ 1h 30m (~01:30 TCT)`,
    );
  });
  it("can leave out emojis", () => {
    expect(buildCommunication("help", player, { emojis: false })).toBe(`Need help on ${anchor}`);
    expect(buildCommunication("online", player, { emojis: false })).toBe(
      `${anchor} is online and out!`,
    );
  });
  it("omits the ETA when not traveling", () => {
    const abroad = {
      ...player,
      status: { ...player.status, state: "Abroad", description: "In Japan" },
    };
    expect(buildCommunication("travel", abroad as CommunicationPlayer)).toBe(
      `✈️ ${anchor}: In Japan`,
    );
  });
});
