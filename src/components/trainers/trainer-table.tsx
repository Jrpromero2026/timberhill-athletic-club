"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { StatusBadge } from "@/components/ui/status-badge";

export interface TrainerListRow {
  id: string;
  displayName: string;
  email: string;
  employmentStatus: string;
  status: string;
  organizations: string[];
  departments: string[];
  hireDate: string | null;
}

const columnHelper = createColumnHelper<TrainerListRow>();

export function TrainerTable({ rows }: { rows: TrainerListRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "displayName", desc: false },
  ]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [orgFilter, setOrgFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const allOrgs = useMemo(
    () => [...new Set(rows.flatMap((r) => r.organizations))].sort(),
    [rows]
  );
  const allDepts = useMemo(
    () => [...new Set(rows.flatMap((r) => r.departments))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (orgFilter !== "all" && !row.organizations.includes(orgFilter)) return false;
      if (deptFilter !== "all" && !row.departments.includes(deptFilter)) return false;
      if (query) {
        const haystack = `${row.displayName} ${row.email}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, orgFilter, deptFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("displayName", {
        header: "Trainer",
        cell: (info) => (
          <Link
            href={`/performance-operations/trainers/${info.row.original.id}`}
            className="font-medium text-ink hover:text-accent"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: (info) => (
          <span className="text-ink-secondary">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor((row) => row.organizations.join(", "), {
        id: "organizations",
        header: "Organizations",
        cell: (info) => (
          <span className="text-ink-secondary">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor((row) => row.departments.join(", "), {
        id: "departments",
        header: "Departments",
        cell: (info) => (
          <span className="text-ink-secondary">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("hireDate", {
        header: "Hired",
        cell: (info) => (
          <span className="font-mono text-xs text-ink-muted">
            {info.getValue() ?? "—"}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectClass =
    "h-9 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm text-ink shadow-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="trainer-search" className="sr-only">Search trainers</label>
        <input
          id="trainer-search"
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm"
        />
        <select aria-label="Status filter" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className={selectClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
        <select aria-label="Organization filter" value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)} className={selectClass}>
          <option value="all">All organizations</option>
          {allOrgs.map((org) => <option key={org} value={org}>{org}</option>)}
        </select>
        <select aria-label="Department filter" value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)} className={selectClass}>
          <option value="all">All departments</option>
          {allDepts.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
        </select>
        <span className="ml-auto text-xs text-ink-muted">
          {filtered.length} of {rows.length} trainers
        </span>
      </div>

      <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 uppercase hover:text-ink"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: "▲", desc: "▼" }[header.column.getIsSorted() as string] ?? ""}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ink-muted">
                  No trainers match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-ink disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 rounded-[--radius-control] border border-border px-3 text-xs font-medium text-ink disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
