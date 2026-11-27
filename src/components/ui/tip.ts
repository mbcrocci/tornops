import { UiSchema } from "@effect/ui";
import { Tooltip, TooltipSide } from "@effect/ui-kit";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { cn } from "@/lib/utils";

export const TIP_POPUP_CLASS =
  "bg-foreground text-background z-50 w-fit rounded-md px-3 py-1.5 text-xs text-balance data-[starting-style]:opacity-0 transition-opacity";

const TipMessage = UiSchema.TaggedEnum({
  RequestedOpenTooltip: {},
  RequestedCloseTooltip: {},
});

/**
 * A tooltip around a trigger. The parent passes the trigger's content and the tooltip's
 * content as slots, and the trigger's look as `class`. The trigger is a button, so it can
 * take focus; give it a `label` when its content is only an icon.
 */
export const Tip = Html.component({
  name: "Tip",
  props: Schema.Struct({
    class: Schema.optional(Schema.String),
    popupClass: Schema.optional(Schema.String),
    label: Schema.optional(Schema.String),
    delay: Schema.optional(Schema.Number),
    side: Schema.optional(TooltipSide),
    sideOffset: Schema.optional(Schema.Number),
  }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: TipMessage,
  slots: ["trigger", "content"],
  restore: false,
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpenTooltip: ($) => $.evolve({ open: true }),
    RequestedCloseTooltip: ($) => $.evolve({ open: false }),
  },
  view: (h, model) =>
    Tooltip(h, {
      props: {
        open: model.open,
        delay: h.props.delay ?? 300,
        side: h.props.side ?? "top",
        sideOffset: h.props.sideOffset ?? 4,
      },
      onEmit: {
        RequestedOpen: () => TipMessage.RequestedOpenTooltip(),
        RequestedClose: () => TipMessage.RequestedCloseTooltip(),
      },
      view: (tooltip) =>
        h.span
          .class("contents")
          .children(
            tooltip
              .trigger(
                h.button
                  .attrs({ type: "button", "aria-label": h.props.label })
                  .class(h.props.class),
              )
              .children(h.slots.trigger),
            tooltip
              .positioner(h.div.class("m-0 border-0 bg-transparent p-0 overflow-visible"))
              .children(
                tooltip
                  .popup(h.div.class(cn(TIP_POPUP_CLASS, h.props.popupClass)))
                  .children(h.slots.content),
              ),
          ),
    }),
});
