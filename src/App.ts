import { Command, Component, Head, Router, Subscription, UiSchema } from "@effect/ui";
import { Html, HtmlHead, HtmlSubscription } from "@effect/ui/html";
import { Effect, Layer, Schema, Stream } from "effect";
import { AsyncResult } from "effect/reactivity";
import { Credentials } from "@/components/credentials";
import { Header } from "@/components/header";
import { isLoggedIn, saveSettings, Settings, ThemeMode, ThemePreset } from "@/domain/Settings";
import { validateFFScouterKey, validateTornKey } from "@/lib/credentials";
import { GetFactionActivity, GetFFScouterStats, GetMemberActivity } from "@/queries/ffscouter";
import {
  GetArmoryXanax,
  GetAttackHistory,
  GetChainAttacks,
  GetChainReport,
  GetEnemyChain,
  GetEnemyFaction,
  GetOurChain,
  GetOurFaction,
  GetRankedWars,
  GetUser,
} from "@/queries/torn";
import { GetRecordedActivity } from "@/queries/activity";
import { GetBounties } from "@/queries/bounties";
import { RefreshBounties, RefreshFactions, RefreshWarReport } from "@/queries/refresh";
import { pollAt } from "@/queries/polling";
import { AppRoute } from "@/routes";
import { WarRoomPage } from "@/pages/WarRoomPage";

// The war room is where most visits land. Every other page loads in a chunk of its own.
const ChainWatcherPage = Component.lazy("ChainWatcherPage", () =>
  import("@/pages/ChainWatcherPage").then((module) => module.ChainWatcherPage),
);
const WarPlanningPage = Component.lazy("WarPlanningPage", () =>
  import("@/pages/WarPlanningPage").then((module) => module.WarPlanningPage),
);
const WarReportPage = Component.lazy("WarReportPage", () =>
  import("@/pages/WarReportPage").then((module) => module.WarReportPage),
);
const WarPayoutPage = Component.lazy("WarPayoutPage", () =>
  import("@/pages/WarPayoutPage").then((module) => module.WarPayoutPage),
);
const BountiesPage = Component.lazy("BountiesPage", () =>
  import("@/pages/BountiesPage").then((module) => module.BountiesPage),
);

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  RequestedSettingsChange: { settings: Settings },
  ChangedColorScheme: { dark: Schema.Boolean },
  CompletedValidateStoredKeys: {
    tornValid: Schema.NullOr(Schema.Boolean),
    scouterValid: Schema.NullOr(Schema.Boolean),
  },
  RequestedCredentials: { publicKey: Schema.String, ffscouterKey: Schema.NullOr(Schema.String) },
  TickedWhileHidden: {},
});

const SaveSettings = Command.make(
  "SaveSettings",
  { args: { settings: Settings } },
  ({ settings }) =>
    Effect.sync(() => saveSettings(localStorage, settings)).pipe(Effect.as(Component.noop)),
);

const ApplyTheme = Command.make(
  "ApplyTheme",
  { args: { theme: ThemeMode, preset: ThemePreset, systemDark: Schema.Boolean } },
  ({ theme, preset, systemDark }) =>
    Effect.sync(() => {
      const root = document.documentElement;
      const dark = theme === "system" ? systemDark : theme === "dark";
      root.classList.toggle("dark", dark);
      root.classList.toggle("light", !dark);
      root.dataset.theme = preset;
    }).pipe(Effect.as(Component.noop)),
);

// Keys stored before validation existed, or whose check never finished, are checked once.
const ValidateStoredKeys = Command.make(
  "ValidateStoredKeys",
  {
    args: { tornKey: Schema.NullOr(Schema.String), scouterKey: Schema.NullOr(Schema.String) },
  },
  ({ tornKey, scouterKey }) =>
    Effect.promise(() =>
      Promise.all([
        tornKey ? validateTornKey(tornKey) : Promise.resolve(null),
        scouterKey ? validateFFScouterKey(scouterKey) : Promise.resolve(null),
      ]),
    ).pipe(
      Effect.map(([tornValid, scouterValid]) =>
        AppMessage.CompletedValidateStoredKeys({ tornValid, scouterValid }),
      ),
    ),
);

const AppModel = Schema.Struct({
  route: AppRoute,
  settings: Settings,
  systemDark: Schema.Boolean,
});
type AppModel = typeof AppModel.Type;

const applyTheme = (model: AppModel) =>
  ApplyTheme.make({
    theme: model.settings.theme,
    preset: model.settings.preset,
    systemDark: model.systemDark,
  });

const APP_NAME = "TornOps";

const pageTitle = (route: AppRoute): string | undefined =>
  AppRoute.match(route, {
    WarRoom: () => undefined,
    ChainWatcher: () => "Chain watcher",
    WarPlanning: () => "War planning",
    WarReport: () => "War report",
    WarPayout: () => "War payout",
    Bounties: () => "Bounties",
    NotFound: () => "Not found",
  });

/** Shown while a page's chunk loads, and if it fails to. */
const PageFallback = <M>(result: AsyncResult.AsyncResult<unknown, unknown>, h: Html.H<M>) =>
  h.p
    .class("p-12 text-center text-sm text-muted-foreground")
    .children(
      AsyncResult.isFailure(result) ? "Couldn't load this page. Reload to try again." : "Loading…",
    );

export const AppNoDeps = Html.component({
  name: "App",
  props: Schema.Struct({ route: AppRoute, initialSettings: Settings }),
  model: AppModel,
  message: AppMessage,
}).make({
  init: ($) => {
    const { initialSettings: settings } = $.props;
    const model: AppModel = {
      route: $.props.route,
      settings,
      systemDark:
        typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches,
    };
    const tornKey =
      settings.publicKey && settings.isTornKeyValid === null ? settings.publicKey : null;
    const scouterKey =
      settings.ffscouterKey && settings.isFFScouterKeyValid === null ? settings.ffscouterKey : null;
    const step = $.set(model).run(applyTheme(model));
    return tornKey || scouterKey
      ? step.run(ValidateStoredKeys.make({ tornKey, scouterKey }))
      : step;
  },
  update: {
    ChangedRoute: ($, { route }) => $.evolve({ route }),
    RequestedSettingsChange: ($, { settings }) => {
      const next = { ...$.model, settings };
      return $.set(next).run(SaveSettings.make({ settings })).run(applyTheme(next));
    },
    ChangedColorScheme: ($, { dark }) => {
      const next = { ...$.model, systemDark: dark };
      return $.set(next).run(applyTheme(next));
    },
    CompletedValidateStoredKeys: ($, { tornValid, scouterValid }) => {
      const settings: Settings = {
        ...$.model.settings,
        isTornKeyValid: tornValid ?? $.model.settings.isTornKeyValid,
        isFFScouterKeyValid: scouterValid ?? $.model.settings.isFFScouterKeyValid,
      };
      return $.evolve({ settings }).run(SaveSettings.make({ settings }));
    },
    // Queries stop polling while the tab is hidden, but faction reads double as presence
    // history, which is saved at most once a minute: refresh them that often meanwhile.
    TickedWhileHidden: ($) => $.run(RefreshFactions.make()),
    RequestedCredentials: ($, { publicKey, ffscouterKey }) => {
      const settings: Settings = {
        ...$.model.settings,
        publicKey,
        ffscouterKey,
        isTornKeyValid: true,
        isFFScouterKeyValid: ffscouterKey ? true : null,
      };
      return $.evolve({ settings }).run(SaveSettings.make({ settings }));
    },
  },
  subscriptions: ({ model }) => [
    pollAt("polling", model.settings.refetchInterval),
    isLoggedIn(model.settings) &&
      Subscription.make(
        "backgroundPresence",
        Stream.tick("1 minute").pipe(
          Stream.filter(() => document.hidden),
          Stream.map(() => AppMessage.TickedWhileHidden()),
        ),
      ),
    Router.subscription(AppRoute, model.route, (route) => AppMessage.ChangedRoute({ route })),
    model.settings.theme === "system" &&
      HtmlSubscription.onMediaQuery("(prefers-color-scheme: dark)", (dark) =>
        AppMessage.ChangedColorScheme({ dark }),
      ),
  ],
  head: ({ model }) => {
    const title = pageTitle(model.route);
    return [
      Head.titleTemplate((page) => (page === APP_NAME ? page : `${page} · ${APP_NAME}`)),
      Head.title(title ?? APP_NAME),
      HtmlHead.lang("en"),
    ];
  },
  view: (h, { route, settings }) => {
    const onSettings = {
      RequestedSettingsChange: ({ settings }: { readonly settings: Settings }) =>
        AppMessage.RequestedSettingsChange({ settings }),
    };
    return h.div.children(
      Header(h, { props: { route, settings }, onEmit: onSettings }),
      !isLoggedIn(settings) && route._tag !== "NotFound"
        ? h.div
            .class("container mx-auto flex h-screen flex-col items-center justify-center gap-4 p-2")
            .children(
              Credentials(h, {
                props: {
                  initialTornKey: settings.publicKey,
                  initialFFScouterKey: settings.ffscouterKey,
                  isTornKeyValid: settings.isTornKeyValid,
                  isFFScouterKeyValid: settings.isFFScouterKeyValid,
                  card: true,
                  showErrors:
                    settings.isTornKeyValid === false || settings.isFFScouterKeyValid === false,
                },
                onEmit: {
                  RequestedCredentials: ({ publicKey, ffscouterKey }) =>
                    AppMessage.RequestedCredentials({ publicKey, ffscouterKey }),
                },
              }),
            )
        : AppRoute.match(route, {
            WarRoom: (route) =>
              WarRoomPage(h, {
                key: AppRoute.printPath(route),
                props: { settings },
                onEmit: onSettings,
              }),
            ChainWatcher: (route) =>
              ChainWatcherPage(h, {
                key: AppRoute.printPath(route),
                props: { settings },
                onEmit: onSettings,
                fallback: (result) => PageFallback(result, h),
              }),
            WarPlanning: (route) =>
              WarPlanningPage(h, {
                key: AppRoute.printPath(route),
                props: { settings },
                onEmit: onSettings,
                fallback: (result) => PageFallback(result, h),
              }),
            WarReport: (route) =>
              WarReportPage(h, {
                key: AppRoute.printPath(route),
                props: { settings },
                fallback: (result) => PageFallback(result, h),
              }),
            WarPayout: (route) =>
              WarPayoutPage(h, {
                key: AppRoute.printPath(route),
                props: { settings, route },
                fallback: (result) => PageFallback(result, h),
              }),
            Bounties: (route) =>
              BountiesPage(h, {
                key: AppRoute.printPath(route),
                props: { settings },
                onEmit: onSettings,
                fallback: (result) => PageFallback(result, h),
              }),
            NotFound: () =>
              h.main
                .class("mx-auto flex max-w-lg flex-col items-center gap-3 p-12 text-center")
                .children(
                  h.h1.class("text-lg font-medium").children("Page not found"),
                  h.a
                    .attr("href", AppRoute.print(AppRoute.WarRoom()))
                    .class("text-sm text-primary underline-offset-4 hover:underline")
                    .children("Back to the war room"),
                ),
          }),
    );
  },
});

/** Every query the pages read, and the commands that refresh them. One cache serves them all. */
const QueriesLive = Layer.mergeAll(
  GetUser.layer,
  GetOurFaction.layer,
  GetEnemyFaction.layer,
  GetOurChain.layer,
  GetEnemyChain.layer,
  GetChainReport.layer,
  GetChainAttacks.layer,
  GetAttackHistory.layer,
  GetRankedWars.layer,
  GetArmoryXanax.layer,
  GetFFScouterStats.layer,
  GetFactionActivity.layer,
  GetMemberActivity.layer,
  GetRecordedActivity.layer,
  GetBounties.layer,
  RefreshFactions.layer,
  RefreshWarReport.layer,
  RefreshBounties.layer,
);

export const App = AppNoDeps.pipe(Component.provide(QueriesLive));
