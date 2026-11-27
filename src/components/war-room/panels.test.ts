import { HtmlServer, Html } from "@effect/ui/html";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type { Faction } from "@/lib/faction";
import { WarBar } from "./panels";

function faction(start: number, enemyName = "Hell&#039;s Reapers"): Faction {
  return {
    ID: 1,
    ranked_wars: {
      10: {
        factions: {
          1: { name: "Us &amp; Friends", score: 100, chain: 0 },
          2: { name: enemyName, score: 50, chain: 0 },
        },
        war: { start, end: 0, target: 1000, winner: 0 },
      },
    },
  } as unknown as Faction;
}

const render = (data: Faction) => {
  const Bar = Html.component({ name: "Bar", model: Schema.Null, message: Schema.Never }).make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.div(WarBar(h, data, 1000)),
  });
  return Effect.runPromise(HtmlServer.renderToHtml(Bar, {})).then(({ html }) => html);
};

describe("WarBar faction names", () => {
  it("decodes HTML entities in the upcoming-war banner", async () => {
    const html = await render(faction(2000));
    expect(html).toContain(">Hell's Reapers<");
    expect(html).not.toContain("#039;");
  });

  it("decodes both live score names and their tooltips", async () => {
    const html = await render(faction(500));
    expect(html).toContain('title="Us &amp; Friends"');
    expect(html).toContain(">Us &amp; Friends<");
    expect(html).not.toContain("&amp;amp;");
  });

  it("renders decoded markup as text, not HTML", async () => {
    const html = await render(faction(2000, "&lt;img src=x onerror=alert(1)&gt;"));
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });
});
