"use client";

import { useActionState } from "react";
import { saveSchemaMapping } from "@/lib/actions/imports";
import { CANONICAL_FIELDS } from "@/lib/imports/adapters/generic";
import type { ActionState } from "@/lib/actions/shared";

const FIELD_LABELS: Record<string, string> = {
  appointment_date: "Appointment date",
  start_time: "Start time",
  end_time: "End time",
  time_range: "Time range (start - end)",
  duration_minutes: "Duration (minutes)",
  trainer_name: "Trainer name",
  trainer_email: "Trainer email",
  client_name: "Client name",
  client_email: "Client email",
  client_phone: "Client phone",
  service_name: "Service name",
  status: "Status",
  listed_price: "Listed price",
  amount_paid: "Amount paid",
  external_appointment_id: "External appointment ID",
  external_client_id: "External client ID",
  notes: "Notes",
  location: "Location",
  ignore: "— Ignore column —",
};

export function MappingForm({
  batchId,
  headers,
  sampleRows,
  rawHeaders,
}: {
  batchId: string;
  headers: string[];
  sampleRows: string[][];
  rawHeaders: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveSchemaMapping,
    {}
  );

  const sampleFor = (header: string): string[] => {
    const index = rawHeaders.findIndex((h) => h.trim() === header);
    if (index === -1) return [];
    return sampleRows.map((row) => row[index] ?? "").filter((v) => v !== "").slice(0, 2);
  };

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <input type="hidden" name="batchId" value={batchId} />
      <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-medium">Source column</th>
              <th className="px-4 py-2 font-medium">Sample values</th>
              <th className="px-4 py-2 font-medium">Canonical field</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header) => (
              <tr key={header} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-ink">{header}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                  {sampleFor(header).join(" · ") || "—"}
                </td>
                <td className="px-4 py-2">
                  <label className="sr-only" htmlFor={`map-${header}`}>
                    Mapping for {header}
                  </label>
                  <select id={`map-${header}`} name={`map:${header}`} defaultValue=""
                    className="h-9 w-64 rounded-[--radius-control] border border-border bg-surface px-2.5 text-sm">
                    <option value="">(not mapped)</option>
                    {CANONICAL_FIELDS.map((field) => (
                      <option key={field} value={field}>{FIELD_LABELS[field] ?? field}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        Required: appointment date, trainer name, service name, and a time
        range (or start time plus end time/duration). Values are re-validated
        strictly server-side; nothing is silently coerced.
      </p>
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Saving & parsing…" : "Save mapping & parse file"}
      </button>
    </form>
  );
}
