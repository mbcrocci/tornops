import type { View } from "@effect/ui";
import type { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide";
import { cn } from "@/lib/utils";
import { Icon } from "./ui/icon";
import {
  buttonClass,
  TABLE_CELL_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  Table,
  TableBody,
  TableHeader,
} from "./ui/primitives";

export const SortState = Schema.Struct({ id: Schema.String, desc: Schema.Boolean });
export type SortState = typeof SortState.Type;

export interface Column<T, M> {
  readonly id: string;
  /** A sortable column's label, or the header's content. */
  readonly header: string | ((h: Html.H<M>) => View.Content<M, never>);
  readonly hint?: string;
  /** Right-aligns the header for numeric columns. */
  readonly align?: "start" | "end";
  /** Ascending order. A column without one can't be sorted. */
  readonly compare?: (a: T, b: T) => number;
  /** Applies to the header and the cells of the column. */
  readonly className?: string;
  readonly cell: (h: Html.H<M>, row: T) => View.Content<M, never>;
}

export interface RowGrouping<T, M> {
  readonly groupOrder: ReadonlyArray<string>;
  readonly groupOf: (row: T) => string;
  readonly header: (h: Html.H<M>, group: string, rows: ReadonlyArray<T>) => View.Content<M, never>;
}

export const PINNED_GROUP = "pinned";

/** Sorts rows by the column, keeping rows a comparator calls equal in their input order. */
export const sortRows = <T, M>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<Column<T, M>>,
  sort: SortState | undefined,
): T[] => {
  const compare = columns.find((column) => column.id === sort?.id)?.compare;
  if (!sort || !compare) return [...rows];
  return [...rows].sort((a, b) => (sort.desc ? compare(b, a) : compare(a, b)));
};

/** Puts the pinned rows first, then, when grouped, the rest by group in the given order. */
export const orderRows = <T, M>(
  rows: ReadonlyArray<T>,
  isPinned: (row: T) => boolean,
  grouping: RowGrouping<T, M> | undefined,
): Array<{ row: T; group: string }> => {
  const groupOf = (row: T) => (isPinned(row) ? PINNED_GROUP : (grouping?.groupOf(row) ?? ""));
  const order = [PINNED_GROUP, ...(grouping?.groupOrder ?? [])];
  const buckets = new Map<string, T[]>(order.map((group) => [group, []]));
  for (const row of rows) {
    const group = groupOf(row);
    if (!grouping && group !== PINNED_GROUP) {
      buckets.set("", [...(buckets.get("") ?? []), row]);
      continue;
    }
    const bucket = buckets.get(group) ?? [];
    bucket.push(row);
    buckets.set(group, bucket);
  }
  return [...buckets.entries()].flatMap(([group, bucket]) => bucket.map((row) => ({ row, group })));
};

const SortHeader = <T, M>(
  h: Html.H<M>,
  column: Column<T, M> & { readonly header: string },
  sort: SortState | undefined,
  onSort: (sort: SortState) => M,
) => {
  const sorted = sort?.id === column.id ? (sort.desc ? "desc" : "asc") : undefined;
  // A click sorts ascending first, then flips the direction.
  const next: SortState = { id: column.id, desc: sorted === "asc" };
  return h.button
    .attrs({
      type: "button",
      title: column.hint,
      "aria-label": `Sort by ${column.header}${sorted === "asc" ? ", descending" : ""}`,
    })
    .class(
      buttonClass({
        variant: "ghost",
        size: "sm",
        class: cn(
          "group/sort h-7 gap-1 px-2 text-xs font-medium [&_svg:not([class*='size-'])]:size-3",
          sorted ? "text-foreground" : "text-muted-foreground",
          // Numeric headers keep their label flush with the right-aligned values.
          column.align === "end" ? "-mr-2.5 flex-row-reverse" : "-ml-2",
        ),
      }),
    )
    .on("click", onSort(next))
    .children(
      h.span.children(column.header),
      sorted === "desc"
        ? Icon(h, ArrowDown)
        : sorted === "asc"
          ? Icon(h, ArrowUp)
          : // Only the active sort shows an arrow; the others reveal theirs on hover or focus.
            Icon(h, ChevronsUpDown, {
              class:
                "opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100",
            }),
    );
};

export interface DataTableOptions<T, M> {
  readonly columns: ReadonlyArray<Column<T, M>>;
  readonly rows: ReadonlyArray<T>;
  readonly rowId: (row: T) => string;
  readonly sort?: SortState | undefined;
  readonly onSort: (sort: SortState) => M;
  /** Rows shown first, under their own heading when grouped. */
  readonly isPinned?: (row: T) => boolean;
  readonly rowClass?: ((row: T) => string | undefined) | undefined;
  readonly grouping?: RowGrouping<T, M> | undefined;
  readonly class?: string;
}

export const DataTable = <T, M>(h: Html.H<M>, options: DataTableOptions<T, M>) => {
  const { columns, sort } = options;
  const isPinned = options.isPinned ?? (() => false);
  const ordered = orderRows(sortRows(options.rows, columns, sort), isPinned, options.grouping);
  const groupRows = (group: string) =>
    ordered.filter((entry) => entry.group === group).map((entry) => entry.row);

  return h.div.class(cn("overflow-hidden rounded-md border", options.class)).children(
    Table(h).children(
      TableHeader(h).children(
        h.tr.class(TABLE_ROW_CLASS).children(
          columns.map((column) => {
            const sorted =
              sort?.id === column.id ? (sort.desc ? "descending" : "ascending") : undefined;
            return h.th
              .key(column.id)
              .attr("aria-sort", column.compare ? (sorted ?? "none") : undefined)
              .class(cn(TABLE_HEAD_CLASS, column.className))
              .children(
                typeof column.header === "string"
                  ? column.compare
                    ? h.div
                        .class("inline-flex items-center gap-2")
                        .children(
                          SortHeader(h, { ...column, header: column.header }, sort, options.onSort),
                        )
                    : h.div.class("text-muted-foreground").children(column.header)
                  : column.header(h),
              );
          }),
        ),
      ),
      TableBody(h).children(
        ordered.length
          ? ordered.flatMap(({ row, group }, index) => {
              const id = options.rowId(row);
              const startsGroup =
                options.grouping !== undefined &&
                (index === 0 || ordered[index - 1].group !== group);
              return [
                startsGroup
                  ? h.tr
                      .key(`group:${group}`)
                      .class(cn(TABLE_ROW_CLASS, "bg-muted/60 hover:bg-muted/60"))
                      .children(
                        h.td
                          .attr("colspan", String(columns.length))
                          .class(cn(TABLE_CELL_CLASS, "pt-3 pb-2 text-[13px] font-semibold"))
                          .children(options.grouping!.header(h, group, groupRows(group))),
                      )
                  : null,
                h.tr
                  .key(id)
                  .attr("data-state", isPinned(row) ? "selected" : undefined)
                  .class(cn(TABLE_ROW_CLASS, "group/row", options.rowClass?.(row)))
                  .children(
                    columns.map((column) =>
                      h.td
                        .key(column.id)
                        .class(cn(TABLE_CELL_CLASS, column.className))
                        .children(column.cell(h, row)),
                    ),
                  ),
              ];
            })
          : [
              h.tr
                .key("empty")
                .class(TABLE_ROW_CLASS)
                .children(
                  h.td
                    .attr("colspan", String(columns.length))
                    .class(cn(TABLE_CELL_CLASS, "h-24 text-center"))
                    .children("No results."),
                ),
            ],
      ),
    ),
  );
};
