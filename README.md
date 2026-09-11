# Timberhill Athletic Club

Everything Timberhill needs is built and maintained here. Each build-out lives
in its own directory, is deployed on its own, and shares this repository with
the others and nothing else.

| Path | What it is |
|---|---|
| `src/`, `supabase/`, `docs/`, `tests/`, `e2e/`, `scripts/` | **Performance Operations** — payroll, revenue, KPI and department analytics. Next.js + Supabase. Documented below. |
| `sites/personal-training-hub/` | **Personal training website** — the `/personal-training/` hub, trainers index, consultation page and trainer profile for timberhillac.com. Plain HTML/CSS/JS, no build step. See its own README. |

Nothing under `sites/` imports from the application, and the application never
reaches into `sites/`. The app's tooling is scoped to match: `vitest` collects
`tests/unit`, `playwright` collects `e2e`, `tsconfig` collects `**/*.ts`, and
`eslint.config.mjs` ignores `sites/**` explicitly.

**Adding a build-out:** give it its own top-level directory — or a folder under
`sites/` if it is a web property — keep it self-contained, and add a row to the
table above.

---

# Performance Operations

Internal payroll, revenue, KPI, and department analytics platform for gyms,
personal training departments, and sports-performance organizations.

**This application is fully independent.** It must never connect to, reference,
or deploy over any other application, Supabase project, or Vercel project —
including anything else in this repository.

Everything from here down documents it.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres,
Auth, RLS) · Zod · React Hook Form · TanStack Table · Recharts · Vitest ·
Playwright · npm

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app is connected to the dedicated
**performance-operations-dev** Supabase project via `.env.local` (never
committed). Access is invite-only; the initial platform-admin credentials
live in `.env.local` (`BOOTSTRAP_ADMIN_*` — change the password after first
sign-in via Forgot password).

Without Supabase configured, the app renders a setup-required screen. A
UI-only **offline preview** exists strictly for development and E2E: it
requires `NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true` *and* unset Supabase
variables — it can never activate alongside real environment values.

## Supabase setup (dedicated project required)

1. Create a **brand-new** Supabase project used only by Performance
   Operations. Do not reuse an existing project.
2. Copy the environment template and fill in the values from
   *Project Settings → API*:

   ```bash
   cp .env.example .env.local
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is server-only and optional; leave it unset
   unless running admin scripts. Never commit `.env.local`.
3. Install the Supabase CLI and link the project (or run locally):

   ```bash
   npx supabase link --project-ref <your-new-project-ref>
   npx supabase db push          # applies supabase/migrations
   ```

   For a fully local stack instead: `npx supabase start` then
   `npx supabase db reset` (applies migrations + `supabase/seed.sql`).
4. Apply seed data to a hosted project by running `supabase/seed.sql` in the
   SQL editor (idempotent; contains organizations, departments, roles, and
   permissions only — no financial data).
5. Regenerate database types after schema changes:

   ```bash
   npx supabase gen types typescript --local > src/lib/supabase/types.ts
   ```

Authentication flows (sign-in, invites) arrive in Phase 2; until a user is
signed in, the app stays in offline preview even with Supabase configured.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E — offline shell suite (:3100) then live suite (:3000), sequential because Next allows one dev server per directory |
| `npm run test:e2e:offline` / `:live` | Run one E2E suite |

## Documentation

Start with [docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md), then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DATA_MODEL_DRAFT.md](docs/DATA_MODEL_DRAFT.md),
[docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md),
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md),
[docs/INPUTS_REQUIRED.md](docs/INPUTS_REQUIRED.md),
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md),
[docs/CONFIGURATION_MODEL.md](docs/CONFIGURATION_MODEL.md),
[docs/COMPENSATION_MODEL.md](docs/COMPENSATION_MODEL.md),
[docs/PHASE_2_REPORT.md](docs/PHASE_2_REPORT.md),
[docs/IMPORT_ARCHITECTURE.md](docs/IMPORT_ARCHITECTURE.md),
[docs/SOURCE_ADAPTERS.md](docs/SOURCE_ADAPTERS.md),
[docs/APPOINTMENT_LEDGER.md](docs/APPOINTMENT_LEDGER.md),
[docs/IMPORT_SECURITY.md](docs/IMPORT_SECURITY.md),
[docs/PHASE_3_REPORT.md](docs/PHASE_3_REPORT.md), the Phase 4 payroll
docs (PAYROLL_*.md + [docs/PHASE_4_REPORT.md](docs/PHASE_4_REPORT.md)),
the Phase 5 intelligence docs
([docs/PERFORMANCE_INTELLIGENCE_ENGINE.md](docs/PERFORMANCE_INTELLIGENCE_ENGINE.md),
[docs/METRIC_CATALOG.md](docs/METRIC_CATALOG.md),
[docs/METRIC_DEFINITIONS.md](docs/METRIC_DEFINITIONS.md),
[docs/REPORTING_ARCHITECTURE.md](docs/REPORTING_ARCHITECTURE.md),
[docs/PHASE_5_REPORT.md](docs/PHASE_5_REPORT.md)), and the Phase 6
operations docs
([docs/EXECUTIVE_OPERATIONS_CENTER.md](docs/EXECUTIVE_OPERATIONS_CENTER.md),
[docs/DASHBOARD_ARCHITECTURE.md](docs/DASHBOARD_ARCHITECTURE.md),
[docs/WIDGET_SYSTEM.md](docs/WIDGET_SYSTEM.md),
[docs/NOTIFICATION_MODEL.md](docs/NOTIFICATION_MODEL.md),
[docs/SEARCH_ARCHITECTURE.md](docs/SEARCH_ARCHITECTURE.md),
[docs/COMMAND_PALETTE.md](docs/COMMAND_PALETTE.md),
[docs/PHASE_6_REPORT.md](docs/PHASE_6_REPORT.md)), and the Phase 7
period-close docs
([docs/PERIOD_CLOSE_ARCHITECTURE.md](docs/PERIOD_CLOSE_ARCHITECTURE.md),
[docs/PERIOD_CLOSE_STATE_MACHINE.md](docs/PERIOD_CLOSE_STATE_MACHINE.md),
[docs/PERIOD_CLOSE_READINESS.md](docs/PERIOD_CLOSE_READINESS.md),
[docs/CLOSE_MANIFEST.md](docs/CLOSE_MANIFEST.md),
[docs/REPORT_PACKAGE_ARCHITECTURE.md](docs/REPORT_PACKAGE_ARCHITECTURE.md),
[docs/EXPORT_MANIFEST.md](docs/EXPORT_MANIFEST.md),
[docs/ACCOUNTING_EXPORTS.md](docs/ACCOUNTING_EXPORTS.md),
[docs/SAVED_REPORT_VIEWS.md](docs/SAVED_REPORT_VIEWS.md),
[docs/SCHEDULED_REPORT_DEFINITIONS.md](docs/SCHEDULED_REPORT_DEFINITIONS.md),
[docs/POST_CLOSE_CHANGE_GUARDS.md](docs/POST_CLOSE_CHANGE_GUARDS.md),
[docs/PHASE_7_REPORT.md](docs/PHASE_7_REPORT.md)), and the Phase 8
integration docs
([docs/INTEGRATION_ARCHITECTURE.md](docs/INTEGRATION_ARCHITECTURE.md),
[docs/INTEGRATION_SECURITY.md](docs/INTEGRATION_SECURITY.md),
[docs/PROVIDER_ADAPTER_CONTRACT.md](docs/PROVIDER_ADAPTER_CONTRACT.md),
[docs/BACKGROUND_JOB_ARCHITECTURE.md](docs/BACKGROUND_JOB_ARCHITECTURE.md),
[docs/JOB_STATE_MACHINE.md](docs/JOB_STATE_MACHINE.md),
[docs/IDEMPOTENCY_AND_RETRIES.md](docs/IDEMPOTENCY_AND_RETRIES.md),
[docs/WEBHOOK_SECURITY.md](docs/WEBHOOK_SECURITY.md),
[docs/SCHEDULED_REPORT_EXECUTION.md](docs/SCHEDULED_REPORT_EXECUTION.md),
[docs/EMAIL_DELIVERY_ARCHITECTURE.md](docs/EMAIL_DELIVERY_ARCHITECTURE.md),
[docs/INTEGRATION_OBSERVABILITY.md](docs/INTEGRATION_OBSERVABILITY.md),
[docs/SETMORE_API_FINDINGS.md](docs/SETMORE_API_FINDINGS.md),
[docs/ACUITY_API_FINDINGS.md](docs/ACUITY_API_FINDINGS.md),
[docs/PHASE_8_REPORT.md](docs/PHASE_8_REPORT.md)), and the Phase 9
analytics docs
([docs/ANALYTICS_ARCHITECTURE.md](docs/ANALYTICS_ARCHITECTURE.md),
[docs/ANALYTICS_QUERY_SERVICE.md](docs/ANALYTICS_QUERY_SERVICE.md),
[docs/MULTI_PERIOD_COMPARISONS.md](docs/MULTI_PERIOD_COMPARISONS.md),
[docs/SCORECARD_ARCHITECTURE.md](docs/SCORECARD_ARCHITECTURE.md),
[docs/GOALS_AND_TARGETS.md](docs/GOALS_AND_TARGETS.md),
[docs/BENCHMARK_FRAMEWORK.md](docs/BENCHMARK_FRAMEWORK.md),
[docs/COHORT_ANALYSIS.md](docs/COHORT_ANALYSIS.md),
[docs/CUSTOM_DASHBOARDS.md](docs/CUSTOM_DASHBOARDS.md),
[docs/CHART_SYSTEM.md](docs/CHART_SYSTEM.md),
[docs/PRESENTATION_MODE.md](docs/PRESENTATION_MODE.md),
[docs/ANALYTICS_EXPORTS.md](docs/ANALYTICS_EXPORTS.md),
[docs/ANALYTICS_SECURITY.md](docs/ANALYTICS_SECURITY.md),
[docs/PHASE_9_REPORT.md](docs/PHASE_9_REPORT.md)). Observed source-export
schemas live in [docs/schemas/](docs/schemas/); real business exports stay
in gitignored `business-inputs/` and are never committed.

## Analytics (Phase 9)

`/analytics` is the business-intelligence layer over the intelligence
engine: executive analytics with deterministic analytical summaries,
six default scorecards, governed goals and evidence-backed benchmarks,
a closed-schema dashboard builder, first-visit client cohorts,
presentation mode (print/PDF via the browser), analytics report
packages + scheduled subscriptions, and forecast-ready historical
dataset exports. Every value is engine output with its health, version,
and FINAL / NOT FINAL label carried verbatim — the analytics layer
calculates presentation-only variances, never metrics.

## Operations Center (Phase 6)

`/overview` is the role-aware executive operations center; `Ctrl+K` opens
the permission-aware command palette and global search; the header bell
carries in-app notifications; `/reports` is the Report Center (quick
report, saved views, export history). Every number on every dashboard
comes from the Performance Intelligence Engine (Phase 5) — the UI
computes nothing.

## Integrations & automation (Phase 8)

`/configuration/integrations` manages provider connections (credentials
in Supabase Vault, never in tables or the browser); `/integrations` is
the automation operations dashboard (connection health, sync runs, job
queue, deliveries, deterministic alerts). Synced data ALWAYS flows
through the existing import review workflow — auto-approve/auto-post
are database-constrained off. Setmore and Acuity are BLOCKED pending
credentials/representative data (see the API findings docs); a
synthetic test provider verifies the framework. Scheduled reports now
execute through the background-job worker (`POST /api/worker`, gated by
`WORKER_SECRET` + a platform-admin session; no production scheduler is
enabled). Email delivery is provider-neutral with only a TEST channel —
no real email provider is configured or claimed.

## Period close (Phase 7)

`/period-close` runs the controlled end-of-period workflow: a structured
readiness checklist (consuming existing engines only), explicit review
and approval with separation of duties (self-approval fails closed
unless the organization's close policy allows it), an atomic close
transaction that freezes an immutable hashed manifest, versioned report
packages, and accounting CSV exports whose downloads are regenerated
and hash-verified. Closed periods block material operational changes at
the database level; reopening is an elevated, fully-audited action that
starts a new versioned close cycle. Saved report views support
organization sharing and defaults; scheduled reports exist as
definitions only (execution not yet enabled).

## Imports (Phase 3)

Upload Setmore report CSVs (save the .xlsx report as CSV first) or any
CSV via column mapping at `/imports/new`. Files stage through review and
approval before transactional posting to the canonical `/appointments`
ledger; posted history is immutable, corrections and reversals are
audited, and originals are preserved as evidence. Acuity has no dedicated
adapter yet (no sample export) — use the mapping workflow meanwhile.

## Security & financial integrity

- Deny-by-default authorization at three layers (UI, server, database RLS).
- Client-provided organization IDs are never trusted.
- Money is integer cents; rates are basis points; no floating-point money.
- Posted payroll will be immutable; every governed change is audit-logged.
- Never put secrets in code, docs, or logs.
