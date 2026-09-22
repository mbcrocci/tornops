import { describe, expect, it } from "vitest";
import type { FFScouterActivityBucket } from "@/hooks/use-ffscouter";
import { analyzeFactionActivity, analyzeMemberActivity } from "./ffscouter-activity-history";

function bucket(timestamp: string, score: number): FFScouterActivityBucket {
  return {
    ts: Math.floor(new Date(timestamp).getTime() / 1000),
    activity_score: score,
    active_players: score,
    active_ratio: score / 10,
  };
}

describe("FFScouter activity analysis", () => {
  it("ranks a three-hour window using daily online counts", () => {
    const result = analyzeFactionActivity(
      [
        bucket("2026-09-20T10:00:00Z", 10),
        bucket("2026-09-20T11:00:00Z", 8),
        bucket("2026-09-20T12:00:00Z", 6),
        bucket("2026-09-21T10:00:00Z", 6),
        bucket("2026-09-21T11:00:00Z", 4),
        bucket("2026-09-21T12:00:00Z", 2),
      ],
      "UTC",
    );

    expect(result.windows[10]).toMatchObject({
      typicalMembers: 6,
      averageMembers: 6,
      floorMembers: 4,
      bestMembers: 8,
      daysWithCoverage: 2,
      totalDays: 2,
    });
  });

  it("finds a member's recurring activity window", () => {
    const result = analyzeMemberActivity(
      [
        {
          playerId: 42,
          buckets: [
            bucket("2026-09-20T10:00:00Z", 1),
            bucket("2026-09-20T11:00:00Z", 0),
            bucket("2026-09-21T10:00:00Z", 1),
            bucket("2026-09-21T11:00:00Z", 0),
          ],
        },
      ],
      new Map([[42, "Reliable member"]]),
      "UTC",
    );

    expect(result[0]).toMatchObject({
      id: 42,
      name: "Reliable member",
      activeBuckets: 2,
      activeDays: 2,
      reliableWindow: {
        startHour: 10,
        daysSeen: 2,
        totalDays: 2,
        reliability: 1,
      },
    });
  });
});
