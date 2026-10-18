import { describe, expect, it } from "vite-plus/test";
import { countArmoryXanax, parseArmoryXanax } from "./armory";

const link = (id: number, name: string) =>
  `<a href = "http://www.torn.com/profiles.php?XID=${id}">${name}</a>`;

describe("parseArmoryXanax", () => {
  it("reads a single Xanax use", () => {
    expect(parseArmoryXanax(`${link(123, "mocci")} used one of the faction's Xanax items`)).toEqual(
      { playerId: 123, count: 1 },
    );
  });

  it("reads a numbered amount", () => {
    expect(parseArmoryXanax(`${link(7, "Ace")} used 3 of the faction's Xanax items`)).toEqual({
      playerId: 7,
      count: 3,
    });
  });

  it("ignores other armory items", () => {
    expect(
      parseArmoryXanax(`${link(7, "Ace")} used one of the faction's Blood Bag : A+ items`),
    ).toBeNull();
    expect(parseArmoryXanax(`${link(7, "Ace")} loaned 1x Xanax to themselves`)).toBeNull();
  });
});

describe("countArmoryXanax", () => {
  it("adds up uses per member", () => {
    const news = [
      `${link(1, "A")} used one of the faction's Xanax items`,
      `${link(2, "B")} used one of the faction's Xanax items`,
      `${link(1, "A")} used one of the faction's Xanax items`,
    ].map((text, index) => ({ id: String(index), text, timestamp: index, beforeWar: index === 0 }));
    expect(countArmoryXanax(news)).toEqual(
      new Map([
        [1, { total: 2, beforeWar: 1 }],
        [2, { total: 1, beforeWar: 0 }],
      ]),
    );
  });
});
