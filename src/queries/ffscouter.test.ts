import { describe, expect, it } from "vite-plus/test";
import { playerIds } from "./ffscouter";

describe("FFScouter stats arguments", () => {
  it("names one entry for a reordered or repeated roster, so it isn't fetched again", () => {
    expect(playerIds([2, 1, 2])).toEqual(playerIds([1, 2]));
  });
});
