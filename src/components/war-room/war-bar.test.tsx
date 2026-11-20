// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Faction } from "@/lib/faction";
import { WarBar } from "./war-bar";

const { useUserFactionData } = vi.hoisted(() => ({ useUserFactionData: vi.fn() }));
vi.mock("@/hooks/use-torn", () => ({ useUserFactionData }));
vi.mock("@/hooks/use-now", () => ({ useNowSeconds: () => 1000 }));
afterEach(cleanup);

function faction(start: number): Faction {
  return {
    ID: 1,
    ranked_wars: {
      10: {
        factions: {
          1: { name: "Us &amp; Friends", score: 100, chain: 0 },
          2: { name: "Hell&#039;s Reapers", score: 50, chain: 0 },
        },
        war: { start, end: 0, target: 1000, winner: 0 },
      },
    },
  } as unknown as Faction;
}

describe("WarBar faction names", () => {
  it("decodes HTML entities in the upcoming-war banner", () => {
    useUserFactionData.mockReturnValue({ data: faction(2000) });
    const { container } = render(<WarBar />);
    expect(screen.getByText("Hell's Reapers")).toBeTruthy();
    expect(container.textContent).not.toContain("&#039;");
  });

  it("decodes both live score names and their tooltips", () => {
    useUserFactionData.mockReturnValue({ data: faction(500) });
    render(<WarBar />);
    expect(screen.getByTitle("Us & Friends").textContent).toBe("Us & Friends");
    expect(screen.getByTitle("Hell's Reapers").textContent).toBe("Hell's Reapers");
  });

  it("renders decoded markup as text, not HTML", () => {
    const data = faction(2000);
    data.ranked_wars[10].factions[2].name = "&lt;img src=x onerror=alert(1)&gt;";
    useUserFactionData.mockReturnValue({ data });
    const { container } = render(<WarBar />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});
