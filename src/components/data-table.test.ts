import { describe, expect, it } from "vite-plus/test";
import { type Column, orderRows, PINNED_GROUP, type RowGrouping, sortRows } from "./data-table";

type Member = { name: string; status: string; ff: number };
const data: Member[] = [
  { name: "Alpha", status: "Hospital", ff: 2 },
  { name: "Bravo", status: "Okay", ff: 4 },
  { name: "Charlie", status: "Hospital", ff: 1 },
  { name: "Delta", status: "Okay", ff: 3 },
];
const columns: Column<Member, never>[] = [
  {
    id: "name",
    header: "name",
    compare: (a, b) => a.name.localeCompare(b.name),
    cell: (h) => h.span,
  },
  { id: "ff", header: "ff", compare: (a, b) => a.ff - b.ff, cell: (h) => h.span },
];
const grouping: RowGrouping<Member, never> = {
  groupOrder: ["Okay", "Hospital"],
  groupOf: (member) => member.status,
  header: (h) => h.span,
};
const order = (
  sort: { id: string; desc: boolean } | undefined,
  options: { grouped?: boolean; pinned?: string[] } = {},
) =>
  orderRows(
    sortRows(data, columns, sort),
    (member) => options.pinned?.includes(member.name) ?? false,
    options.grouped ? grouping : undefined,
  ).map(({ row, group }) => `${group}:${row.name}`);

describe("DataTable ordering", () => {
  it("groups in the fixed section order, keeping the sort inside each section", () => {
    expect(order({ id: "name", desc: false })).toEqual([":Alpha", ":Bravo", ":Charlie", ":Delta"]);
    expect(order({ id: "name", desc: false }, { grouped: true })).toEqual([
      "Okay:Bravo",
      "Okay:Delta",
      "Hospital:Alpha",
      "Hospital:Charlie",
    ]);
  });

  it("keeps sections together when the sort changes, with pins first", () => {
    expect(order({ id: "ff", desc: false }, { grouped: true })).toEqual([
      "Okay:Delta",
      "Okay:Bravo",
      "Hospital:Charlie",
      "Hospital:Alpha",
    ]);
    expect(order({ id: "ff", desc: true }, { grouped: true, pinned: ["Alpha"] })).toEqual([
      `${PINNED_GROUP}:Alpha`,
      "Okay:Bravo",
      "Okay:Delta",
      "Hospital:Charlie",
    ]);
    expect(order({ id: "ff", desc: true }, { pinned: ["Charlie"] })).toEqual([
      `${PINNED_GROUP}:Charlie`,
      ":Bravo",
      ":Delta",
      ":Alpha",
    ]);
  });
});
