import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  /** Paginates the table when set. */
  pageSize?: number;
  /** Called with the ids of the rows currently on screen, whenever they change. */
  onVisibleRowsChange?: (rowIds: string[]) => void;
  /** Extra classes for a row, e.g. to quiet rows that cannot be acted on. */
  getRowClassName?: (row: TData) => string | undefined;
  className?: string;
  /**
   * Splits the rows into labelled sections while the table is sorted by `columnId`.
   * Pinned rows always form their own leading section.
   */
  grouping?: RowGrouping<TData>;
}

export type RowGrouping<TData> = {
  columnId: string;
  getGroup: (row: TData) => string;
  renderHeader: (group: string, rows: TData[]) => ReactNode;
};

export const PINNED_GROUP = "pinned";

/** Column `meta.className` applies to both the header and the cells of that column. */
function columnClassName(meta: unknown): string | undefined {
  return typeof meta === "object" && meta !== null && "className" in meta
    ? String(meta.className)
    : undefined;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  initialSorting = [{ id: "status", desc: false }],
  pageSize,
  onVisibleRowsChange,
  getRowClassName,
  className,
  grouping,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? Number.MAX_SAFE_INTEGER,
  });

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: pageSize ? getPaginationRowModel() : undefined,
    // Polled data changes constantly; stay on the current page across refreshes.
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: {
      sorting,
      rowSelection,
      pagination,
    },
  });

  // Filtering can shrink the data below the current page.
  const pageCount = Math.max(1, table.getPageCount());
  useEffect(() => {
    if (pagination.pageIndex >= pageCount) {
      setPagination((current) => ({ ...current, pageIndex: pageCount - 1 }));
    }
  }, [pagination.pageIndex, pageCount]);

  // Get sorted rows and reorder so selected (pinned) rows appear first
  const sortedRows = table.getRowModel().rows;
  const selectedRows: typeof sortedRows = [];
  const unselectedRows: typeof sortedRows = [];

  sortedRows.forEach((row) => {
    if (row.getIsSelected()) {
      selectedRows.push(row);
    } else {
      unselectedRows.push(row);
    }
  });

  const orderedRows = [...selectedRows, ...unselectedRows];

  const isGrouped = Boolean(grouping && sorting[0]?.id === grouping.columnId);
  const groupOf = (row: (typeof orderedRows)[number]) =>
    row.getIsSelected() ? PINNED_GROUP : (grouping?.getGroup(row.original) ?? "");
  const groupRows = (group: string) =>
    orderedRows.filter((row) => groupOf(row) === group).map((row) => row.original);

  const visibleRowIds = orderedRows.map((row) => row.id).join(",");
  useEffect(() => {
    onVisibleRowsChange?.(visibleRowIds ? visibleRowIds.split(",") : []);
  }, [visibleRowIds, onVisibleRowsChange]);

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={columnClassName(header.column.columnDef.meta)}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {orderedRows?.length ? (
            orderedRows.map((row, index) => {
              const group = isGrouped ? groupOf(row) : undefined;
              const startsGroup =
                group !== undefined && (index === 0 || groupOf(orderedRows[index - 1]) !== group);
              return (
                <Fragment key={row.id}>
                  {startsGroup && grouping && (
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="pt-3 pb-2 text-[13px] font-semibold"
                      >
                        {grouping.renderHeader(group, groupRows(group))}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className={cn("group/row", getRowClassName?.(row.original))}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={columnClassName(cell.column.columnDef.meta)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pageSize && (
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Page {Math.min(pagination.pageIndex + 1, pageCount)} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
