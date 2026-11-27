import type { Html } from "@effect/ui/html";
import { cn } from "@/lib/utils";

// View functions with the look of the shadcn/ui primitives the app was designed with.
// Each takes extra classes as `class`, merged with tailwind-merge, because a builder's own
// `.class` replaces what it had.

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive:
    "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  link: "text-primary underline-offset-4 hover:underline",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
  lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
  icon: "size-9",
  "icon-sm": "size-8",
  "icon-lg": "size-10",
};

export interface ButtonOptions {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly class?: string | false | undefined;
}

export const buttonClass = (options: ButtonOptions = {}) =>
  cn(
    BUTTON_BASE,
    BUTTON_VARIANTS[options.variant ?? "default"],
    BUTTON_SIZES[options.size ?? "default"],
    options.class,
  );

/** A `type="button"` button; chain `.attr("type", "submit")` for a form's submit. */
export const Button = <M>(h: Html.H<M>, options: ButtonOptions = {}) =>
  h.button.attr("type", "button").attr("data-slot", "button").class(buttonClass(options));

/** A link drawn as a button. */
export const ButtonLink = <M>(h: Html.H<M>, href: string, options: ButtonOptions = {}) =>
  h.a.attr("href", href).attr("data-slot", "button").class(buttonClass(options));

/** Opens in a new tab, for links to Torn. */
export const ExternalLink = <M>(h: Html.H<M>, href: string, className?: string) =>
  h.a.attrs({ href, target: "_blank", rel: "noopener noreferrer" }).class(className);

type ClassArg = { readonly class?: string | false | undefined };

export const Card = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card")
    .class(
      cn(
        "bg-card text-card-foreground flex flex-col gap-3 rounded-xl border py-3 shadow-sm",
        options.class,
      ),
    );

export const CardHeader = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card-header")
    .class(
      cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-3",
        options.class,
      ),
    );

export const CardTitle = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card-title")
    .class(cn("leading-none font-semibold text-sm", options.class));

export const CardDescription = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card-description")
    .class(cn("text-muted-foreground text-sm", options.class));

export const CardAction = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card-action")
    .class(cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", options.class));

export const CardContent = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div.attr("data-slot", "card-content").class(cn("px-4", options.class));

export const CardFooter = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "card-footer")
    .class(cn("flex items-center px-4 [.border-t]:pt-3", options.class));

export const INPUT_CLASS = cn(
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
);

export const inputClass = (className?: string | false) => cn(INPUT_CLASS, className);

export const TEXTAREA_CLASS =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export const InputGroup = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attrs({ "data-slot": "input-group", role: "group" })
    .class(
      cn(
        "group/input-group border-input dark:bg-input/30 relative flex w-full items-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
        "h-9 min-w-0 has-[>textarea]:h-auto",
        "has-[>[data-align=inline-start]]:[&>input]:pl-2",
        "has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]",
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
        options.class,
      ),
    );

export const INPUT_GROUP_INPUT_CLASS = cn(
  INPUT_CLASS,
  "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
);

export const InputGroupAddon = <M>(
  h: Html.H<M>,
  options: ClassArg & { readonly align?: "inline-start" | "inline-end" } = {},
) => {
  const align = options.align ?? "inline-start";
  return h.div
    .attrs({ role: "group", "data-slot": "input-group-addon", "data-align": align })
    .class(
      cn(
        "text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 group-data-[disabled=true]/input-group:opacity-50",
        align === "inline-start"
          ? "order-first pl-3 has-[>button]:ml-[-0.45rem]"
          : "order-last pr-3 has-[>button]:mr-[-0.45rem]",
        options.class,
      ),
    );
};

export const InputGroupButton = <M>(
  h: Html.H<M>,
  options: ButtonOptions & { readonly groupSize?: "xs" | "sm" | "icon-xs" | "icon-sm" } = {},
) =>
  Button(h, {
    variant: options.variant ?? "ghost",
    class: cn(
      "text-sm shadow-none flex gap-2 items-center",
      {
        xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
        sm: "h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5",
        "icon-xs": "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
      }[options.groupSize ?? "xs"],
      options.class,
    ),
  });

export const LABEL_CLASS =
  "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export const Label = <M>(h: Html.H<M>, options: ClassArg & { readonly for?: string } = {}) =>
  h.label.attrs({ "data-slot": "label", for: options.for }).class(cn(LABEL_CLASS, options.class));

export const Empty = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "empty")
    .class(
      cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        options.class,
      ),
    );

export const EmptyHeader = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "empty-header")
    .class(cn("flex max-w-sm flex-col items-center gap-2 text-center", options.class));

export const EmptyMedia = <M>(h: Html.H<M>, options: ClassArg & { readonly icon?: boolean } = {}) =>
  h.div
    .attr("data-slot", "empty-icon")
    .class(
      cn(
        "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        options.icon
          ? "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6"
          : "bg-transparent",
        options.class,
      ),
    );

export const EmptyTitle = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "empty-title")
    .class(cn("text-lg font-medium tracking-tight", options.class));

export const EmptyDescription = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "empty-description")
    .class(
      cn(
        "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
        options.class,
      ),
    );

export const EmptyContent = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.div
    .attr("data-slot", "empty-content")
    .class(
      cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        options.class,
      ),
    );

/** The scrolling container and the table, as one builder: children go in the table. */
export const Table = <M>(h: Html.H<M>, options: ClassArg & { readonly container?: string } = {}) =>
  h.table
    .attr("data-slot", "table")
    .class(cn("w-full caption-bottom text-sm", options.class))
    .forward((table) =>
      h.div
        .attr("data-slot", "table-container")
        .class(cn("relative w-full overflow-x-auto", options.container))
        .children(table),
    );

export const TableHeader = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.thead.attr("data-slot", "table-header").class(cn("[&_tr]:border-b", options.class));

export const TableBody = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.tbody.attr("data-slot", "table-body").class(cn("[&_tr:last-child]:border-0", options.class));

export const TABLE_ROW_CLASS =
  "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors";

export const TableRow = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.tr.attr("data-slot", "table-row").class(cn(TABLE_ROW_CLASS, options.class));

export const TABLE_HEAD_CLASS =
  "text-foreground h-8 px-2 text-left align-middle font-medium whitespace-nowrap text-xs";

export const TableHead = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.th.attr("data-slot", "table-head").class(cn(TABLE_HEAD_CLASS, options.class));

export const TABLE_CELL_CLASS = "p-1.5 align-middle whitespace-nowrap text-xs";

export const TableCell = <M>(h: Html.H<M>, options: ClassArg = {}) =>
  h.td.attr("data-slot", "table-cell").class(cn(TABLE_CELL_CLASS, options.class));

export const Spinner = <M>(h: Html.H<M>, className?: string) =>
  h.span
    .attrs({ role: "status", "aria-label": "Loading" })
    .class(
      cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      ),
    );
