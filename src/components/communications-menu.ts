import { Command, UiSchema } from "@effect/ui";
import { Menu } from "@effect/ui-kit";
import { Html } from "@effect/ui/html";
import { Effect, Schema } from "effect";
import { Check, MessageSquare } from "lucide";
import { Opaque } from "@/domain/schema";
import {
  buildCommunication,
  COMMUNICATIONS,
  type CommunicationKind,
  type CommunicationPlayer,
} from "@/lib/communications";
import { cn } from "@/lib/utils";
import { MENU_ITEM_CLASS, MENU_POPUP_CLASS, POSITIONER_CLASS } from "./settings";
import { Icon } from "./ui/icon";
import { buttonClass } from "./ui/primitives";

export const CommunicationsMenuMessage = UiSchema.TaggedEnum({
  RequestedOpenMenu: {},
  RequestedCloseMenu: {},
  PickedMessage: { value: Schema.String },
  CompletedCopyText: {},
  CompletedWaitAfterCopy: { copiedAt: Schema.Number },
});

/** Writes text to the clipboard. A refused write is ignored: there is nothing to undo. */
export const copyText = (text: string) =>
  Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(Effect.ignore);

const CopyText = Command.make("CopyText", { args: { text: Schema.String } }, ({ text }) =>
  copyText(text).pipe(Effect.as(CommunicationsMenuMessage.CompletedCopyText())),
);

const WaitAfterCopy = Command.make(
  "WaitAfterCopy",
  { args: { copiedAt: Schema.Number } },
  ({ copiedAt }) =>
    Effect.sleep("2 seconds").pipe(
      Effect.as(CommunicationsMenuMessage.CompletedWaitAfterCopy({ copiedAt })),
    ),
);

/** Copies a ready-made faction chat message about a player. */
export const CommunicationsMenu = Html.component({
  name: "CommunicationsMenu",
  props: Schema.Struct({
    player: Opaque<CommunicationPlayer>(),
    arrivalAt: Schema.NullOr(Schema.Number),
    emojis: Schema.Boolean,
    ghost: Schema.Boolean,
  }),
  model: Schema.Struct({ open: Schema.Boolean, copiedAt: Schema.NullOr(Schema.Number) }),
  message: CommunicationsMenuMessage,
  restore: false,
}).make({
  init: () => ({ open: false, copiedAt: null }),
  update: {
    RequestedOpenMenu: ($) => $.evolve({ open: true }),
    RequestedCloseMenu: ($) => $.evolve({ open: false }),
    PickedMessage: ($, { value }) => {
      const kind = COMMUNICATIONS.find((entry) => entry.kind === value)?.kind;
      if (!kind) return $.model;
      const { player, arrivalAt, emojis } = $.props;
      const text = buildCommunication(kind, player, {
        ...(arrivalAt === null ? {} : { arrivalAt }),
        emojis,
      });
      return $.evolve({ open: false }).run(CopyText.make({ text }));
    },
    CompletedCopyText: ($) => {
      const copiedAt = Date.now();
      return $.evolve({ copiedAt }).run(WaitAfterCopy.make({ copiedAt }));
    },
    // A later copy restarts the two seconds.
    CompletedWaitAfterCopy: ($, { copiedAt }) =>
      $.model.copiedAt === copiedAt ? $.evolve({ copiedAt: null }) : $.model,
  },
  view: (h, model) => {
    const { player, arrivalAt, emojis, ghost } = h.props;
    const copied = model.copiedAt !== null;
    const preview = (kind: CommunicationKind) =>
      buildCommunication(kind, player, { ...(arrivalAt === null ? {} : { arrivalAt }), emojis });
    return Menu(h, {
      props: {
        open: model.open,
        items: COMMUNICATIONS.map(({ kind, label }) => ({ value: kind, label })),
        align: "end",
      },
      onEmit: {
        RequestedOpen: () => CommunicationsMenuMessage.RequestedOpenMenu(),
        RequestedClose: () => CommunicationsMenuMessage.RequestedCloseMenu(),
        Picked: ({ value }) => CommunicationsMenuMessage.PickedMessage({ value }),
        Highlighted: () => undefined,
        RequestedQuery: () => undefined,
        Settled: () => undefined,
      },
      view: (menu) =>
        h.span.class("contents").children(
          menu
            .trigger({
              element: h.button
                .attrs({
                  type: "button",
                  "aria-label": "Communications",
                  title: copied ? "Copied to clipboard" : "Communications",
                })
                .class(
                  buttonClass({
                    variant: ghost ? "ghost" : "outline",
                    size: "icon-sm",
                    class: cn(ghost && "size-7 text-muted-foreground"),
                  }),
                ),
            })
            .children(
              Icon(h, copied ? Check : MessageSquare, { class: ghost ? "size-3.5" : "size-4" }),
            ),
          menu.positioner(h.div.class(POSITIONER_CLASS)).children(
            menu.popup(h.div.class(MENU_POPUP_CLASS)).children(
              h.div.class("px-2 py-1.5 text-sm font-medium").children("Copy message"),
              COMMUNICATIONS.map(({ kind, label }) =>
                menu
                  .item({
                    element: h.div.key(kind).attr("title", preview(kind)).class(MENU_ITEM_CLASS),
                    value: kind,
                  })
                  .children(label),
              ),
            ),
          ),
        ),
    });
  },
});
