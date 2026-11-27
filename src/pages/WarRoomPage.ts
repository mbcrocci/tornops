import { Subscription, UiSchema } from "@effect/ui";
import { Tabs } from "@effect/ui-kit";
import { Html, HtmlSubscription } from "@effect/ui/html";
import { Schema, Stream } from "effect";
import { PanelTopClose, PanelTopOpen, RotateCw } from "lucide";
import { SortState, DataTable } from "@/components/data-table";
import { EnemyFactionSetup } from "@/components/enemy-faction-setup";
import { Icon } from "@/components/ui/icon";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/primitives";
import {
  EnemyChainPanel,
  NextOutPanel,
  OurChainPanel,
  WarBar,
  YouPanel,
  type ChainResponse,
} from "@/components/war-room/panels";
import {
  DEFAULT_SORT,
  enemyRowClass,
  type FactionMember,
  filterMembers,
  GroupToggle,
  hasFilters,
  membersOf,
  MoreFiltersToggle,
  type RosterContext,
  rosterColumns,
  rosterGrouping,
  type RosterSide,
  SecondaryFilters,
  StateChips,
} from "@/components/war-room/roster";
import { FilterState, NO_FILTERS, Settings } from "@/domain/Settings";
import { dataOf, errorOf, isFetching, updatedAt } from "@/lib/result";
import { cn } from "@/lib/utils";
import { GetFFScouterStats, playerIds, statsById } from "@/queries/ffscouter";
import { RefreshFactions } from "@/queries/refresh";
import {
  GetEnemyChain,
  GetEnemyFaction,
  GetOurChain,
  GetOurFaction,
  GetUser,
} from "@/queries/torn";

const Side = Schema.Literals(["enemy", "ours"]);

export const WarRoomPageMessage = UiSchema.TaggedEnum({
  Ticked: { now: Schema.Number },
  ChangedMobile: { matches: Schema.Boolean },
  ChangedWide: { matches: Schema.Boolean },
  SelectedSideTab: { side: Schema.String },
  ClickedSort: { sort: SortState },
  ClickedPin: { id: Schema.Number },
  ClickedMoreFilters: {},
  ClickedFilters: { filters: FilterState },
  ClickedGroupByStatus: {},
  ClickedCollapseCards: {},
  ClickedRefresh: {},
  ChangedEnemySetup: { settings: Settings },
});
type WarRoomPageMessage = typeof WarRoomPageMessage.Type;

export const WarRoomPageEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const WarRoomPageModel = Schema.Struct({
  now: Schema.Number,
  mobile: Schema.Boolean,
  wide: Schema.Boolean,
  side: Side,
  sort: Schema.Struct({ enemy: SortState, ours: SortState }),
  pinned: Schema.Struct({ enemy: Schema.Array(Schema.Number), ours: Schema.Array(Schema.Number) }),
  showMoreFilters: Schema.Boolean,
});
type WarRoomPageModel = typeof WarRoomPageModel.Type;

const nowSeconds = () => Math.floor(Date.now() / 1000);

const keyOf = (settings: Settings) => settings.publicKey ?? "";

const WarRoomPageDef = Html.component({
  name: "WarRoomPage",
  props: Schema.Struct({ settings: Settings }),
  model: WarRoomPageModel,
  message: WarRoomPageMessage,
  events: WarRoomPageEvents,
  queries: {
    user: {
      query: GetUser,
      args: ({ props }) => ({
        key: keyOf(props.settings),
      }),
    },
    ourFaction: {
      query: GetOurFaction,
      args: ({ props }) => ({
        key: keyOf(props.settings),
      }),
    },
    enemyFaction: {
      query: GetEnemyFaction,
      args: ({ props }) =>
        props.settings.enemyFactionId
          ? {
              key: keyOf(props.settings),
              factionId: props.settings.enemyFactionId,
            }
          : undefined,
    },
    ourChain: {
      query: GetOurChain,
      args: ({ props }) => ({
        key: keyOf(props.settings),
      }),
    },
    enemyChain: {
      query: GetEnemyChain,
      args: ({ props }) =>
        props.settings.enemyFactionId
          ? {
              key: keyOf(props.settings),
              factionId: props.settings.enemyFactionId,
            }
          : undefined,
    },
    ourStats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) => {
        const ids = playerIds(
          Object.keys(dataOf(queries.ourFaction)?.faction.members ?? {}).map(Number),
        );
        return props.settings.ffscouterKey && ids.length
          ? { key: props.settings.ffscouterKey, ids }
          : undefined;
      },
    },
    enemyStats: {
      query: GetFFScouterStats,
      args: ({ props, queries }) => {
        const ids = playerIds(
          Object.keys(dataOf(queries.enemyFaction)?.faction.members ?? {}).map(Number),
        );
        return props.settings.ffscouterKey && ids.length
          ? { key: props.settings.ffscouterKey, ids }
          : undefined;
      },
    },
  },
});

const change = (settings: Settings) => WarRoomPageEvents.RequestedSettingsChange({ settings });

const layoutOf = (model: WarRoomPageModel) =>
  model.mobile ? "mobile" : model.wide ? "wide" : "tablet";

const SideLabel = (
  h: Html.H<WarRoomPageMessage>,
  title: string,
  name: string | undefined,
  count: number,
) =>
  h.span
    .class("contents")
    .children(
      h.span.children(title),
      name &&
        h.span
          .class("hidden max-w-40 truncate font-normal text-muted-foreground sm:inline")
          .children(name),
      count > 0 &&
        h.span
          .class("text-xs font-normal text-muted-foreground tabular-nums")
          .children(String(count)),
    );

const Roster = (
  h: Html.H<WarRoomPageMessage>,
  model: WarRoomPageModel,
  settings: Settings,
  members: FactionMember[],
  context: RosterContext<WarRoomPageMessage>,
) => {
  const { side } = context;
  const filters = settings.filters;
  const visible = filterMembers(members, filters);
  const secondaryActive = filters.ff.length + filters.onlineStatus.length;
  const controls = {
    filters,
    onFilters: (filters: FilterState) => WarRoomPageMessage.ClickedFilters({ filters }),
  };
  const groupToggle = GroupToggle(
    h,
    settings.groupByStatus,
    WarRoomPageMessage.ClickedGroupByStatus(),
  );
  // An active FF or activity filter is never hidden behind "More filters".
  const showMore = model.showMoreFilters || secondaryActive > 0;

  return h.div.class("@container flex flex-col gap-3 px-2 sm:px-3").children(
    // FF and activity sit next to the status chips when the row has room for them all, and
    // fold behind "More filters" when it does not.
    h.div
      .class(
        "-mx-2 flex items-center gap-x-5 gap-y-2 overflow-x-auto contain-inline-size px-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none] @6xl:[mask-image:none]",
      )
      .children(
        StateChips(h, members, controls),
        h.div.class("hidden @6xl:contents").children(SecondaryFilters(h, members, controls)),
        h.div
          .class("@6xl:hidden")
          .children(
            MoreFiltersToggle(
              h,
              showMore,
              secondaryActive,
              WarRoomPageMessage.ClickedMoreFilters(),
            ),
          ),
        h.div.class("ml-auto").children(groupToggle),
      ),
    showMore &&
      h.div
        .class("-mx-2 overflow-x-auto px-2 [scrollbar-width:none] sm:mx-0 sm:px-0 @6xl:hidden")
        .children(SecondaryFilters(h, members, controls)),
    DataTable(h, {
      columns: rosterColumns(layoutOf(model), context),
      rows: visible,
      rowId: (member) => String(member.id),
      sort: model.sort[side],
      onSort: (sort) => WarRoomPageMessage.ClickedSort({ sort }),
      isPinned: (member) => context.pinned.has(member.id),
      rowClass: side === "enemy" ? (member) => enemyRowClass(member, model.now) : undefined,
      grouping: settings.groupByStatus ? rosterGrouping(side, model.now) : undefined,
      class:
        "-mx-2 rounded-none border-0 border-t sm:-mx-3 max-md:[&_thead]:hidden md:[&_td]:text-sm md:[&_table]:table-fixed md:[&_td]:px-3.5 md:[&_th]:px-3.5 [&_thead_tr]:bg-muted/40 [&_thead_tr]:hover:bg-muted/40",
    }),
    hasFilters(filters) &&
      h.div.class("flex items-center justify-between text-xs text-muted-foreground").children(
        h.span.class("tabular-nums").children(`Showing ${visible.length} of ${members.length}`),
        Button(h, { variant: "ghost", size: "sm", class: "h-7 text-xs" })
          .on("click", WarRoomPageMessage.ClickedFilters({ filters: NO_FILTERS }))
          .children("Clear filters"),
      ),
  );
};

export const WarRoomPage = WarRoomPageDef.make({
  init: () => ({
    now: nowSeconds(),
    mobile: typeof matchMedia !== "undefined" && matchMedia("(max-width: 767px)").matches,
    wide: typeof matchMedia === "undefined" || matchMedia("(min-width: 1024px)").matches,
    side: "enemy",
    sort: { enemy: DEFAULT_SORT, ours: DEFAULT_SORT },
    pinned: { enemy: [], ours: [] },
    showMoreFilters: false,
  }),
  update: {
    Ticked: ($, { now }) => $.evolve({ now }),
    ChangedMobile: ($, { matches }) => $.evolve({ mobile: matches }),
    ChangedWide: ($, { matches }) => $.evolve({ wide: matches }),
    SelectedSideTab: ($, { side }) =>
      side === "enemy" || side === "ours" ? $.evolve({ side }) : $.model,
    ClickedSort: ($, { sort }) =>
      $.evolve({ sort: (sorts) => ({ ...sorts, [$.model.side]: sort }) }),
    ClickedPin: ($, { id }) =>
      $.evolve({
        pinned: (pinned) => {
          const list = pinned[$.model.side];
          return {
            ...pinned,
            [$.model.side]: list.includes(id) ? list.filter((pin) => pin !== id) : [...list, id],
          };
        },
      }),
    ClickedMoreFilters: ($) => $.evolve({ showMoreFilters: (shown) => !shown }),
    ClickedFilters: ($, { filters }) => $.emit(change({ ...$.props.settings, filters })),
    ClickedGroupByStatus: ($) =>
      $.emit(change({ ...$.props.settings, groupByStatus: !$.props.settings.groupByStatus })),
    ClickedCollapseCards: ($) =>
      $.emit(change({ ...$.props.settings, collapsedCards: !$.props.settings.collapsedCards })),
    ClickedRefresh: ($) => $.run(RefreshFactions.make()),
    ChangedEnemySetup: ($, { settings }) => $.emit(change(settings)),
  },
  subscriptions: () => [
    Subscription.make(
      "clock",
      Stream.tick("1 second").pipe(
        Stream.map(() => WarRoomPageMessage.Ticked({ now: nowSeconds() })),
      ),
    ),
    HtmlSubscription.onMediaQuery("(max-width: 767px)", (matches) =>
      WarRoomPageMessage.ChangedMobile({ matches }),
    ),
    HtmlSubscription.onMediaQuery("(min-width: 1024px)", (matches) =>
      WarRoomPageMessage.ChangedWide({ matches }),
    ),
  ],
  view: (h, model) => {
    const { settings } = h.props;
    const { now } = model;
    const collapsed = settings.collapsedCards;
    const ours = dataOf(h.queries.ourFaction);
    const enemy = dataOf(h.queries.enemyFaction);
    const user = dataOf(h.queries.user);
    const ourMembers = membersOf(ours?.faction.members, statsById(dataOf(h.queries.ourStats)));
    const enemyMembers = membersOf(enemy?.faction.members, statsById(dataOf(h.queries.enemyStats)));
    const side: RosterSide = model.side;
    const sideQuery = side === "enemy" ? h.queries.enemyFaction : h.queries.ourFaction;
    const context = (side: RosterSide): RosterContext<WarRoomPageMessage> => ({
      side,
      now,
      travel: (side === "enemy" ? enemy : ours)?.travel ?? {},
      emojis: settings.communicationEmojis,
      pinned: new Set(model.pinned[side]),
      onTogglePin: (id) => WarRoomPageMessage.ClickedPin({ id }),
    });

    const enemyRoster = enemyMembers.length
      ? Roster(h, model, settings, enemyMembers, context("enemy"))
      : EnemyFactionSetup(h, {
          props: { settings },
          onEmit: {
            RequestedSettingsChange: ({ settings }) =>
              WarRoomPageMessage.ChangedEnemySetup({ settings }),
          },
        });
    const ourRoster = ourMembers.length
      ? Roster(h, model, settings, ourMembers, context("ours"))
      : Empty(h).children(
          EmptyHeader(h).children(
            EmptyTitle(h).children("No faction data"),
            EmptyDescription(h).children(
              "Your faction could not be loaded. Check your API key in settings.",
            ),
          ),
        );

    const sinceRefresh = updatedAt(sideQuery);
    const untilRefresh = sinceRefresh
      ? Math.max(0, settings.refetchInterval - (now * 1000 - sinceRefresh))
      : null;

    return h.main
      .class("mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4")
      .children(
        h.h1.class("sr-only").children("War room"),
        WarBar(h, ours?.faction, now),
        // On wide screens your status and both chains sit beside the roster and stay in view.
        h.div
          .class(
            cn(
              "grid grid-cols-[minmax(0,1fr)] items-start gap-3",
              // The roster is as wide as its columns; the sidebar takes whatever is left.
              !collapsed &&
                "xl:grid-cols-[minmax(0,1fr)_22rem] min-[87.5rem]:grid-cols-[minmax(0,1fr)_28rem]",
            ),
          )
          .children(
            !collapsed &&
              h.aside
                .attr("aria-label", "Your status and chains")
                .class(
                  "grid grid-cols-2 gap-3 md:grid-cols-3 xl:sticky xl:top-3 xl:order-last xl:grid-cols-1",
                )
                .children(
                  YouPanel(h, user, errorOf(h.queries.user), now),
                  OurChainPanel(
                    h,
                    dataOf(h.queries.ourChain) as ChainResponse | undefined,
                    updatedAt(h.queries.ourChain),
                    now,
                  ),
                  EnemyChainPanel(
                    h,
                    dataOf(h.queries.enemyChain) as ChainResponse | undefined,
                    updatedAt(h.queries.enemyChain),
                    now,
                  ),
                  // A strip under the cards on tablets, a list in the sidebar on desktops.
                  NextOutPanel(h, enemyMembers, now, "hidden md:col-span-3 md:flex xl:col-span-1"),
                ),
            h.section
              .class("overflow-hidden rounded-xl border bg-card")
              .attr("aria-label", "Faction rosters")
              .children(
                Tabs(h, {
                  props: { value: side, tabs: [{ value: "enemy" }, { value: "ours" }] },
                  onEmit: {
                    Selected: ({ value }) => WarRoomPageMessage.SelectedSideTab({ side: value }),
                  },
                  view: (tabs) =>
                    tabs.root(h.div.class("flex flex-col")).children(
                      h.div.class("flex items-center justify-between gap-2 p-2 sm:p-3").children(
                        tabs
                          .list(
                            h.div.class(
                              "bg-muted text-muted-foreground inline-flex h-8 w-fit items-center justify-center rounded-lg p-[3px]",
                            ),
                          )
                          .children(
                            (["enemy", "ours"] as const).map((value) =>
                              tabs
                                .tab({ element: h.button.key(value).class(TAB_CLASS), value })
                                .children(
                                  value === "enemy"
                                    ? SideLabel(
                                        h,
                                        "Enemy",
                                        enemy?.faction.name,
                                        enemyMembers.length,
                                      )
                                    : SideLabel(h, "Ours", ours?.faction.name, ourMembers.length),
                                ),
                            ),
                          ),
                        h.div.class("flex items-center gap-1").children(
                          h.div.class("flex items-center gap-1 text-muted-foreground").children(
                            untilRefresh !== null &&
                              h.p
                                .class("text-xs text-muted-foreground")
                                .children(`Next refresh in ${formatRemaining(untilRefresh)}`),
                            Button(h, { variant: "ghost", size: "icon-sm", class: "size-7" })
                              .attr(
                                "aria-label",
                                side === "enemy" ? "Refresh enemy faction" : "Refresh your faction",
                              )
                              .on("click", WarRoomPageMessage.ClickedRefresh())
                              .children(
                                Icon(h, RotateCw, {
                                  class: cn("size-3.5", isFetching(sideQuery) && "animate-spin"),
                                }),
                              ),
                          ),
                          // Hides your status and chain cards to give the roster the whole page.
                          Button(h, {
                            variant: "ghost",
                            size: "sm",
                            class: "h-7 gap-1.5 px-2 text-xs text-muted-foreground",
                          })
                            .attr("aria-expanded", collapsed ? "false" : "true")
                            .on("click", WarRoomPageMessage.ClickedCollapseCards())
                            .children(
                              Icon(h, collapsed ? PanelTopOpen : PanelTopClose, {
                                class: "size-3.5",
                              }),
                              h.span
                                .class("hidden sm:inline")
                                .children(collapsed ? "Show status" : "Hide status"),
                              h.span
                                .class("sr-only sm:hidden")
                                .children(
                                  collapsed ? "Show status and chains" : "Hide status and chains",
                                ),
                            ),
                        ),
                      ),
                      tabs
                        .panel({ element: h.div.class("flex-1 outline-none"), value: "enemy" })
                        ?.children(enemyRoster),
                      tabs
                        .panel({ element: h.div.class("flex-1 outline-none"), value: "ours" })
                        ?.children(ourRoster),
                    ),
                }),
              ),
          ),
      );
  },
});

const TAB_CLASS =
  "data-active:bg-background dark:data-active:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-active:border-input dark:data-active:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-active:shadow-sm";

function formatRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds % 60}s`;
}
