import { describe, expect, it } from "vite-plus/test";
import { addObservation, analyzeActivity } from "./activity-tracking";
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

describe("activity patterns", () => {
  it("distinguishes observed offline from hours with no observations", () => {
    const analysis = analyzeActivity(
      [addObservation(undefined, faction({ 1: "Offline" }), at)],
      false,
      "UTC",
    );
    expect(analysis.hourly[23].average).toBe(0);
    expect(analysis.hourly[22].average).toBeNull();
    expect(analysis.days.get("2026-10-10")?.[22]).toBeNull();
  });
  it("includes Idle only when requested", () => {
    const row = addObservation(undefined, faction({ 1: "Online", 2: "Idle", 3: "Offline" }), at);
    expect(analyzeActivity([row], false, "UTC").hourly[23].average).toBe(1);
    expect(analyzeActivity([row], true, "UTC").hourly[23].average).toBe(2);
  });
  it("uses each member's observed roster samples rather than treating absence as offline", () => {
    const first = addObservation(undefined, faction({ 1: "Online" }), at);
    const row = addObservation(first, faction({ 1: "Offline", 2: "Online" }), at + 60_000);
    const analysis = analyzeActivity([row], false, "UTC");
    expect(analysis.hourly[23].average).toBe(1);
    expect(analysis.members.find((member) => member.id === "1")?.hourly[23]).toEqual({
      active: 1,
      samples: 2,
    });
    expect(analysis.members.find((member) => member.id === "2")?.hourly[23]).toEqual({
      active: 1,
      samples: 1,
    });
  });
  it("weights hourly averages by actual samples and counts distinct days", () => {
    let first = addObservation(undefined, faction({ 1: "Online", 2: "Online" }), at);
    first = addObservation(first, faction({ 1: "Online", 2: "Online" }), at + 60_000);
    const second = addObservation(
      undefined,
      faction({ 1: "Offline", 2: "Offline" }),
      at + 86_400_000,
    );
    const hour = analyzeActivity([first, second], false, "UTC").hourly[23];
    expect(hour.average).toBeCloseTo(4 / 3);
    expect(hour.days.size).toBe(2);
    expect(hour.samples).toBe(3);
  });
  it("converts hour and calendar day together in the display timezone", () => {
    const analysis = analyzeActivity(
      [addObservation(undefined, faction({ 1: "Online" }), at)],
      false,
      "Asia/Singapore",
    );
    expect(analysis.hourly[7].average).toBe(1);
    expect(analysis.days.has("2026-10-11")).toBe(true);
  });
  it("combines the repeated hour at the daylight saving change", () => {
    const first = addObservation(undefined, faction({ 1: "Online" }), Date.UTC(2026, 9, 25, 0));
    const second = addObservation(undefined, faction({ 1: "Offline" }), Date.UTC(2026, 9, 25, 1));
    const hour = analyzeActivity([first, second], false, "Europe/London").hourly[1];
    expect(hour.average).toBe(0.5);
    expect(hour.days.size).toBe(1);
    expect(hour.samples).toBe(2);
  });
});
