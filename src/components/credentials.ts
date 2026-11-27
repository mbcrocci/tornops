import { Command, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Effect, Schema } from "effect";
import { Check, Eye, EyeOff, Info, LoaderCircle, X } from "lucide";
import { validateFFScouterKey, validateTornKey } from "@/lib/credentials";
import { Icon } from "./ui/icon";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  INPUT_GROUP_INPUT_CLASS,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  Label,
} from "./ui/primitives";
import { Tip } from "./ui/tip";

const Validation = Schema.Literals(["idle", "validating", "valid", "invalid"]);
type Validation = typeof Validation.Type;

export const CredentialsMessage = UiSchema.TaggedEnum({
  UpdatedTornKey: { value: Schema.String },
  UpdatedFFScouterKey: { value: Schema.String },
  ClickedRevealTornKey: {},
  ClickedRevealFFScouterKey: {},
  SubmittedCredentials: {},
  CompletedValidateKeys: { tornValid: Schema.Boolean, scouterValid: Schema.Boolean },
});

export const CredentialsEvents = UiSchema.TaggedEnum({
  /** Both keys work: store them. An empty FFScouter key means none. */
  RequestedCredentials: { publicKey: Schema.String, ffscouterKey: Schema.NullOr(Schema.String) },
});

export const ValidateKeys = Command.make(
  "ValidateKeys",
  { args: { tornKey: Schema.String, scouterKey: Schema.String } },
  ({ tornKey, scouterKey }) =>
    Effect.promise(() =>
      Promise.all([
        validateTornKey(tornKey),
        scouterKey ? validateFFScouterKey(scouterKey) : Promise.resolve(true),
      ]),
    ).pipe(
      Effect.map(([tornValid, scouterValid]) =>
        CredentialsMessage.CompletedValidateKeys({ tornValid, scouterValid }),
      ),
    ),
);

const CredentialsModel = Schema.Struct({
  tornKey: Schema.String,
  scouterKey: Schema.String,
  tornValidation: Validation,
  scouterValidation: Validation,
  showTornKey: Schema.Boolean,
  showScouterKey: Schema.Boolean,
});
type CredentialsModel = typeof CredentialsModel.Type;
type CredentialsMessage = typeof CredentialsMessage.Type;

const CredentialsDef = Html.component({
  name: "Credentials",
  props: Schema.Struct({
    initialTornKey: Schema.NullOr(Schema.String),
    initialFFScouterKey: Schema.NullOr(Schema.String),
    isTornKeyValid: Schema.NullOr(Schema.Boolean),
    isFFScouterKeyValid: Schema.NullOr(Schema.Boolean),
    /** Drawn as a login card with the stored keys' problems, instead of a bare form. */
    card: Schema.Boolean,
    showErrors: Schema.Boolean,
  }),
  model: CredentialsModel,
  message: CredentialsMessage,
  events: CredentialsEvents,
  // A validation in flight is not running after Back, so it is not saved.
  restore: (model): CredentialsModel => ({
    ...model,
    tornValidation: "idle",
    scouterValidation: "idle",
  }),
});

const ValidationIcon = <M>(h: Html.H<M>, state: Validation) =>
  state === "validating"
    ? Icon(h, LoaderCircle, { class: "size-3.5 animate-spin" })
    : state === "valid"
      ? Icon(h, Check, { class: "size-3.5 text-green-600 dark:text-green-400" })
      : state === "invalid"
        ? Icon(h, X, { class: "size-3.5 text-red-600 dark:text-red-400" })
        : null;

const KeyHelp = (h: Html.H<CredentialsMessage>, key: string, label: string, text: string) =>
  Tip(h, {
    key,
    props: {
      label,
      class:
        "text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-0.5",
      popupClass: "max-w-72",
      sideOffset: 6,
    },
    slots: { trigger: Icon(h, Info, { class: "size-3.5" }), content: text },
  });

const KeyField = (
  h: Html.H<CredentialsMessage>,
  options: {
    readonly id: string;
    readonly label: string;
    readonly optional: boolean;
    readonly help: [key: string, label: string, text: string];
    readonly placeholder: string;
    readonly value: string;
    readonly shown: boolean;
    readonly validation: Validation;
    readonly disabled: boolean;
    readonly onInput: (value: string) => CredentialsMessage;
    readonly onReveal: CredentialsMessage;
  },
) =>
  h.div.class("flex flex-col gap-1.5").children(
    h.div
      .class("flex items-center gap-1.5")
      .children(
        Label(h, { for: options.id }).children(
          options.label,
          options.optional &&
            h.span.class("text-muted-foreground font-normal").children("(optional)"),
        ),
        KeyHelp(h, ...options.help),
      ),
    InputGroup(h, {
      class: options.validation === "valid" ? "border-green-600 dark:border-green-400" : undefined,
    })
      .attr("aria-invalid", options.validation === "invalid" ? "true" : undefined)
      .children(
        h.input
          .attrs({
            id: options.id,
            "data-slot": "input-group-control",
            "aria-invalid": options.validation === "invalid" ? "true" : undefined,
            type: options.shown ? "text" : "password",
            placeholder: options.placeholder,
            autocomplete: "off",
          })
          .class(INPUT_GROUP_INPUT_CLASS)
          .value(options.value)
          .disabled(options.disabled)
          .on("input", ({ value }) => options.onInput(value)),
        InputGroupAddon(h, { align: "inline-end" }).children(
          ValidationIcon(h, options.validation),
          InputGroupButton(h)
            .attr("aria-label", options.shown ? "Hide key" : "Show key")
            .on("click", options.onReveal)
            .children(Icon(h, options.shown ? EyeOff : Eye, { class: "size-3.5" })),
        ),
      ),
  );

const CredentialsForm = CredentialsDef.fragment((h, model: CredentialsModel) => {
  const validating = h.isRunning(ValidateKeys);
  return h.form
    .class("flex flex-col gap-4")
    .attr("aria-busy", validating ? "true" : "false")
    .on("submit", CredentialsMessage.SubmittedCredentials())
    .children(
      KeyField(h, {
        id: "torn-key",
        label: "Torn Limited Access API Key",
        optional: false,
        help: [
          "torn",
          "About the Torn API key",
          "Reads your player status, faction members, chains, and attack history. Use a Torn key with Limited Access for more features.",
        ],
        placeholder: "Your Torn Limited Access API Key",
        value: model.tornKey,
        shown: model.showTornKey,
        validation: model.tornValidation,
        disabled: validating,
        onInput: (value) => CredentialsMessage.UpdatedTornKey({ value }),
        onReveal: CredentialsMessage.ClickedRevealTornKey(),
      }),
      KeyField(h, {
        id: "ffscouter-key",
        label: "FFScouter API Key",
        optional: true,
        help: [
          "ffscouter",
          "About the FFScouter API key",
          "Adds estimated battle stats, fair fight scores, and player and faction activity history from FFScouter. Leave it blank to use TornOps without these features.",
        ],
        placeholder: "Your FFScouter API Key",
        value: model.scouterKey,
        shown: model.showScouterKey,
        validation: model.scouterValidation,
        disabled: validating,
        onInput: (value) => CredentialsMessage.UpdatedFFScouterKey({ value }),
        onReveal: CredentialsMessage.ClickedRevealFFScouterKey(),
      }),
      model.tornValidation === "invalid" &&
        h.p
          .attr("role", "alert")
          .class("text-sm text-red-600 dark:text-red-400")
          .children(
            "Could not validate your Torn key. Check the key and its faction API Access permission, then try again.",
          ),
      model.scouterKey !== "" &&
        model.scouterValidation === "invalid" &&
        h.p
          .attr("role", "alert")
          .class("text-sm text-red-600 dark:text-red-400")
          .children(
            "Could not validate your FFScouter key. Check the key and try again, or leave it blank.",
          ),
      Button(h)
        .attr("type", "submit")
        .disabled(model.tornKey.trim() === "" || validating)
        .children(
          validating && Icon(h, LoaderCircle, { class: "size-4 animate-spin" }),
          validating ? "Validating…" : "Validate",
        ),
    );
});

export const Credentials = CredentialsDef.make({
  init: ($) => ({
    tornKey: $.props.initialTornKey ?? "",
    scouterKey: $.props.initialFFScouterKey ?? "",
    tornValidation: "idle",
    scouterValidation: "idle",
    showTornKey: false,
    showScouterKey: false,
  }),
  update: {
    UpdatedTornKey: ($, { value }) => $.evolve({ tornKey: value, tornValidation: "idle" }),
    UpdatedFFScouterKey: ($, { value }) =>
      $.evolve({ scouterKey: value, scouterValidation: "idle" }),
    ClickedRevealTornKey: ($) => $.evolve({ showTornKey: (shown) => !shown }),
    ClickedRevealFFScouterKey: ($) => $.evolve({ showScouterKey: (shown) => !shown }),
    SubmittedCredentials: ($) => {
      const tornKey = $.model.tornKey.trim();
      const scouterKey = $.model.scouterKey.trim();
      // A second submit while one runs is ignored, as is an empty key.
      if (!tornKey || $.model.tornValidation === "validating") return $.model;
      return $.evolve({
        tornValidation: "validating",
        scouterValidation: scouterKey ? "validating" : "idle",
      }).run(ValidateKeys.make({ tornKey, scouterKey }));
    },
    CompletedValidateKeys: ($, { tornValid, scouterValid }) => {
      const scouterKey = $.model.scouterKey.trim();
      const next = $.evolve({
        tornValidation: tornValid ? "valid" : "invalid",
        scouterValidation: scouterKey ? (scouterValid ? "valid" : "invalid") : "idle",
      });
      return tornValid && scouterValid
        ? next.emit(
            CredentialsEvents.RequestedCredentials({
              publicKey: $.model.tornKey.trim(),
              ffscouterKey: scouterKey || null,
            }),
          )
        : next;
    },
  },
  view: (h, model) => {
    if (!h.props.card) return CredentialsForm(h, model);
    const { isTornKeyValid, isFFScouterKeyValid } = h.props;
    const hasErrors =
      h.props.showErrors && (isTornKeyValid === false || isFFScouterKeyValid === false);
    return Card(h, { class: "w-full max-w-lg" }).children(
      CardHeader(h).children(
        CardTitle(h).children("Login"),
        CardDescription(h).children(
          hasErrors
            ? "Your stored credentials are invalid. Please update them."
            : "Enter your Torn API key, then validate to log in. FFScouter is optional.",
        ),
      ),
      CardContent(h).children(
        hasErrors &&
          h.div
            .class(
              "mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md",
            )
            .children(
              h.p
                .class("text-sm font-medium text-red-800 dark:text-red-200 mb-1")
                .children("Invalid Credentials Detected"),
              h.ul
                .class("text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1")
                .children(
                  isTornKeyValid === false &&
                    h.li.children("Torn Limited Access API Key is invalid or expired"),
                  isFFScouterKeyValid === false &&
                    h.li.children("FFScouter API Key is invalid or expired"),
                ),
            ),
        CredentialsForm(h, model),
      ),
    );
  },
});
