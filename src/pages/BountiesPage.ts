import { Command, Component, Subscription, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Effect, Queue, Schema, Stream } from "effect";
import { AsyncResult } from "effect/reactivity";
import { ChevronLeft, ChevronRight, Eye, LoaderCircle, RotateCw, Swords } from "lucide";
import { type Column, DataTable, SortState, sortRows } from "@/components/data-table";
import { CHECKBOX_CLASS } from "@/components/settings";
import { Icon } from "@/components/ui/icon";
import { Button, buttonClass, inputClass, Label } from "@/components/ui/primitives";
import { Opaque } from "@/domain/schema";
import { Settings } from "@/domain/Settings";
import {
  type BountyRow,
  groupBounties,
  isAvailable,
  withinFF,
  withinLevel,
  withinReward,
} from "@/lib/bounties";
import { BOUNTY_LIST_REFRESH_INTERVAL, getScheduler } from "@/lib/bounty-statuses";
import type { StatusClass } from "@/lib/faction";
import type { FFScouterData } from "@/lib/ffscouter";
import { playerAttackLink, playerProfileLink } from "@/lib/links";
import { dataOf, errorOf, updatedAt } from "@/lib/result";
import { cleanStatusDescription, getStatusBgColorClass } from "@/lib/status";
import type { StatusSnapshot } from "@/lib/status-scheduler";
import { cn } from "@/lib/utils";
import { GetBounties } from "@/queries/bounties";
import { GetFFScouterStats, playerIds, statsById } from "@/queries/ffscouter";
import { RefreshBounties } from "@/queries/refresh";

const MIN_REFRESH_SECONDS = 10;
const PAGE_SIZE = 20;
const STATUS_ORDER: Record<string, number> = { Okay: 1, Hospital: 2, Traveling: 3, Abroad: 4 };

const formatMoney = (amount: number) => `$${amount.toLocaleString()}`;

const parseOptionalNumber = (value: string) => {
  const number = Number.parseFloat(value);
  return value === "" || !Number.isFinite(number) ? null : number;
};

export const BountiesPageMessage = UiSchema.TaggedEnum({
  Ticked: { now: Schema.Number },
  ChangedStatuses: { snapshot: Opaque<StatusSnapshot>() },
  ChangedBountyList: {},
  ClickedSort: { sort: SortState },
  ClickedPreviousPage: {},
  ClickedNextPage: {},
  ClickedRefresh: {},
  UpdatedMinReward: { value: Schema.String },
  CommittedMinReward: {},
  UpdatedMaxLevel: { value: Schema.String },
  UpdatedMaxFF: { value: Schema.String },
  UpdatedRefreshSeconds: { value: Schema.String },
  CommittedRefreshSeconds: {},
  ToggledOnlyAvailable: { checked: Schema.Boolean },
});
type BountiesPageMessage = typeof BountiesPageMessage.Type;
type H = Html.H<BountiesPageMessage>;

export const BountiesPageEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const SteerStatusChecks = Command.make(
  "SteerStatusChecks",
  {
    args: {
      key: Schema.String,
      refreshInterval: Schema.Number,
      priority: Schema.Array(Schema.Number),
      order: Schema.Array(Schema.Number),
    },
  },
  ({ key, refreshInterval, priority, order }) =>
    Effect.sync(() =>
      getScheduler(key, refreshInterval).setTargets([...priority], [...order]),
    ).pipe(Effect.as(Component.noop)),
);

const RecheckStatuses = Command.make(
  "RecheckStatuses",
  { args: { key: Schema.String, refreshInterval: Schema.Number } },
  ({ key, refreshInterval }) =>
    Effect.sync(() => getScheduler(key, refreshInterval).refreshAll()).pipe(
      Effect.as(Component.noop),
    ),
);

/** Runs the status checks while the page is open, reporting what they learn. */
const watchStatuses = (key: string, refreshInterval: number) =>
  Stream.callback<StatusSnapshot>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const scheduler = getScheduler(key, refreshInterval);
        scheduler.setRefreshInterval(refreshInterval);
        const unsubscribe = scheduler.subscribe(() =>
          Queue.offerUnsafe(queue, scheduler.snapshot()),
        );
        scheduler.start();
        Queue.offerUnsafe(queue, scheduler.snapshot());
        return () => {
          unsubscribe();
          scheduler.stop();
        };
      }),
      (release) => Effect.sync(release),
    ),
  );

const BountiesPageModel = Schema.Struct({
  now: Schema.Number,
  snapshot: Opaque<StatusSnapshot>(),
  sort: SortState,
  page: Schema.Number,
  minRewardInput: Schema.String,
  refreshInput: Schema.String,
});
type BountiesPageModel = typeof BountiesPageModel.Type;

const BountiesPageDef = Html.component({
  name: "BountiesPage",
  props: Schema.Struct({ settings: Settings }),
  model: BountiesPageModel,
  message: BountiesPageMessage,
  events: BountiesPageEvents,
  restore: (model): BountiesPageModel => ({
    ...model,
    snapshot: { statuses: {}, failed: [], checking: [] },
  }),
  queries: {
    bounties: {
      query: GetBounties,
      args: ({ props }) => ({
        key: props.settings.publicKey ?? "",
        minReward: props.settings.bountyMinReward,
      }),
      onChange: () => BountiesPageMessage.ChangedBountyList(),
    },
    stats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) => {
        const ids = playerIds(
          targetsOf(props.settings, dataOf(queries.bounties)).map((target) => target.id),
        );
        return props.settings.ffscouterKey && ids.length
          ? { key: props.settings.ffscouterKey, ids }
          : undefined;
      },
      onChange: () => BountiesPageMessage.ChangedBountyList(),
    },
  },
});

const targetsOf = (settings: Settings, bounties: Parameters<typeof groupBounties>[0] | undefined) =>
  groupBounties(bounties ?? []).filter(
    (target) =>
      withinReward(target, settings.bountyMinReward ?? undefined) &&
      withinLevel(target, settings.bountyMaxLevel ?? undefined),
  );

/** A hospital or jail stay that has ended no longer says anything. */
const liveStatus = (status: StatusClass | undefined, nowSeconds: number) =>
  status && status.until > 0 && status.until <= nowSeconds ? undefined : status;

const FairFightValue = (h: H, ff: number | undefined) => {
  if (!ff) return h.div.children("N/A");
  const color =
    ff < 2
      ? "text-blue-600"
      : ff < 4
        ? "text-green-600"
        : ff < 6
          ? "text-yellow-600"
          : "text-red-600";
  return h.div.class(color).children(ff.toFixed(2));
};

const formatRemaining = (seconds: number) => {
  if (seconds <= 0) return "Out now";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${secs}s`
    : minutes > 0
      ? `${minutes}m ${secs}s`
      : `${secs}s`;
};

const PlayerStatusBadge = (h: H, status: StatusClass, now: number) => {
  const description = cleanStatusDescription(status.description) || status.state;
  return h.div
    .class(
      cn(
        getStatusBgColorClass(status.state),
        "text-white font-semibold px-3 py-2 rounded-md text-center shadow-sm",
      ),
    )
    .children(
      h.span.children(
        status.state === "Hospital" && status.until > 0
          ? `${description} (${formatRemaining(Math.max(0, status.until - now))})`
          : description,
      ),
    );
};

const IconLink = (h: H, href: string, label: string, icon: typeof Eye) =>
  h.a
    .attrs({
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": label,
      title: label,
    })
    .class(buttonClass({ variant: "outline" }))
    .children(Icon(h, icon));

const byOptional = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? 0 : a === undefined ? 1 : b === undefined ? -1 : a - b;

const columnsOf = (now: number): Column<BountyRow, BountiesPageMessage>[] => [
  {
    id: "reward",
    header: "Reward",
    compare: (a, b) => a.reward - b.reward,
    cell: (h, row) =>
      h.div
        .class("tabular-nums")
        .attr(
          "title",
          [
            `${row.count} ${row.count === 1 ? "bounty" : "bounties"} worth ${formatMoney(row.totalReward)} in total`,
            ...row.reasons,
          ].join("\n"),
        )
        .children(
          formatMoney(row.reward),
          row.count > 1 &&
            h.span.class("ml-1 text-xs text-muted-foreground").children(`×${row.count}`),
        ),
  },
  {
    id: "name",
    header: "Name",
    compare: (a, b) => a.name.localeCompare(b.name),
    cell: (h, row) =>
      h.a
        .attrs({ href: playerProfileLink(row.id), target: "_blank", rel: "noopener noreferrer" })
        .children(row.name),
  },
  {
    id: "level",
    header: "Level",
    compare: (a, b) => a.level - b.level,
    cell: (h, row) => h.span(String(row.level)),
  },
  {
    id: "ff",
    header: "FF",
    compare: (a, b) => byOptional(a.ffs?.fair_fight, b.ffs?.fair_fight),
    cell: (h, row) => FairFightValue(h, row.ffs?.fair_fight),
  },
  {
    id: "battle_stats",
    header: "Battle Stats",
    compare: (a, b) => byOptional(a.ffs?.bs_estimate, b.ffs?.bs_estimate),
    cell: (h, row) => h.div.children(row.ffs?.bs_estimate_human ?? "N/A"),
  },
  {
    id: "status",
    header: "Status",
    compare: (a, b) => {
      // Players without a looked-up status sort last.
      const orderA = a.status ? (STATUS_ORDER[a.status.state] ?? 99) : 100;
      const orderB = b.status ? (STATUS_ORDER[b.status.state] ?? 99) : 100;
      if (orderA !== orderB) return orderA - orderB;
      if (a.status?.state === "Hospital" && b.status?.state === "Hospital")
        return a.status.until - b.status.until;
      return 0;
    },
    cell: (h, row) =>
      row.status
        ? PlayerStatusBadge(h, row.status, now)
        : h.div.class("text-center text-muted-foreground").children("—"),
  },
  {
    id: "actions",
    header: "Actions",
    cell: (h, row) =>
      h.div
        .class("flex gap-2")
        .children(
          IconLink(h, playerProfileLink(row.id), "View profile", Eye),
          IconLink(h, playerAttackLink(row.id), "Attack", Swords),
        ),
  },
];

type Queries = {
  readonly bounties: AsyncResult.AsyncResult<Parameters<typeof groupBounties>[0], string>;
  readonly stats: AsyncResult.AsyncResult<ReadonlyArray<FFScouterData>, string>;
};

/** The targets after each filter, the rows on screen, and the page they are on. */
const viewOf = (settings: Settings, model: BountiesPageModel, queries: Queries) => {
  const targets = targetsOf(settings, dataOf(queries.bounties));
  const ffsById = statsById(dataOf(queries.stats));
  const maxFF = settings.ffscouterKey ? (settings.bountyMaxFF ?? undefined) : undefined;
  const candidates = targets.filter((target) => withinFF(ffsById.get(target.id), maxFF));
  const candidateIds = candidates.map((target) => target.id);
  const statusOf = (id: number) => liveStatus(model.snapshot.statuses[id], model.now);
  // Players whose status is not known yet are hidden until the crawler reaches them.
  const rows: BountyRow[] = candidates
    .map((target) => ({ ...target, ffs: ffsById.get(target.id), status: statusOf(target.id) }))
    .filter((row) => !settings.bountyOnlyAvailable || isAvailable(row.status));
  const columns = columnsOf(model.now);
  const sorted = sortRows(rows, columns, model.sort);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(model.page, pageCount - 1);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return { targets, candidates, candidateIds, rows, columns, pageRows, page, pageCount, statusOf };
};

// The page on screen is checked first; everyone else is crawled by reward in the background.
const steer = (settings: Settings, model: BountiesPageModel, queries: Queries) => {
  const { pageRows, candidateIds } = viewOf(settings, model, queries);
  return SteerStatusChecks.make({
    key: settings.publicKey ?? "",
    refreshInterval: settings.bountyRefreshInterval,
    priority: pageRows.map((row) => row.id),
    order: candidateIds,
  });
};

const change = (settings: Settings) => BountiesPageEvents.RequestedSettingsChange({ settings });

const Field = (h: H, id: string, label: string) => Label(h, { for: id }).children(label);

export const BountiesPage = BountiesPageDef.make({
  init: ($) => ({
    now: Math.floor(Date.now() / 1000),
    snapshot: { statuses: {}, failed: [], checking: [] },
    sort: { id: "reward", desc: true },
    page: 0,
    minRewardInput: String($.props.settings.bountyMinReward ?? ""),
    refreshInput: String($.props.settings.bountyRefreshInterval / 1000),
  }),
  update: {
    Ticked: ($, { now }) => $.evolve({ now }),
    ChangedStatuses: ($, { snapshot }) => $.evolve({ snapshot }),
    ChangedBountyList: ($) => $.run(steer($.props.settings, $.model, $.queries)),
    ClickedSort: ($, { sort }) => {
      const next = { ...$.model, sort, page: 0 };
      return $.set(next).run(steer($.props.settings, next, $.queries));
    },
    ClickedPreviousPage: ($) => {
      const next = { ...$.model, page: Math.max(0, $.model.page - 1) };
      return $.set(next).run(steer($.props.settings, next, $.queries));
    },
    ClickedNextPage: ($) => {
      const { pageCount } = viewOf($.props.settings, $.model, $.queries);
      const next = { ...$.model, page: Math.min(pageCount - 1, $.model.page + 1) };
      return $.set(next).run(steer($.props.settings, next, $.queries));
    },
    ClickedRefresh: ($) =>
      $.run(
        RecheckStatuses.make({
          key: $.props.settings.publicKey ?? "",
          refreshInterval: $.props.settings.bountyRefreshInterval,
        }),
      ).run(RefreshBounties.make()),
    UpdatedMinReward: ($, { value }) => $.evolve({ minRewardInput: value }),
    // Committed on blur or Enter, so a half-typed amount doesn't refetch every bounty page.
    CommittedMinReward: ($) => {
      const value = parseOptionalNumber($.model.minRewardInput);
      return $.evolve({ minRewardInput: String(value ?? "") }).emit(
        change({ ...$.props.settings, bountyMinReward: value }),
      );
    },
    UpdatedMaxLevel: ($, { value }) =>
      $.emit(change({ ...$.props.settings, bountyMaxLevel: parseOptionalNumber(value) })),
    UpdatedMaxFF: ($, { value }) =>
      $.emit(change({ ...$.props.settings, bountyMaxFF: parseOptionalNumber(value) })),
    UpdatedRefreshSeconds: ($, { value }) => $.evolve({ refreshInput: value }),
    CommittedRefreshSeconds: ($) => {
      const seconds = Math.max(MIN_REFRESH_SECONDS, Number.parseFloat($.model.refreshInput) || 0);
      return $.evolve({ refreshInput: String(seconds) }).emit(
        change({ ...$.props.settings, bountyRefreshInterval: seconds * 1000 }),
      );
    },
    ToggledOnlyAvailable: ($, { checked }) =>
      $.emit(change({ ...$.props.settings, bountyOnlyAvailable: checked })),
  },
  subscriptions: ({ props }) => [
    Subscription.make(
      "clock",
      Stream.tick("1 second").pipe(
        Stream.map(() => BountiesPageMessage.Ticked({ now: Math.floor(Date.now() / 1000) })),
      ),
    ),
    Boolean(props.settings.publicKey) &&
      Subscription.make(
        "bountyStatuses",
        [props.settings.publicKey ?? "", props.settings.bountyRefreshInterval],
        ([key, refreshInterval]) =>
          watchStatuses(String(key), Number(refreshInterval)).pipe(
            Stream.map((snapshot) => BountiesPageMessage.ChangedStatuses({ snapshot })),
          ),
      ),
  ],
  view: (h, model) => {
    const { settings } = h.props;
    const hasFFScouterKey = Boolean(settings.ffscouterKey);
    const view = viewOf(settings, model, h.queries);
    const { snapshot } = model;
    const pageIds = view.pageRows.map((row) => row.id);
    const checkedCount = view.candidateIds.filter((id) => view.statusOf(id)).length;
    const failed = pageIds.filter((id) => snapshot.failed.includes(id)).length;
    const isCheckingPage = pageIds.some((id) => snapshot.checking.includes(id));
    const isFetchingFF = h.queries.stats.waiting;
    const listUpdatedAt = updatedAt(h.queries.bounties);
    const untilList = listUpdatedAt
      ? Math.max(0, BOUNTY_LIST_REFRESH_INTERVAL - (model.now * 1000 - listUpdatedAt))
      : null;
    const id = h.id("bounty");
    const error = errorOf(h.queries.bounties);

    const filters = h.div.class("flex flex-wrap items-end gap-4").children(
      h.div.class("flex flex-col gap-2").children(
        Field(h, `${id}-reward`, "Min reward"),
        h.input
          .attrs({
            id: `${id}-reward`,
            type: "number",
            min: "0",
            step: "10000",
            placeholder: "Any",
          })
          .class(inputClass("w-32"))
          .value(model.minRewardInput)
          .on("input", ({ value }) => BountiesPageMessage.UpdatedMinReward({ value }))
          .on("blur", BountiesPageMessage.CommittedMinReward())
          .on("keydown", ({ key }) =>
            key === "Enter" ? BountiesPageMessage.CommittedMinReward() : undefined,
          ),
      ),
      h.div.class("flex flex-col gap-2").children(
        Field(h, `${id}-level`, "Max level"),
        h.input
          .attrs({ id: `${id}-level`, type: "number", min: "1", max: "100", placeholder: "Any" })
          .class(inputClass("w-28"))
          .value(String(settings.bountyMaxLevel ?? ""))
          .on("input", ({ value }) => BountiesPageMessage.UpdatedMaxLevel({ value })),
      ),
      h.div.class("flex flex-col gap-2").children(
        Field(h, `${id}-ff`, "Max FF"),
        h.input
          .attrs({
            id: `${id}-ff`,
            type: "number",
            min: "1",
            step: "0.1",
            placeholder: hasFFScouterKey ? "Any" : "No FFScouter key",
          })
          .class(inputClass("w-28"))
          .disabled(!hasFFScouterKey)
          .value(hasFFScouterKey ? String(settings.bountyMaxFF ?? "") : "")
          .on("input", ({ value }) => BountiesPageMessage.UpdatedMaxFF({ value })),
      ),
      h.div.class("flex flex-col gap-2").children(
        Field(h, `${id}-refresh`, "Refresh (seconds)"),
        h.input
          .attrs({ id: `${id}-refresh`, type: "number", min: String(MIN_REFRESH_SECONDS) })
          .class(inputClass("w-28"))
          .value(model.refreshInput)
          .on("input", ({ value }) => BountiesPageMessage.UpdatedRefreshSeconds({ value }))
          .on("blur", BountiesPageMessage.CommittedRefreshSeconds())
          .on("keydown", ({ key }) =>
            key === "Enter" ? BountiesPageMessage.CommittedRefreshSeconds() : undefined,
          ),
      ),
      h.div.class("flex h-9 items-center gap-2").children(
        h.input
          .attrs({ id: `${id}-available`, type: "checkbox" })
          .class(cn(CHECKBOX_CLASS, "accent-primary"))
          .checked(settings.bountyOnlyAvailable)
          .on("change", ({ checked }) => BountiesPageMessage.ToggledOnlyAvailable({ checked })),
        Field(h, `${id}-available`, "Only available"),
      ),
    );

    return h.div.class("container mx-auto flex flex-col gap-2 p-2").children(
      h.div.class("flex flex-wrap items-end justify-between gap-2").children(
        h.div.class("flex items-center gap-2").children(
          Button(h, { variant: "outline", size: "icon-sm" })
            .attr("aria-label", "Refresh bounties")
            .on("click", BountiesPageMessage.ClickedRefresh())
            .children(Icon(h, RotateCw, { class: "size-4" })),
          h.div.children(
            h.h2
              .class("flex items-center gap-2 text-sm font-bold")
              .children(
                `Bounties (${view.rows.length} of ${view.targets.length} targets)`,
                (isFetchingFF || isCheckingPage) &&
                  Icon(h, LoaderCircle, { class: "size-3.5 animate-spin text-muted-foreground" }),
              ),
            h.p
              .class("text-xs text-muted-foreground")
              .children(
                `Status known for ${checkedCount} of ${view.candidates.length} · players around are rechecked every ${
                  settings.bountyRefreshInterval / 1000
                }s`,
              ),
            untilList !== null &&
              h.p
                .class("text-xs text-muted-foreground")
                .children(
                  `Bounty list refreshes in ${Math.floor(untilList / 60_000) > 0 ? `${Math.floor(untilList / 60_000)}m ` : ""}${Math.floor((untilList % 60_000) / 1000)}s`,
                ),
          ),
        ),
        filters,
      ),
      failed > 0 &&
        h.p
          .class("text-xs text-destructive")
          .children(
            `Could not load the status of ${failed} target${failed === 1 ? "" : "s"} on this page.`,
          ),
      AsyncResult.isInitial(h.queries.bounties)
        ? h.div
            .class("flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground")
            .children(Icon(h, LoaderCircle, { class: "size-4 animate-spin" }), "Loading bounties…")
        : error && !dataOf(h.queries.bounties)
          ? h.p
              .class("p-8 text-center text-sm text-destructive")
              .children(`Failed to load bounties: ${error}`)
          : h.div.class("overflow-hidden rounded-md border").children(
              DataTable(h, {
                columns: view.columns,
                rows: view.pageRows,
                rowId: (row) => String(row.id),
                sort: model.sort,
                onSort: (sort) => BountiesPageMessage.ClickedSort({ sort }),
                class: "rounded-none border-0",
              }),
              h.div
                .class(
                  "flex items-center justify-end gap-2 border-t px-3 py-2 text-xs text-muted-foreground",
                )
                .children(
                  h.span
                    .class("tabular-nums")
                    .children(`Page ${view.page + 1} of ${view.pageCount}`),
                  Button(h, { variant: "outline", size: "icon-sm" })
                    .attr("aria-label", "Previous page")
                    .disabled(view.page === 0)
                    .on("click", BountiesPageMessage.ClickedPreviousPage())
                    .children(Icon(h, ChevronLeft)),
                  Button(h, { variant: "outline", size: "icon-sm" })
                    .attr("aria-label", "Next page")
                    .disabled(view.page >= view.pageCount - 1)
                    .on("click", BountiesPageMessage.ClickedNextPage())
                    .children(Icon(h, ChevronRight)),
                ),
            ),
    );
  },
});
