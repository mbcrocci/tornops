import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  /** Right-align for numeric columns. */
  align?: "start" | "end";
  /** Explains the column on hover. */
  hint?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = "start",
  hint,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn("text-muted-foreground", className)}>{title}</div>;
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "group/sort data-[state=open]:bg-accent h-7 gap-1 px-2 text-xs font-medium [&_svg:not([class*='size-'])]:size-3",
              column.getIsSorted() ? "text-foreground" : "text-muted-foreground",
              // Numeric headers keep their label flush with the right-aligned values.
              align === "end" ? "-mr-2.5 flex-row-reverse" : "-ml-2",
            )}
            title={hint}
          >
            <span>{title}</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDown />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUp />
            ) : (
              // Only the active sort shows an arrow; the others reveal theirs on hover or focus.
              <ChevronsUpDown className="opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown />
            Desc
          </DropdownMenuItem>
          {/* <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff />
            Hide
          </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
