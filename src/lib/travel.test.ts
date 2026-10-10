import { describe, expect, it } from "vite-plus/test";
import type { StatusClass } from "./faction";
import { MAX_OBSERVATION_GAP, observeTravel, travelTimes } from "./travel";

const status = (
  state: StatusClass["state"],
  description: string = state,
  travel_type?: string,
): StatusClass => ({
  state,
  description,
  details: "",
  color: "blue",
  until: 0,
  travel_type,
});

describe("travel estimates", () => {
  it.each(["Okay", "Hospital", "Abroad"] as const)(
    "bounds departure from %s and defaults to Airstrip",
    (state) => {
      const before = observeTravel(undefined, status(state, "In Mexico"), 100_000);
      const after = observeTravel(before, status("Traveling", "Traveling to Mexico"), 110_000);
      expect(after.estimate).toMatchObject({
        departedAt: 105_000,
        arrivalAt: 1_185_000,
        earliestArrival: 1_180_000,
        latestArrival: 1_190_000,
        method: "Airstrip",
        assumedMethod: true,
      });
    },
  );
  it("uses explicit travel methods", () => {
    const before = observeTravel(undefined, status("Okay"), 100_000);
    for (const [index, method] of ["Standard", "Airstrip", "Private", "Business"].entries()) {
      const next = observeTravel(
        before,
        status("Traveling", "Traveling to Japan", method),
        110_000,
      );
      expect(next.estimate?.arrivalAt).toBe(105_000 + travelTimes.Japan[index] * 60_000);
      expect(next.estimate?.assumedMethod).toBe(false);
    }
  });
  it("does not invent departures for players first seen mid-flight", () => {
    const first = observeTravel(undefined, status("Traveling", "Traveling to China"), 100_000);
    expect(observeTravel(first, first.status, 110_000).estimate).toBeUndefined();
  });
  it("infers a return destination from abroad and retains it across polls", () => {
    const abroad = observeTravel(undefined, status("Abroad", "In South Africa"), 100_000);
    const returning = observeTravel(abroad, status("Traveling", "Returning to Torn"), 110_000);
    expect(returning.estimate?.destination).toBe("South Africa");
    expect(returning.estimate?.returning).toBe(true);
    expect(observeTravel(returning, returning.status, 120_000).estimate).toEqual(
      returning.estimate,
    );
  });
  it("clears estimates on arrival and creates a fresh return leg", () => {
    const home = observeTravel(undefined, status("Okay"), 100_000);
    const outbound = observeTravel(home, status("Traveling", "Traveling to Mexico"), 110_000);
    const abroad = observeTravel(outbound, status("Abroad", "In Mexico"), 1_200_000);
    expect(abroad.estimate).toBeUndefined();
    expect(
      observeTravel(abroad, status("Traveling", "Returning to Torn"), 1_210_000).estimate
        ?.departedAt,
    ).toBe(1_205_000);
  });
  it("ignores duplicate and out-of-order observations", () => {
    const first = observeTravel(undefined, status("Okay"), 100_000);
    expect(observeTravel(first, status("Traveling", "Traveling to Mexico"), 99_000)).toBe(first);
  });
  it("does not estimate unknown destinations", () => {
    const first = observeTravel(undefined, status("Okay"), 100_000);
    expect(
      observeTravel(first, status("Traveling", "Traveling"), 110_000).estimate,
    ).toBeUndefined();
  });
  it("does not bound departures across a gap in observations", () => {
    const before = observeTravel(undefined, status("Okay"), 100_000);
    const after = observeTravel(
      before,
      status("Traveling", "Traveling to Mexico"),
      100_000 + MAX_OBSERVATION_GAP + 1,
    );
    expect(after.estimate).toBeUndefined();
  });
  it("keeps an estimate across a gap while the flight cannot have landed", () => {
    const home = observeTravel(undefined, status("Okay"), 100_000);
    const outbound = observeTravel(home, status("Traveling", "Traveling to Japan"), 110_000);
    const resumed = observeTravel(outbound, outbound.status, 110_000 + 60 * 60_000);
    expect(resumed.estimate).toEqual(outbound.estimate);
  });
  it("drops an estimate after a gap in which the player could have flown again", () => {
    const home = observeTravel(undefined, status("Okay"), 100_000);
    const outbound = observeTravel(home, status("Traveling", "Traveling to Mexico"), 110_000);
    const resumed = observeTravel(outbound, outbound.status, outbound.estimate!.earliestArrival);
    expect(resumed.estimate).toBeUndefined();
  });
});
