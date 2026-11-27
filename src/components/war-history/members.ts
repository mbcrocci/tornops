import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ArrowDown, Search, UserCheck, UserX } from "lucide";
import { Opaque } from "@/domain/schema";
import type { XanaxUse } from "@/lib/armory";
import {
  type AbsentMember,
  ENERGY_PER_ATTACK,
  type MemberBonuses,
  type MemberSummary,
} from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Icon } from "../ui/icon";
import { Card, CardContent, CardHeader, CardTitle, inputClass } from "../ui/primitives";
import { Tip } from "../ui/tip";
import { formatDuration, formatPercent, formatRespect, formatWindow } from "./format";

const SortKey = Schema.Literals([
  "reliability",
  "hits",
  "failed",
  "energy",
  "xanax",
  "chainWatch",
  "respectPerHit",
  "respect",
  "hitsTaken",
]);
type SortKey = typeof SortKey.Type;

type Xanax = Readonly<Record<number, XanaxUse>>;

const SORTERS: Record<SortKey, (member: MemberSummary, armoryXanax: Xanax | null) => number> = {
  reliability: (member) => member.reliableWindow?.confidence ?? 0,
  hits: (member) => member.hits,
  failed: (member) => (member.attacks ? member.failed / member.attacks : 0),
  energy: (member) => member.energy,
  xanax: (member, armoryXanax) => armoryXanax?.[member.id]?.total ?? 0,
  chainWatch: (member) => member.chainWatch?.share ?? 0,
  respectPerHit: (member) => member.respectPerHit,
  respect: (member) => member.respect,
  hitsTaken: (member) => member.hitsTaken,
};

const hasBonuses = (bonuses: MemberBonuses) =>
  bonuses.chainBonuses.length > 0 ||
  bonuses.modifiers.length > 0 ||
  (bonuses.averageChainMultiplier ?? 1) > 1;

const MemberTableMessage = UiSchema.TaggedEnum({
  UpdatedSearch: { value: Schema.String },
  ClickedSort: { key: SortKey },
});
type MemberTableMessage = typeof MemberTableMessage.Type;
type H = Html.H<MemberTableMessage>;

const BonusBreakdown = (h: H, bonuses: MemberBonuses) =>
  h.div.class("grid gap-1.5 py-0.5 text-left font-mono").children(
    bonuses.chainBonuses.length > 0 &&
      h.div.children(
        h.div
          .class("mb-0.5 text-[10px] uppercase tracking-wider opacity-70")
          .children("Chain bonus hits"),
        // A member can land the same bonus hit in several chains.
        bonuses.chainBonuses.map((bonus, index) =>
          h.div
            .key(`${bonus.chain}-${index}`)
            .class("flex justify-between gap-4 tabular-nums")
            .children(
              h.span(`#${bonus.chain.toLocaleString()}`),
              h.span(formatRespect(bonus.respect)),
            ),
        ),
      ),
    (bonuses.modifiers.length > 0 || (bonuses.averageChainMultiplier ?? 1) > 1) &&
      h.div.children(
        h.div
          .class("mb-0.5 text-[10px] uppercase tracking-wider opacity-70")
          .children("Respect modifiers"),
        (bonuses.averageChainMultiplier ?? 1) > 1 &&
          h.div
            .class("flex justify-between gap-4 tabular-nums")
            .children(
              h.span("Chain"),
              h.span(`${bonuses.averageChainMultiplier?.toFixed(2)}× avg`),
            ),
        bonuses.modifiers.map((modifier) =>
          h.div
            .key(modifier.key)
            .class("flex justify-between gap-4 tabular-nums")
            .children(
              h.span(modifier.label),
              h.span(
                `${modifier.hits} ${modifier.hits === 1 ? "hit" : "hits"} · ${modifier.averageMultiplier.toFixed(2)}×`,
              ),
            ),
        ),
      ),
  );

export const ProfileLink = <M>(h: Html.H<M>, id: number, name: string) =>
  h.a
    .attrs({
      href: `https://www.torn.com/profiles.php?XID=${id}`,
      target: "_blank",
      rel: "noreferrer",
    })
    .class("font-medium hover:text-primary hover:underline")
    .children(name);

const SortHeader = (
  h: H,
  options: {
    readonly label: string;
    readonly key: SortKey;
    readonly active: SortKey;
    readonly align?: "left" | "right";
    readonly title?: string;
  },
) =>
  h.th
    .class(cn("px-3 py-2 font-medium", options.align === "right" && "text-right"))
    .attr("aria-sort", options.active === options.key ? "descending" : undefined)
    .children(
      h.button
        .attrs({ type: "button", title: options.title })
        .on("click", MemberTableMessage.ClickedSort({ key: options.key }))
        .class(
          cn(
            "inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
            options.active === options.key && "text-foreground",
          ),
        )
        .children(
          options.label,
          options.active === options.key && Icon(h, ArrowDown, { class: "size-3" }),
        ),
    );

const DOTTED =
  "cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-4";
const NUM = "px-3 py-2.5 text-right font-mono tabular-nums";

/** Each member's most dependable three-hour window, and how well they hit. */
export const MemberTable = Html.component({
  name: "MemberTable",
  props: Schema.Struct({
    members: Opaque<ReadonlyArray<MemberSummary>>(),
    armoryXanax: Opaque<Xanax | null>(),
    armoryXanaxError: Schema.Boolean,
  }),
  model: Schema.Struct({ search: Schema.String, sortKey: SortKey }),
  message: MemberTableMessage,
}).make({
  init: () => ({ search: "", sortKey: "reliability" as SortKey }),
  update: {
    UpdatedSearch: ($, { value }) => $.evolve({ search: value }),
    ClickedSort: ($, { key }) => $.evolve({ sortKey: key }),
  },
  view: (h, model) => {
    const { members, armoryXanax, armoryXanaxError } = h.props;
    const showFairFight = members.some((member) => member.fairFight !== null);
    const query = model.search.trim().toLowerCase();
    const sorter = SORTERS[model.sortKey];
    const rows = members
      .filter((member) => member.attacks > 0 && member.name.toLowerCase().includes(query))
      .sort((a, b) => sorter(b, armoryXanax) - sorter(a, armoryXanax) || b.hits - a.hits);
    const sort = (label: string, key: SortKey, align?: "left" | "right", title?: string) =>
      SortHeader(h, {
        label,
        key,
        active: model.sortKey,
        ...(align ? { align } : {}),
        ...(title ? { title } : {}),
      });

    return Card(h).children(
      CardHeader(h).children(
        h.div.class("flex flex-col justify-between gap-3 sm:flex-row sm:items-end").children(
          h.div.children(
            CardTitle(h, { class: "flex items-center gap-2" }).children(
              Icon(h, UserCheck, { class: "size-4 text-primary" }),
              " Who can I count on?",
            ),
            h.p
              .class("mt-1 text-xs text-muted-foreground")
              .children("Each member's most dependable three-hour window, and how well they hit"),
            armoryXanaxError &&
              h.p
                .class("mt-1 text-xs text-destructive")
                .children(
                  "Armory Xanax use could not be loaded. It needs faction API access on the key.",
                ),
          ),
          h.label.class("relative block").children(
            Icon(h, Search, {
              class:
                "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
            }),
            h.input
              .attrs({ placeholder: "Find a member", "aria-label": "Find a member" })
              .class(inputClass("w-full pl-8 sm:w-60"))
              .value(model.search)
              .on("input", ({ value }) => MemberTableMessage.UpdatedSearch({ value })),
          ),
        ),
      ),
      CardContent(h, { class: "overflow-x-auto px-0" }).children(
        h.table.class("w-full min-w-[1200px] text-sm").children(
          h.thead
            .class("border-y bg-muted/35 text-left text-xs text-muted-foreground")
            .children(
              h.tr.children(
                h.th.class("px-4 py-2 font-medium").children("Member"),
                h.th.class("px-3 py-2 font-medium").children("Best window"),
                sort(
                  "Reliability",
                  "reliability",
                  "left",
                  "A cautious estimate that rewards being seen on many days, not one lucky day",
                ),
                sort("Hits", "hits"),
                sort("Wasted", "failed"),
                sort(
                  "Energy",
                  "energy",
                  "right",
                  `${ENERGY_PER_ATTACK} energy per attack, including assists and failed attacks, less what Revitalize procs gave back`,
                ),
                sort(
                  "Chain watch",
                  "chainWatch",
                  "right",
                  "Sum over their chain hits of the time since the previous chain hit, divided by the chain time of every chain in the selected wars. High means they kept the chain alive.",
                ),
                sort(
                  "Armory Xanax",
                  "xanax",
                  "right",
                  "Xanax taken from the faction armory during the selected wars, or in the 48 hours before each one started",
                ),
                sort("Respect / hit", "respectPerHit", "right", "Chain bonus hits excluded"),
                showFairFight &&
                  h.th.class("px-3 py-2 text-right font-medium").children("Fair fight"),
                sort("Respect", "respect", "right"),
                sort("Hits taken", "hitsTaken", "right"),
              ),
            ),
          h.tbody.class("divide-y").children(
            rows.map((member) => {
              const window = member.reliableWindow;
              const xanax = armoryXanax?.[member.id];
              const watch = member.chainWatch;
              return h.tr
                .key(String(member.id))
                .class("hover:bg-muted/25")
                .children(
                  h.td
                    .class("px-4 py-2.5")
                    .children(
                      ProfileLink(h, member.id, member.name),
                      h.span
                        .class("ml-2 font-mono text-[10px] text-muted-foreground")
                        .children(String(member.id)),
                    ),
                  h.td
                    .class("px-3 py-2.5 font-mono text-xs font-medium")
                    .children(window ? formatWindow(window.startHour) : "–"),
                  h.td
                    .class("px-3 py-2.5")
                    .children(
                      window
                        ? h.div
                            .class("flex items-center gap-2")
                            .children(
                              h.div
                                .class("h-1.5 w-16 bg-muted")
                                .children(
                                  h.div
                                    .class(
                                      cn(
                                        "h-full",
                                        window.confidence >= 0.6
                                          ? "bg-primary"
                                          : window.confidence >= 0.3
                                            ? "bg-primary/60"
                                            : "bg-muted-foreground/50",
                                      ),
                                    )
                                    .style({ width: `${window.confidence * 100}%` }),
                                ),
                              h.span
                                .class("font-mono text-xs tabular-nums")
                                .children(formatPercent(window.confidence)),
                              h.span
                                .class("font-mono text-[10px] text-muted-foreground")
                                .children(`${window.daysSeen}/${window.sampledDays} days`),
                            )
                        : "–",
                    ),
                  h.td
                    .class("px-3 py-2.5 font-mono tabular-nums")
                    .children(
                      String(member.hits),
                      h.span
                        .class("ml-1 text-[10px] text-muted-foreground")
                        .children(`/ ${member.attacks}`),
                    ),
                  h.td
                    .class(
                      cn(
                        "px-3 py-2.5 font-mono tabular-nums",
                        member.failed === 0 && "text-muted-foreground",
                      ),
                    )
                    .children(String(member.failed)),
                  h.td.class(NUM).children(
                    member.energy.toLocaleString(),
                    h.span.class("ml-1 text-[10px] text-muted-foreground").children("E"),
                    member.revitalizeProcs > 0 &&
                      h.div
                        .class("text-[10px] text-emerald-600 dark:text-emerald-400")
                        .attr(
                          "title",
                          `${member.revitalizeProcs * ENERGY_PER_ATTACK} energy given back by Revitalize`,
                        )
                        .children(`${member.revitalizeProcs} revitalize`),
                  ),
                  h.td.class(cn(NUM, !watch?.share && "text-muted-foreground")).children(
                    watch === null
                      ? "–"
                      : watch.hits === 0
                        ? formatPercent(0)
                        : Tip(h, {
                            key: `watch-${member.id}`,
                            props: { class: DOTTED, side: "left", popupClass: "font-mono" },
                            slots: {
                              trigger: `${(watch.share * 100).toFixed(1)}%`,
                              content: h.span.children(
                                `${formatDuration(watch.seconds)} of ${formatDuration(watch.chainSeconds)} chain time`,
                                h.br,
                                `${watch.hits} chain ${watch.hits === 1 ? "hit" : "hits"}, on average ${formatDuration(
                                  watch.seconds / watch.hits,
                                )} after the previous one`,
                              ),
                            },
                          }),
                  ),
                  h.td
                    .class(cn(NUM, !xanax && "text-muted-foreground"))
                    .children(
                      armoryXanax ? String(xanax?.total ?? 0) : "–",
                      (xanax?.beforeWar ?? 0) > 0 &&
                        h.div
                          .class("text-[10px] text-muted-foreground")
                          .children(`${xanax?.beforeWar} before start`),
                    ),
                  h.td
                    .class(NUM)
                    .children(
                      member.hits - member.bonusHits > 0
                        ? formatRespect(member.respectPerHit)
                        : "–",
                    ),
                  showFairFight &&
                    h.td
                      .class(NUM)
                      .children(
                        member.fairFight === null ? "–" : `${member.fairFight.toFixed(2)}×`,
                      ),
                  h.td.class(NUM).children(
                    hasBonuses(member.bonuses)
                      ? Tip(h, {
                          key: `bonus-${member.id}`,
                          props: { class: DOTTED, side: "left" },
                          slots: {
                            trigger: h.span.children(
                              formatRespect(member.respect),
                              member.bonusHits > 0 &&
                                h.span
                                  .class("ml-1 text-[10px] text-muted-foreground")
                                  .children("+bonus"),
                            ),
                            content: BonusBreakdown(h, member.bonuses),
                          },
                        })
                      : formatRespect(member.respect),
                  ),
                  h.td
                    .class("px-4 py-2.5 text-right font-mono tabular-nums")
                    .children(String(member.hitsTaken)),
                );
            }),
          ),
        ),
        rows.length === 0 &&
          h.p
            .class("px-4 py-8 text-center text-sm text-muted-foreground")
            .children("No member matches that search."),
      ),
    );
  },
});

const JOINED_LABELS: Record<AbsentMember["joined"], string> = {
  before: "In the faction for every selected war",
  during: "Joined while the selected wars were running",
  after: "Joined after the selected wars",
};

export const AbsentMembers = <M>(
  h: Html.H<M>,
  absent: ReadonlyArray<AbsentMember>,
  rosterAvailable: boolean,
) => {
  const groups = (["before", "during", "after"] as const)
    .map((joined) => ({ joined, members: absent.filter((member) => member.joined === joined) }))
    .filter((group) => group.members.length > 0);
  return Card(h).children(
    CardHeader(h).children(
      CardTitle(h, { class: "flex items-center gap-2" }).children(
        Icon(h, UserX, { class: "size-4 text-destructive" }),
        " No successful war hits",
      ),
      h.p
        .class("text-xs text-muted-foreground")
        .children(
          "Current members without a single scoring hit in the selected wars. Join dates are estimated from days in faction.",
        ),
    ),
    CardContent(h).children(
      !rosterAvailable
        ? h.p
            .class("text-sm text-muted-foreground")
            .children(
              "The faction roster could not be loaded, so members without hits can't be listed.",
            )
        : groups.length === 0
          ? h.p
              .class("text-sm text-muted-foreground")
              .children("Every current member landed a hit.")
          : h.div.class("space-y-5").children(
              groups.map((group) =>
                h.section.key(group.joined).children(
                  h.h3
                    .class(
                      cn(
                        "mb-2 text-xs font-medium",
                        group.joined === "before" ? "text-foreground" : "text-muted-foreground",
                      ),
                    )
                    .children(`${JOINED_LABELS[group.joined]} · ${group.members.length}`),
                  h.div.class("grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3").children(
                    group.members.map((member) =>
                      h.div
                        .key(String(member.id))
                        .class(
                          "flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-sm",
                        )
                        .children(
                          h.span
                            .class("min-w-0 truncate")
                            .children(
                              ProfileLink(h, member.id, member.name),
                              h.span
                                .class("ml-2 text-[10px] text-muted-foreground")
                                .children(member.position),
                            ),
                          h.span
                            .class("shrink-0 font-mono text-[10px] text-muted-foreground")
                            .children(
                              `${member.hitsTaken > 0 ? `hit ${member.hitsTaken}× · ` : ""}${member.daysInFaction}d in faction`,
                            ),
                        ),
                    ),
                  ),
                ),
              ),
            ),
    ),
  );
};
