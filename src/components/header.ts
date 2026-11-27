import { UiSchema, type View } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { Activity, Crosshair, Radio, Swords } from "lucide";
import { isLoggedIn, Settings } from "@/domain/Settings";
import { GetUser } from "@/queries/torn";
import { AppRoute } from "@/routes";
import { cn } from "@/lib/utils";
import { SettingsSheet } from "./settings";
import { Icon } from "./ui/icon";

const LINKS = [
  { route: AppRoute.WarRoom(), tag: "WarRoom", label: "War room", icon: Swords },
  { route: AppRoute.ChainWatcher(), tag: "ChainWatcher", label: "Chain watcher", icon: Activity },
  { route: AppRoute.WarPlanning(), tag: "WarPlanning", label: "War planning", icon: Radio },
  // The payout page belongs with the report, so its link stays lit there too.
  { route: AppRoute.WarReport(), tag: "WarReport", label: "War report", icon: Swords },
  { route: AppRoute.Bounties(), tag: "Bounties", label: "Bounties", icon: Crosshair },
] as const;

/** War banner with a tally cut into it. Uses currentColor, so it follows the theme. */
export const TornOpsLogo = <M>(
  h: Html.H<M>,
  maskId: string,
  className?: string,
): View.Content<M, never> =>
  h.svg
    .attrs({ viewBox: "0 0 64 64", "aria-hidden": "true" })
    .class(cn("size-5", className))
    .children(
      h.mask.attr("id", maskId).children(
        h.rect.attrs({ width: "64", height: "64", fill: "#fff" }),
        h.g
          .attr("fill", "#000")
          .children(
            h.rect.attrs({ x: "21", y: "15", width: "5", height: "22", rx: "1" }),
            h.rect.attrs({ x: "29.5", y: "15", width: "5", height: "22", rx: "1" }),
            h.rect.attrs({ x: "38", y: "15", width: "5", height: "22", rx: "1" }),
          ),
        h.line.attrs({
          x1: "17",
          y1: "34",
          x2: "48",
          y2: "18",
          stroke: "#000",
          "stroke-width": "4.5",
          "stroke-linecap": "round",
        }),
      ),
      h.rect.attrs({ fill: "currentColor", x: "8", y: "9", width: "6", height: "51", rx: "1" }),
      h.rect.attrs({ fill: "currentColor", x: "6", y: "4", width: "10", height: "5", rx: "1.5" }),
      h.path.attrs({
        mask: `url(#${maskId})`,
        fill: "currentColor",
        d: "M14 9H59L53 15 60 20.5 52 26 58 31 51 36.5 56 43H14Z",
      }),
    );

export const HeaderMessage = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

export const HeaderEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

export const Header = Html.component({
  name: "Header",
  props: Schema.Struct({ route: AppRoute, settings: Settings }),
  model: Schema.Null,
  message: HeaderMessage,
  events: HeaderEvents,
  queries: {
    user: {
      query: GetUser,
      args: ({ props }) =>
        isLoggedIn(props.settings) ? { key: props.settings.publicKey } : undefined,
    },
  },
}).make({
  init: () => null,
  update: {
    RequestedSettingsChange: ($, { settings }) =>
      $.emit(HeaderEvents.RequestedSettingsChange({ settings })),
  },
  view: (h) => {
    const { route, settings } = h.props;
    const user = AsyncResult.isSuccess(h.queries.user) ? h.queries.user.value : undefined;
    const activityStatus = user?.last_action?.status ?? "Unknown";
    const currentTag = route._tag === "WarPayout" ? "WarReport" : route._tag;
    return h.header.class("flex items-center border-b bg-background/95 backdrop-blur").children(
      h.nav
        .attr("aria-label", "Main navigation")
        .class(
          "mx-auto flex h-12 min-w-0 max-w-[1500px] flex-1 items-center gap-1 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,black_55%,transparent_92%)] [scrollbar-width:none] sm:px-6 lg:[mask-image:none]",
        )
        .children(
          h.a
            .attrs({ href: AppRoute.print(AppRoute.WarRoom()), "aria-label": "TornOps home" })
            .class("mr-3 flex shrink-0 items-center gap-2 rounded-md")
            .children(
              TornOpsLogo(h, h.id("logo-mask"), "text-primary"),
              h.span
                .class("hidden font-mono text-xs font-bold tracking-[0.18em] sm:inline")
                .children("TORNOPS"),
            ),
          LINKS.map(({ route: to, tag, label, icon }) =>
            h.a
              .key(tag)
              .attrs({
                href: AppRoute.print(to),
                "aria-current": currentTag === tag ? "page" : undefined,
              })
              .class(
                "flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                currentTag === tag && "bg-primary/10 text-primary",
              )
              .children(Icon(h, icon, { class: "size-3.5" }), label),
          ),
        ),
      isLoggedIn(settings) &&
        h.div.class("flex shrink-0 items-center gap-3 pr-2").children(
          user?.name && user.player_id
            ? h.div
                .class(
                  "hidden max-w-48 rounded-md border bg-muted/30 px-2.5 py-1 text-left leading-tight sm:block",
                )
                .children(
                  h.div
                    .class("flex items-center justify-between gap-1.5 text-xs font-medium")
                    .children(
                      h.span.class("truncate").attr("title", user.name).children(user.name),
                      h.span
                        .attrs({ role: "img", "aria-label": activityStatus, title: activityStatus })
                        .class(
                          "size-2 shrink-0 rounded-full",
                          activityStatus === "Online"
                            ? "bg-green-500"
                            : activityStatus === "Idle"
                              ? "bg-yellow-500"
                              : "bg-gray-400",
                        ),
                    ),
                  h.div
                    .class("text-[10px] text-muted-foreground")
                    .children(`ID: ${user.player_id}`),
                )
            : null,
          SettingsSheet(h, {
            props: { settings },
            onEmit: {
              RequestedSettingsChange: ({ settings }) =>
                HeaderMessage.RequestedSettingsChange({ settings }),
            },
          }),
        ),
    );
  },
});
