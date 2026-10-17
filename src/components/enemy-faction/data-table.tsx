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
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  initialSorting = [{ id: "status", desc: false }],
  pageSize,
  onVisibleRowsChange,
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

  const visibleRowIds = orderedRows.map((row) => row.id).join(",");
  useEffect(() => {
    onVisibleRowsChange?.(visibleRowIds ? visibleRowIds.split(",") : []);
  }, [visibleRowIds, onVisibleRowsChange]);

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
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
            orderedRows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
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
