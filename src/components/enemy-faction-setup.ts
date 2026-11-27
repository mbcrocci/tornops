import { Command, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Effect, Schema } from "effect";
import { LoaderCircle } from "lucide";
import { Settings } from "@/domain/Settings";
import { enemyFactionIdOf, getUserFaction } from "@/lib/torn-api";
import { Icon } from "./ui/icon";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  INPUT_GROUP_INPUT_CLASS,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  Label,
} from "./ui/primitives";

const CheckWars = Schema.Literals(["idle", "none", "failed"]);

export const EnemyFactionSetupMessage = UiSchema.TaggedEnum({
  UpdatedEnemyInput: { value: Schema.String },
  ClickedSaveEnemy: {},
  ClickedCheckWars: {},
  CompletedCheckWarsForEnemy: { enemyId: Schema.NullOr(Schema.Number), failed: Schema.Boolean },
});

export const EnemyFactionSetupEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const CheckWarsForEnemy = Command.make(
  "CheckWarsForEnemy",
  { args: { key: Schema.String } },
  ({ key }) =>
    Effect.tryPromise(() => getUserFaction(key)).pipe(
      Effect.match({
        onSuccess: (faction) =>
          EnemyFactionSetupMessage.CompletedCheckWarsForEnemy({
            enemyId: enemyFactionIdOf(faction) ?? null,
            failed: false,
          }),
        onFailure: () =>
          EnemyFactionSetupMessage.CompletedCheckWarsForEnemy({ enemyId: null, failed: true }),
      }),
    ),
);

/** Shown while no enemy faction is set: enter its ID, or find it from our ranked wars. */
export const EnemyFactionSetup = Html.component({
  name: "EnemyFactionSetup",
  props: Schema.Struct({ settings: Settings }),
  model: Schema.Struct({ enemyInput: Schema.String, checkWars: CheckWars }),
  message: EnemyFactionSetupMessage,
  events: EnemyFactionSetupEvents,
  restore: (model) => ({ ...model, checkWars: "idle" as const }),
}).make({
  init: () => ({ enemyInput: "", checkWars: "idle" }),
  update: {
    UpdatedEnemyInput: ($, { value }) => $.evolve({ enemyInput: value }),
    ClickedSaveEnemy: ($) => {
      const id = parseInt($.model.enemyInput, 10);
      return Number.isFinite(id)
        ? $.emit(
            EnemyFactionSetupEvents.RequestedSettingsChange({
              settings: { ...$.props.settings, enemyFactionId: id },
            }),
          )
        : $.model;
    },
    ClickedCheckWars: ($) =>
      $.evolve({ checkWars: "idle" }).run(
        CheckWarsForEnemy.make({ key: $.props.settings.publicKey ?? "" }),
      ),
    CompletedCheckWarsForEnemy: ($, { enemyId, failed }) =>
      enemyId !== null
        ? $.emit(
            EnemyFactionSetupEvents.RequestedSettingsChange({
              settings: { ...$.props.settings, enemyFactionId: enemyId },
            }),
          )
        : $.evolve({ checkWars: failed ? "failed" : "none" }),
  },
  view: (h, model) => {
    const checking = h.isRunning(CheckWarsForEnemy);
    const hasKey = Boolean(h.props.settings.publicKey);
    return Empty(h).children(
      EmptyHeader(h, { class: "min-w-lg" }).children(
        EmptyTitle(h).children("No enemy faction"),
        EmptyDescription(h).children(
          "Enter an enemy faction ID to monitor their members and chain activity.",
        ),
      ),
      EmptyContent(h).children(
        h.div.class("flex w-full max-w-sm flex-col gap-2").children(
          Label(h, { for: "enemy-faction-id-empty" }).children("Enemy Faction ID"),
          InputGroup(h).children(
            h.input
              .attrs({
                id: "enemy-faction-id-empty",
                type: "number",
                placeholder: "1234567890",
                "data-slot": "input-group-control",
              })
              .class(INPUT_GROUP_INPUT_CLASS)
              .value(model.enemyInput)
              .on("input", ({ value }) => EnemyFactionSetupMessage.UpdatedEnemyInput({ value })),
            InputGroupAddon(h, { align: "inline-end" }).children(
              InputGroupButton(h)
                .on("click", EnemyFactionSetupMessage.ClickedSaveEnemy())
                .children("Save"),
            ),
          ),
        ),
        h.div.class("my-4 border-t"),
        h.div.class("flex w-full max-w-sm flex-col gap-2").children(
          Button(h, { variant: "outline" })
            .disabled(!hasKey || checking)
            .on("click", EnemyFactionSetupMessage.ClickedCheckWars())
            .children(
              ...(checking
                ? [
                    Icon(h, LoaderCircle, { class: "size-4 shrink-0 animate-spin" }),
                    h.span.children("Checking…"),
                  ]
                : ["Check for wars"]),
            ),
          !hasKey &&
            h.p
              .class("text-muted-foreground text-xs")
              .children("Add your API key in settings to use this."),
          model.checkWars === "none" &&
            h.p.class("text-muted-foreground text-sm").children("No active wars."),
          model.checkWars === "failed" &&
            h.p
              .class("text-destructive text-sm")
              .children("Failed to check wars. Check your API key and try again."),
        ),
      ),
    );
  },
});
