"use client";

import { useActionState, useState } from "react";
import { uploadImportFile } from "@/lib/actions/imports";
import type { ActionState } from "@/lib/actions/shared";

export function UploadForm({
  organizations,
  defaultOrganizationId,
}: {
  organizations: { id: string; name: string }[];
  defaultOrganizationId?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    uploadImportFile,
    {}
  );
  const [source, setSource] = useState("setmore");
  const duplicateWarning = state.data?.duplicateFileWarning === "true";
  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";

  return (
    <form action={action} className="max-w-xl space-y-4">
      {state.error && (
        <p role="alert" className={`rounded-[--radius-control] px-3 py-2 text-sm ${
          duplicateWarning ? "bg-warning-soft text-warning" : "bg-negative-soft text-negative"
        }`}>
          {state.error}
        </p>
      )}
      {duplicateWarning && (
        <label className="flex items-center gap-2 rounded-[--radius-control] border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <input type="checkbox" name="confirmDuplicateFile" value="true" className="h-4 w-4" />
          I understand this exact file was uploaded before — upload again anyway.
        </label>
      )}
      <div>
        <label htmlFor="upload-org" className="mb-1 block text-sm font-medium text-ink">Organization</label>
        <select id="upload-org" name="organizationId" defaultValue={defaultOrganizationId} className={inputClass}>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="upload-source" className="mb-1 block text-sm font-medium text-ink">Source system</label>
        <select id="upload-source" name="source" value={source}
          onChange={(e) => setSource(e.target.value)} className={inputClass}>
          <option value="setmore">Setmore (report export)</option>
          <option value="acuity">Acuity (via column mapping — no dedicated adapter yet)</option>
          <option value="manual_csv">Manual CSV (column mapping)</option>
        </select>
        {source === "acuity" && (
          <p className="mt-1 text-xs text-warning">
            No Acuity sample has been provided, so there is no dedicated Acuity
            adapter. The file will go through the column-mapping workflow.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="upload-file" className="mb-1 block text-sm font-medium text-ink">
          Setmore export <span className="font-normal text-ink-muted">(.xlsx or .csv · max 10 MB, 10,000 rows)</span>
        </label>
        <input id="upload-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
          className="block w-full text-sm text-ink file:mr-3 file:h-10 file:rounded-[--radius-control] file:border-0 file:bg-surface-sunken file:px-4 file:text-sm file:font-medium file:text-ink hover:file:bg-border" />
        <p className="mt-1 text-xs text-ink-muted">
          Upload the file exactly as Setmore downloaded it — no conversion
          needed. The original is preserved unmodified as evidence.
        </p>
      </div>
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Uploading & parsing…" : "Upload & inspect"}
      </button>
    </form>
  );
}
