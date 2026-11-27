import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";
import type { IconNode } from "lucide";
import { cn } from "@/lib/utils";

/**
 * Draws a lucide icon. Decorative unless `label` is given, in which case it is read as an
 * image with that name.
 */
export const Icon = <M>(
  h: Html.H<M>,
  icon: IconNode,
  options: { readonly class?: string; readonly label?: string } = {},
): View.Content<M, never> =>
  h.svg
    .attrs({
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": options.label === undefined ? "true" : undefined,
      role: options.label === undefined ? undefined : "img",
      "aria-label": options.label,
    })
    .class(cn("lucide size-4 shrink-0", options.class))
    .children(
      ...icon.map(([tag, attrs]) =>
        h
          .el(tag)
          .attrs(
            Object.fromEntries(
              Object.entries(attrs).map(([name, value]) => [
                name,
                value == null ? undefined : String(value),
              ]),
            ),
          ),
      ),
    );
