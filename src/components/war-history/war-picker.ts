import { UiSchema } from "@effect/ui";
import { Popover } from "@effect/ui-kit";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ChevronDown } from "lucide";
import { Opaque } from "@/domain/schema";
import type { FactionRankedWar } from "@/lib/faction";
import { Icon } from "../ui/icon";
import { buttonClass, Button } from "../ui/primitives";
import { POSITIONER_CLASS } from "../settings";
import { formatWarDate, isWarOngoing, warOpponent } from "./format";

export const WarPickerMessage = UiSchema.TaggedEnum({
  RequestedOpenPopover: {},
  RequestedClosePopover: {},
  ToggledWar: { id: Schema.Number },
  ClickedSelectAll: {},
  ClickedClear: {},
});

export const WarPickerEvents = UiSchema.TaggedEnum({
  RequestedSelection: { warIds: Schema.Array(Schema.Number) },
});

/** Picks one or more ranked wars from the faction's list. */
export const WarPicker = Html.component({
  name: "WarPicker",
  props: Schema.Struct({
    wars: Opaque<ReadonlyArray<FactionRankedWar>>(),
    selectedIds: Schema.Array(Schema.Number),
    ownFactionId: Schema.NullOr(Schema.Number),
    timeZone: Schema.String,
  }),
  model: Schema.Struct({ open: Schema.Boolean }),
  message: WarPickerMessage,
  events: WarPickerEvents,
  restore: false,
}).make({
  init: () => ({ open: false }),
  update: {
    RequestedOpenPopover: ($) => $.evolve({ open: true }),
    RequestedClosePopover: ($) => $.evolve({ open: false }),
    ToggledWar: ($, { id }) => {
      const selected = $.props.selectedIds;
      return $.emit(
        WarPickerEvents.RequestedSelection({
          warIds: selected.includes(id)
            ? selected.filter((warId) => warId !== id)
            : [...selected, id],
        }),
      );
    },
    ClickedSelectAll: ($) =>
      $.emit(WarPickerEvents.RequestedSelection({ warIds: $.props.wars.map((war) => war.id) })),
    ClickedClear: ($) => $.emit(WarPickerEvents.RequestedSelection({ warIds: [] })),
  },
  view: (h, model) => {
    const { wars, selectedIds, timeZone } = h.props;
    const ownFactionId = h.props.ownFactionId ?? undefined;
    const selected = new Set(selectedIds);
    const selectedWars = wars.filter((war) => selected.has(war.id));
    const label =
      selectedWars.length === 0
        ? "Choose wars"
        : selectedWars.length === 1
          ? `${warOpponent(selectedWars[0], ownFactionId)?.name ?? `War ${selectedWars[0].id}`} · ${
              isWarOngoing(selectedWars[0])
                ? "Ongoing"
                : formatWarDate(selectedWars[0].end, timeZone)
            }`
          : `${selectedWars.length} wars selected`;
    return h.div.class("grid gap-1 text-xs text-muted-foreground").children(
      h.span.children("Ranked wars"),
      Popover(h, {
        props: { open: model.open, align: "start", sideOffset: 4 },
        onEmit: {
          RequestedOpen: () => WarPickerMessage.RequestedOpenPopover(),
          RequestedClose: () => WarPickerMessage.RequestedClosePopover(),
          Settled: () => undefined,
        },
        view: (popover) =>
          h.div(
            popover
              .trigger({
                element: h.button
                  .attr("type", "button")
                  .disabled(wars.length === 0)
                  .class(
                    buttonClass({
                      variant: "outline",
                      class: "w-full min-w-0 justify-between px-3 font-normal text-foreground",
                    }),
                  ),
              })
              .children(
                h.span.class("truncate").children(label),
                Icon(h, ChevronDown, { class: "size-4 text-muted-foreground" }),
              ),
            popover.portal(h.dialog)?.children(
              popover.positioner(h.div.class(POSITIONER_CLASS)).children(
                popover
                  .popup(
                    h.div.class(
                      "bg-popover text-popover-foreground z-50 w-[min(92vw,28rem)] rounded-md border p-0 shadow-md outline-hidden",
                    ),
                  )
                  .children(
                    h.div
                      .class("flex items-center justify-between border-b px-3 py-2")
                      .children(
                        h.span
                          .class("text-xs text-muted-foreground")
                          .children(`${selectedWars.length} of ${wars.length} selected`),
                        h.div
                          .class("flex gap-1")
                          .children(
                            Button(h, { size: "sm", variant: "ghost" })
                              .on("click", WarPickerMessage.ClickedSelectAll())
                              .children("Select all"),
                            Button(h, { size: "sm", variant: "ghost" })
                              .on("click", WarPickerMessage.ClickedClear())
                              .children("Clear"),
                          ),
                      ),
                    h.div.class("max-h-80 overflow-y-auto p-1").children(
                      wars.map((war) => {
                        const rival = warOpponent(war, ownFactionId);
                        const checkboxId = `war-${war.id}`;
                        return h.label
                          .key(String(war.id))
                          .attr("for", checkboxId)
                          .class(
                            "flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2.5 hover:bg-muted",
                          )
                          .children(
                            h.input
                              .attrs({ id: checkboxId, type: "checkbox" })
                              .class("size-4 shrink-0 accent-primary")
                              .checked(selected.has(war.id))
                              .on("change", WarPickerMessage.ToggledWar({ id: war.id })),
                            h.span
                              .class("min-w-0 flex-1")
                              .children(
                                h.span
                                  .class("block truncate text-sm font-medium text-foreground")
                                  .children(rival?.name ?? `War ${war.id}`),
                                h.span
                                  .class("block font-mono text-[10px] text-muted-foreground")
                                  .children(
                                    `${formatWarDate(war.start, timeZone)} · #${war.id}`,
                                    isWarOngoing(war) &&
                                      h.span
                                        .class("ml-1.5 uppercase text-primary")
                                        .children("· Ongoing"),
                                  ),
                              ),
                            war.target > 0 &&
                              h.span
                                .class("font-mono text-xs tabular-nums text-foreground")
                                .children(
                                  `${war.factions.find((faction) => faction.id === ownFactionId)?.score ?? 0}:${rival?.score ?? 0}`,
                                ),
                          );
                      }),
                    ),
                  ),
              ),
            ),
          ),
      }),
    );
  },
});
