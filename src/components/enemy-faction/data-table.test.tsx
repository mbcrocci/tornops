// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DataTable, PINNED_GROUP, type RowGrouping } from "./data-table";

afterEach(cleanup);

type Member = { name: string; status: string; ff: number };
const data: Member[] = [
  { name: "Alpha", status: "Hospital", ff: 2 },
  { name: "Bravo", status: "Okay", ff: 4 },
  { name: "Charlie", status: "Hospital", ff: 1 },
  { name: "Delta", status: "Okay", ff: 3 },
];
const columns: ColumnDef<Member>[] = [
  ...["name", "ff"].map((key) => ({
    accessorKey: key,
    header: ({ column }: { column: import("@tanstack/react-table").Column<Member> }) => (
      <button onClick={() => column.toggleSorting()}>{key}</button>
    ),
  })),
  {
    id: "pin",
    cell: ({ row }) => (
      <button onClick={() => row.toggleSelected()}>Pin {row.original.name}</button>
    ),
  },
];
const grouping: RowGrouping<Member> = {
  groupOrder: ["Okay", "Hospital"],
  getGroup: (member) => member.status,
  renderHeader: (group, rows) => `${group} (${rows.length})`,
};
const rows = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
const memberRow = (name: string, ff: number) => `${name}${ff}Pin ${name}`;

describe("DataTable grouping", () => {
  it("groups when enabled after a name sort and restores the sort when disabled", () => {
    const props = { columns, data, initialSorting: [{ id: "name", desc: false }] };
    const { rerender } = render(<DataTable {...props} />);
    expect(rows()).toEqual(data.map((member) => memberRow(member.name, member.ff)));
    rerender(<DataTable {...props} grouping={grouping} />);
    expect(rows()).toEqual([
      "Okay (2)",
      memberRow("Bravo", 4),
      memberRow("Delta", 3),
      "Hospital (2)",
      memberRow("Alpha", 2),
      memberRow("Charlie", 1),
    ]);
    rerender(<DataTable {...props} />);
    expect(rows()).toEqual(data.map((member) => memberRow(member.name, member.ff)));
  });

  it("keeps sections together when changing sort columns and directions, with pins first", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        grouping={grouping}
        initialSorting={[{ id: "name", desc: false }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ff" }));
    expect(rows()).toEqual([
      "Okay (2)",
      memberRow("Bravo", 4),
      memberRow("Delta", 3),
      "Hospital (2)",
      memberRow("Alpha", 2),
      memberRow("Charlie", 1),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "ff" }));
    expect(rows()).toEqual([
      "Okay (2)",
      memberRow("Delta", 3),
      memberRow("Bravo", 4),
      "Hospital (2)",
      memberRow("Charlie", 1),
      memberRow("Alpha", 2),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Pin Alpha" }));
    expect(rows()).toEqual([
      `${PINNED_GROUP} (1)`,
      memberRow("Alpha", 2),
      "Okay (2)",
      memberRow("Delta", 3),
      memberRow("Bravo", 4),
      "Hospital (1)",
      memberRow("Charlie", 1),
    ]);
  });
});
