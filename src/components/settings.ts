import { UiSchema } from "@effect/ui";
import { Checkbox, Dialog, Menu } from "@effect/ui-kit";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import {
  Check,
  ChevronDown,
  Monitor,
  Moon,
  Palette,
  Settings as SettingsIcon,
  Sun,
  X,
} from "lucide";
import { DEFAULT_REFETCH_INTERVAL, Settings, THEME_PRESETS, ThemeMode } from "@/domain/Settings";
import { cn } from "@/lib/utils";
import { Credentials } from "./credentials";
import { Icon } from "./ui/icon";
import {
  Button,
  buttonClass,
  INPUT_GROUP_INPUT_CLASS,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  Label,
} from "./ui/primitives";

export const MENU_POPUP_CLASS =
  "bg-popover text-popover-foreground z-50 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none transition-[opacity,scale] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0";
export const MENU_ITEM_CLASS =
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
export const POSITIONER_CLASS = "m-0 border-0 bg-transparent p-0 overflow-visible";

const THEME_MODES: ReadonlyArray<{ id: ThemeMode; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export const SettingsSheetMessage = UiSchema.TaggedEnum({
  RequestedOpenSettings: {},
  RequestedCloseSettings: {},
  RequestedOpenThemeMenu: {},
  RequestedCloseThemeMenu: {},
  PickedThemePreset: { value: Schema.String },
  ClickedColorMode: { mode: ThemeMode },
  RequestedCredentials: { publicKey: Schema.String, ffscouterKey: Schema.NullOr(Schema.String) },
  UpdatedEnemyFactionInput: { value: Schema.String },
  ClickedSaveEnemyFaction: {},
  ClickedResetEnemyFaction: {},
  UpdatedIntervalInput: { value: Schema.String },
  ClickedSaveInterval: {},
  ClickedResetInterval: {},
  ToggledCommunicationEmojis: { checked: Schema.Boolean },
});
type SettingsSheetMessage = typeof SettingsSheetMessage.Type;

export const SettingsSheetEvents = UiSchema.TaggedEnum({
  RequestedSettingsChange: { settings: Settings },
});

const SettingsSheetModel = Schema.Struct({
  open: Schema.Boolean,
  themeMenuOpen: Schema.Boolean,
  enemyFactionInput: Schema.String,
  intervalInput: Schema.String,
});

const SettingsSheetDef = Html.component({
  name: "SettingsSheet",
  props: Schema.Struct({ settings: Settings }),
  model: SettingsSheetModel,
  message: SettingsSheetMessage,
  events: SettingsSheetEvents,
  restore: (model) => ({ ...model, open: false, themeMenuOpen: false }),
});

const SaveResetGroup = (
  h: Html.H<SettingsSheetMessage>,
  input: {
    readonly placeholder: string;
    readonly value: string;
    readonly min?: string;
    readonly onInput: (value: string) => SettingsSheetMessage;
    readonly onSave: SettingsSheetMessage;
    readonly onReset: SettingsSheetMessage;
  },
) =>
  InputGroup(h).children(
    h.input
      .attrs({
        type: "number",
        "data-slot": "input-group-control",
        placeholder: input.placeholder,
        min: input.min,
      })
      .class(INPUT_GROUP_INPUT_CLASS)
      .value(input.value)
      .on("input", ({ value }) => input.onInput(value)),
    InputGroupAddon(h, { align: "inline-end" }).children(
      InputGroupButton(h).on("click", input.onSave).children("Save"),
      InputGroupButton(h, { variant: "outline" }).on("click", input.onReset).children("Reset"),
    ),
  );

const AppearanceSettings = SettingsSheetDef.fragment((h, model: typeof SettingsSheetModel.Type) => {
  const { theme, preset } = h.props.settings;
  const selected = THEME_PRESETS.find((option) => option.id === preset);
  return h.section
    .class("mb-2 flex flex-col gap-4 border-b pb-7")
    .attr("aria-labelledby", "appearance-title")
    .children(
      h.div(
        h.label
          .id("appearance-title")
          .class("text-sm leading-none font-medium")
          .children("Appearance"),
        h.p
          .class("text-sm text-muted-foreground")
          .children("Choose a visual theme and color mode."),
      ),
      h.div.class("flex flex-col gap-2").children(
        h.span.class("text-xs text-muted-foreground font-medium").children("Theme"),
        Menu(h, {
          props: {
            open: model.themeMenuOpen,
            items: THEME_PRESETS.map(({ id, label }) => ({ value: id, label })),
          },
          onEmit: {
            RequestedOpen: () => SettingsSheetMessage.RequestedOpenThemeMenu(),
            RequestedClose: () => SettingsSheetMessage.RequestedCloseThemeMenu(),
            Picked: ({ value }) => SettingsSheetMessage.PickedThemePreset({ value }),
            Highlighted: () => undefined,
            RequestedQuery: () => undefined,
            Settled: () => undefined,
          },
          view: (themeMenu) =>
            h.div(
              themeMenu
                .trigger({
                  element: h.button
                    .attr("type", "button")
                    .class(buttonClass({ variant: "outline", class: "w-full justify-between" })),
                })
                .children(
                  h.span
                    .class("flex items-center gap-2")
                    .children(Icon(h, Palette), selected?.label ?? "Select theme"),
                  Icon(h, ChevronDown, { class: "text-muted-foreground" }),
                ),
              themeMenu.positioner(h.div.class(POSITIONER_CLASS)).children(
                themeMenu.popup(h.div.class(cn(MENU_POPUP_CLASS, "w-(--anchor-width)"))).children(
                  h.div.class("px-2 py-1.5 text-sm font-medium").children("Theme"),
                  themeMenu.radioGroup({ element: h.div, value: preset }).children(
                    THEME_PRESETS.map((option) =>
                      themeMenu
                        .radioItem({
                          element: h.div.key(option.id).class(cn(MENU_ITEM_CLASS, "pl-8")),
                          value: option.id,
                        })
                        .children(
                          h.span
                            .class(
                              "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center",
                            )
                            .children(
                              themeMenu
                                .radioItemIndicator({ element: h.span, value: option.id })
                                ?.class("size-2 rounded-full bg-current"),
                            ),
                          option.label,
                        ),
                    ),
                  ),
                ),
              ),
            ),
        }),
      ),
      h.div.class("flex flex-col gap-2").children(
        h.span.class("text-xs text-muted-foreground font-medium").children("Color mode"),
        h.div.class("grid grid-cols-3 gap-2").children(
          THEME_MODES.map((option) =>
            Button(h, { size: "sm", variant: theme === option.id ? "secondary" : "outline" })
              .key(option.id)
              .attr("aria-pressed", theme === option.id ? "true" : "false")
              .on("click", SettingsSheetMessage.ClickedColorMode({ mode: option.id }))
              .children(Icon(h, option.icon), option.label),
          ),
        ),
      ),
    );
});

const parseIntervalSeconds = (input: string) => {
  const seconds = parseFloat(input);
  return Number.isFinite(seconds) ? seconds : DEFAULT_REFETCH_INTERVAL / 1000;
};

const change = (settings: Settings) => SettingsSheetEvents.RequestedSettingsChange({ settings });

export const SettingsSheet = SettingsSheetDef.make({
  init: ($) => ({
    open: false,
    themeMenuOpen: false,
    enemyFactionInput: $.props.settings.enemyFactionId?.toString() ?? "",
    intervalInput: String($.props.settings.refetchInterval / 1000),
  }),
  update: {
    RequestedOpenSettings: ($) =>
      // The inputs start from what is saved each time the sheet opens.
      $.evolve({
        open: true,
        enemyFactionInput: $.props.settings.enemyFactionId?.toString() ?? "",
        intervalInput: String($.props.settings.refetchInterval / 1000),
      }),
    RequestedCloseSettings: ($) => $.evolve({ open: false, themeMenuOpen: false }),
    RequestedOpenThemeMenu: ($) => $.evolve({ themeMenuOpen: true }),
    RequestedCloseThemeMenu: ($) => $.evolve({ themeMenuOpen: false }),
    PickedThemePreset: ($, { value }) => {
      const preset = THEME_PRESETS.find((option) => option.id === value);
      return preset
        ? $.evolve({ themeMenuOpen: false }).emit(
            change({ ...$.props.settings, preset: preset.id }),
          )
        : $.model;
    },
    ClickedColorMode: ($, { mode }) => $.emit(change({ ...$.props.settings, theme: mode })),
    RequestedCredentials: ($, { publicKey, ffscouterKey }) =>
      $.emit(
        change({
          ...$.props.settings,
          publicKey,
          ffscouterKey,
          isTornKeyValid: true,
          isFFScouterKeyValid: ffscouterKey ? true : null,
        }),
      ),
    UpdatedEnemyFactionInput: ($, { value }) => $.evolve({ enemyFactionInput: value }),
    ClickedSaveEnemyFaction: ($) => {
      const id = parseInt($.model.enemyFactionInput, 10);
      return $.emit(
        change({ ...$.props.settings, enemyFactionId: Number.isFinite(id) ? id : null }),
      );
    },
    ClickedResetEnemyFaction: ($) =>
      $.evolve({ enemyFactionInput: "" }).emit(
        change({ ...$.props.settings, enemyFactionId: null }),
      ),
    UpdatedIntervalInput: ($, { value }) => $.evolve({ intervalInput: value }),
    ClickedSaveInterval: ($) =>
      $.emit(
        change({
          ...$.props.settings,
          refetchInterval: Math.max(1000, parseIntervalSeconds($.model.intervalInput) * 1000),
        }),
      ),
    ClickedResetInterval: ($) =>
      $.evolve({ intervalInput: String(DEFAULT_REFETCH_INTERVAL / 1000) }).emit(
        change({ ...$.props.settings, refetchInterval: DEFAULT_REFETCH_INTERVAL }),
      ),
    ToggledCommunicationEmojis: ($, { checked }) =>
      $.emit(change({ ...$.props.settings, communicationEmojis: checked })),
  },
  view: (h, model) => {
    const { settings } = h.props;
    return Dialog(h, {
      props: { open: model.open },
      onEmit: {
        RequestedOpen: () => SettingsSheetMessage.RequestedOpenSettings(),
        RequestedClose: () => SettingsSheetMessage.RequestedCloseSettings(),
        Settled: () => undefined,
      },
      view: (dialog) =>
        h.div(
          dialog
            .trigger(
              h.button
                .attrs({ type: "button", "aria-label": "Settings" })
                .class(buttonClass({ variant: "outline" })),
            )
            .children(Icon(h, SettingsIcon)),
          dialog.portal(h.dialog)?.children(
            dialog.backdrop(
              h.div.class(
                "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
              ),
            ),
            dialog
              .popup(
                h.div.class(
                  "bg-background fixed inset-y-0 right-0 z-50 flex h-full w-3/4 flex-col gap-4 overflow-y-auto border-l shadow-lg transition-transform duration-300 ease-in-out sm:max-w-sm data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
                ),
              )
              .children(
                h.div
                  .class("flex flex-col gap-1.5 p-4")
                  .children(
                    dialog.title(h.h2.class("text-foreground font-semibold")).children("Settings"),
                    dialog
                      .description(h.p.class("text-muted-foreground text-sm"))
                      .children("Manage your settings and preferences."),
                  ),
                h.div.class("flex flex-col gap-6 p-4").children(
                  AppearanceSettings(h, model),
                  Credentials(h, {
                    key: `${settings.publicKey ?? ""}:${settings.ffscouterKey ?? ""}`,
                    props: {
                      initialTornKey: settings.publicKey,
                      initialFFScouterKey: settings.ffscouterKey,
                      isTornKeyValid: settings.isTornKeyValid,
                      isFFScouterKeyValid: settings.isFFScouterKeyValid,
                      card: false,
                      showErrors: false,
                    },
                    onEmit: {
                      RequestedCredentials: ({ publicKey, ffscouterKey }) =>
                        SettingsSheetMessage.RequestedCredentials({ publicKey, ffscouterKey }),
                    },
                  }),
                  h.div.class("flex flex-col gap-2").children(
                    Label(h).children("Enemy Faction ID"),
                    SaveResetGroup(h, {
                      placeholder: "1234567890",
                      value: model.enemyFactionInput,
                      onInput: (value) => SettingsSheetMessage.UpdatedEnemyFactionInput({ value }),
                      onSave: SettingsSheetMessage.ClickedSaveEnemyFaction(),
                      onReset: SettingsSheetMessage.ClickedResetEnemyFaction(),
                    }),
                  ),
                  h.div.class("flex flex-col gap-2").children(
                    Label(h).children("Refresh Interval (seconds)"),
                    SaveResetGroup(h, {
                      placeholder: "10",
                      min: "1",
                      value: model.intervalInput,
                      onInput: (value) => SettingsSheetMessage.UpdatedIntervalInput({ value }),
                      onSave: SettingsSheetMessage.ClickedSaveInterval(),
                      onReset: SettingsSheetMessage.ClickedResetInterval(),
                    }),
                    h.p
                      .class("text-sm text-muted-foreground")
                      .children(
                        `Current: ${settings.refetchInterval / 1000}s (${settings.refetchInterval}ms)`,
                      ),
                  ),
                  h.div.class("flex items-start gap-3").children(
                    Checkbox(h, {
                      props: { checked: settings.communicationEmojis },
                      onEmit: {
                        Toggled: ({ checked }) =>
                          SettingsSheetMessage.ToggledCommunicationEmojis({ checked }),
                      },
                      view: (checkbox) =>
                        checkbox
                          .root(h.button.id("communication-emojis").class(CHECKBOX_CLASS))
                          .children(
                            checkbox
                              .indicator(h.span.class("grid place-content-center text-current"))
                              .children(
                                settings.communicationEmojis &&
                                  Icon(h, Check, { class: "size-3.5" }),
                              ),
                          ),
                    }),
                    h.div
                      .class("flex flex-col gap-1")
                      .children(
                        Label(h, { for: "communication-emojis" }).children(
                          "Emojis in communications",
                        ),
                        h.p
                          .class("text-sm text-muted-foreground")
                          .children("Start copied chat messages with an emoji, like 🆘 or 🎯."),
                      ),
                  ),
                ),
                dialog
                  .close(
                    h.button.class(
                      "ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden",
                    ),
                  )
                  .children(Icon(h, X), h.span.class("sr-only").children("Close")),
              ),
          ),
        ),
    });
  },
});

export const CHECKBOX_CLASS =
  "peer border-input dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
