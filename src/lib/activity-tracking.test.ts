import { describe, expect, it } from "vite-plus/test";
import { addObservation } from "./activity-tracking";
import type { Faction, StatusEnum } from "./faction";

const at = Date.UTC(2026, 9, 10, 23);
function faction(statuses: Record<string, StatusEnum>) {
  return {
    ID: 42,
    name: "Opponent",
    members: Object.fromEntries(
      Object.entries(statuses).map(([id, status]) => [
        id,
        { name: `Member ${id}`, last_action: { status } },
      ]),
    ),
  } as Faction;
}

describe("presence observations", () => {
  it("deduplicates a minute across repeated requests without changing the prior row", () => {
    const first = addObservation(undefined, faction({ 1: "Online" }), at);
    const duplicate = addObservation(first, faction({ 1: "Offline" }), at + 30_000);
    expect(duplicate).toEqual(first);
    const next = addObservation(first, faction({ 1: "Offline" }), at + 60_000);
    expect(next.members[1]).toMatchObject({ online: 1, offline: 1 });
    expect(first.members[1].offline).toBe(0);
  });
  it("keeps successive hours separate, including midnight", () => {
    expect(addObservation(undefined, faction({ 1: "Online" }), at + 3_600_000).hour).toBe(
      Date.UTC(2026, 9, 11),
    );
  });
});
