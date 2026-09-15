# Timberhill PT Director — Phase F Read-Only Architecture Audit

Date: 2026-08-15 · Auditor: Phase F session · Scope: **audit and design only — nothing implemented**

---

## 1. EXECUTIVE VERDICT

**CONDITIONAL — ARCHITECTURALLY READY, OPERATIONALLY EMPTY.**

Timberhill PT runs on `performance-operations`, a mature multi-tenant operations
platform whose authorization architecture is **stronger than either system the
Shared Agent Core has been deployed into so far**: 6 roles, 99 permissions, 279
role→permission grants, 225 RLS policies across 71 tables, per-metric permission
gating inside a deterministic metric engine, and service-role usage confined to
integration/worker paths. A Director here would inherit better guardrails than
G3's, with less new security work.

The blocker is not architecture, it is **data**. The live pilot database contains
Timberhill as an organization with three departments — and **zero appointments,
zero clients, zero services, zero compensation plans, zero payroll runs, one
trainer record**. Both real appointment integrations (Setmore, Acuity) are
recorded in the database as **blocked, no credentials**. The compensation ladder
named in the phase brief is explicitly **unverified** by this repo's own
evidence review.

A Director built today would be a correct, secure agent with almost nothing to
read. **Build the ingest first; the agent is a small, well-understood increment
after that.**

## 2. SYSTEM / REPOSITORY MAP

| System | Purpose | Source of truth? | R/W | Production? | Owner |
| --- | --- | --- | --- | --- | --- |
| `performance-operations` (repo, Next.js App Router + Supabase) | The PT operations platform: orgs, trainers, clients, appointments, services, compensation, payroll, analytics, imports | **YES** for everything modelled | RW | Hosted internal pilot ("CONDITIONAL GO", 2026-07-31) | JR |
| Supabase `uavwqtbnkirvfvdilcwy` (*performance-operations-pilot*) | Live pilot database: 84 tables, RBAC seeded, Timberhill + G3 pilot orgs | **YES** (current live) | RW | Pilot | JR |
| Supabase `yoolmtleaezprjmfasku` | Referenced by the repo's local `.env.local` | **NO** — unreachable | — | **Dead/absent** (see P2-1) | JR |
| `business-inputs/` (gitignored, local) | Setmore exports + monthly PT Payroll Tracker PDFs — the *actual* historical Timberhill record | **YES, today**, for history | Read | Manual | JR |
| Setmore | Historical Timberhill scheduling source | Upstream | — | **Integration blocked** | Vendor |
| Acuity | Scheduling (G3 uses it; Timberhill historical) | Upstream | — | **Integration blocked** | Vendor |
| `g3-performance` (separate repo + Supabase `jmokddbayivmpctcwpyo`) | G3's own app and the shipped G3 Director | Separate | RW | Production | JR |
| `built-for-her` (separate repo + Supabase `olsneqvapdmpgacpjhrq`) | Vera | Separate | RW | Production | JR |

**Timberhill PT does not live in G3's codebase or database.** It is a distinct
application with a distinct database. Do not reuse G3 Director code; reuse the
*pattern* only.

## 3. AUTHENTICATION

Supabase Auth, cookie-bound. Two clients: `src/lib/supabase/server.ts` (server,
RLS as the signed-in user) and `client.ts` (browser, RLS). People exist once in
`profiles` and attach to organizations via `organization_memberships`
(role + effective dates) and to departments via `department_memberships`.

Canonical resolver: **`src/lib/authz/authz.ts`** —
`hasPermissionInOrganization`, `canAccessOrganization`, `canAccessDepartment`,
`isPlatformAdmin`, `canAccessAllWorkspaces`, with the role→permission map in
`permissions.ts` mirrored from the database (`roles`, `role_permissions`).
The documented rule is explicit: *"Never trust client-provided organization
IDs"* — the workspace cookie is a **request**, validated against server-loaded
memberships. An agent must call these helpers; it must not re-derive identity.

Present identities: platform admin, workspace admin, payroll manager,
department manager, trainer, viewer. Live pilot has **1 profile, 2 memberships**
— QA/test identities for a Director do not yet exist and must be created.

## 4. AUTHORIZATION

The strongest layer in the audit. Three enforcement tiers (UI convenience →
server helpers → RLS backstop), deny-by-default, 99 permissions on a
`resource:action` grammar.

| Question | Answer |
| --- | --- |
| Who sees all trainers | `trainer:read` — platform/workspace admin, payroll manager, department manager (department-scoped) |
| Who sees all clients | `client:read` |
| Trainers see only their own | Yes — `trainer:read_self`, `payroll:read_self`, and metrics carry `selfPermission`; RLS pins trainers to `app.current_trainer_id()` |
| Who views department revenue | `analytics:read` + department scope |
| Who views payroll | `payroll:read`; trainers get `payroll:read_self` only |
| Who views compensation rates | `compensation:read` (distinct from payroll) |
| Payroll access model | **ROLE + PERMISSION based** — *not* the named-grant model G3 required (G3 needed it because it had several owner accounts; here `payroll_manager` is a real, distinct role) |
| Department managers | Department-limited: organization membership alone is **not sufficient** |

**Per-metric gating is already implemented.** The intelligence engine attaches
`requiredPermission` / `selfPermission` / department scoping to individual
metrics, and the analytics doc states the property an agent needs most:
*"Composition never widens access."* This is precisely the Stage 25 segmentation
requirement — already built, and reusable by an agent for free.

## 5. TENANCY

**Model B — one organization inside a genuinely multi-org application.**

- Canonical tenant id: `organizations.id`. Timberhill = `cc0f5b54-3e44-4902-94cf-b25ea6446d3a` (`timberhill-athletic-club`, renamed from `timberhill-pilot` 15 Sep 2026).
- Every org-scoped table carries `organization_id` with FK + index; RLS restricts rows to organizations where the user holds an active membership.
- Timberhill and G3 **coexist in this database by design** (both pilot orgs) — isolation is by RLS + membership, verified by `tests/rls/` live checks.
- Built For Her is in a **separate Supabase project** and cannot mix.

Tenancy is deterministic and real. No invented tenancy required.

## 6. TRAINER MODEL

`trainers` (identity) + effective-dated assignment tables:
`trainer_organization_assignments`, `trainer_department_assignments`,
`trainer_compensation_assignments`, plus `trainer_source_aliases` for mapping
external scheduling identities.

One trainer can hold different roles, departments and compensation plans in
different organizations simultaneously — the assignment tables, not the trainer
row, are authoritative for "who works where, under what plan, when."

**Live state: 1 trainer, 1 organization assignment, 0 department assignments,
0 compensation assignments.** The Timberhill roster is not loaded.
`trainer_source_aliases` (0 rows) is the designed answer to duplicate identities
across Setmore/Acuity/payroll — the mechanism exists, unused.

## 7. CLIENT MODEL

`clients` + `client_organization_assignments` + `client_source_identifiers`.
**0 rows in all three.** The schema distinguishes client identity from
per-organization assignment (so one human can be a client of more than one
organization) and from external source identity.

Distinctions the phase brief asks about (member vs PT client vs consultation
lead vs former client) are **not yet expressed as data** — there is no seeded
status vocabulary for clients. This must be defined before an agent can answer
"which clients are inactive," and it should be defined as **data, not prose**.

**Sensitivity note:** a Director needs client *identity* (name) and *activity*
(dates, counts, revenue). It does not need contact details. Contact fields
should be excluded from tool outputs by construction.

## 8. TRAINER ↔ CLIENT RELATIONSHIP

Explicit assignment is **not** modelled today. There is no `client_trainer`
table. The available links are:

- `appointment_trainer_assignments` (0 rows) — trainer↔appointment, many-to-one supported
- `appointment_participants` (0 rows) — client↔appointment

So trainer↔client is **inferred from appointment history**, which answers the
brief's questions as follows: a client can have multiple trainers (multiple
appointments), there is **no stored primary trainer**, history persists as
appointments, and transfers are visible only as a change in who appears on later
appointments.

**This is the single most important authorization gap for a Director.** Trainer
self-scope for *clients* cannot be enforced from a stored assignment; it can only
be derived ("clients this trainer has appointments with"). That derivation must
be deterministic, written once, and tested — or trainer-scoped client tools must
be withheld from v1.

## 9. APPOINTMENT PIPELINE

Designed end-to-end, currently inert:

```
SOURCE (Setmore / Acuity / CSV)
  → integration_connections + integration_cursors      [0 rows]
  → integration_source_records (raw)                   [0 rows]
  → import_batches → import_rows → import_row_issues   [0 rows]
  → import_resolutions (human decisions)               [0 rows]
  → appointments (+ status history, corrections)       [0 rows]
  → appointment_trainer_assignments / participants     [0 rows]
  → reporting_periods → payroll_runs → analytics       [0 rows]
```

Supporting tables exist for idempotency and provenance: `appointment_source_links`,
`source_status_mappings`, `import_schema_profiles`, `integration_sync_runs`,
`integration_failures`, `background_jobs` + `background_job_attempts`.

The architecture is right. **Nothing has flowed through it.**

## 10. APPOINTMENT CLASSIFICATION

Canonical taxonomy is **per-organization data**, not hardcoded — `service_categories`
(11 seeded for Timberhill: Personal Training, PACK Training, Nutrition Coaching,
Athlete/Adult/Tactical/Team Performance, Volleyball, Performance Evaluation,
Administrative, Other) with `services`, `service_department_assignments`, and
`service_source_aliases` for mapping vendor names.

**`services` has 0 rows.** So categories exist but no actual service catalogue
does. Classification is designed to be **deterministic via stored aliases**
(alias → service → category → department), with `service_alias_coverage_bp` as a
metric measuring how much of the data is actually mapped — a genuinely good
signal for an agent to disclose.

The service names in the phase brief (Private Training, Premier Coaching,
Timberhill Rookies, Performance Lab, PACK…) are **not present in production
configuration** and must not be hardcoded.

## 11. STATUS HANDLING

Eight canonical statuses seeded: `scheduled`, `completed`, `cancelled`,
`late_cancelled`, `no_show`, `rescheduled`, `deleted`, `unknown`, with
`source_status_mappings` translating vendor vocabularies and
`appointment_status_history` retaining transitions.

**Gap:** the `appointment_status_definitions` table carries only
`key, label, sort_order` — there are **no columns declaring which statuses count
toward revenue, payroll, utilization, or client counts**. That policy currently
lives inside metric evaluators (`appointments_completed`, `revenue_eligible_cents`,
`cancellation_rate_bp`, …) rather than in configuration. For an agent this is
acceptable *because the evaluators are deterministic and single-sourced* — but
the Director must always report which basis a number uses, and must never mix
cancelled into production counts.

## 12. REVENUE ENGINE

Deterministic, in `src/lib/intelligence/revenue/`, and notably it distinguishes
three different revenue meanings — a distinction most implementations get wrong:

- `revenue_listed_cents` — listed/booked value
- `revenue_eligible_cents` — what qualifies under status rules
- `revenue_recognized_cents` — recognized
- `revenue_paid_cents` — collected

Plus `revenue_per_session/hour/client`, `average_session_value_cents`, growth in
basis points. The Timberhill evidence doc records that historically *"Gross
Revenue equals Total Value of Sessions (listed value, not collected cash)"* —
so the Director must state **which** revenue metric it is quoting. Quoting
"revenue" unqualified would be a defect.

## 13. COMMISSION ENGINE

`compensation_plans` → `compensation_plan_versions` → `compensation_rules` +
`commission_tiers`, assigned to trainers by effective date via
`trainer_compensation_assignments`. Engine code: `src/lib/compensation/tiers.ts`,
`src/lib/payroll/{engine,evaluators,eligibility,rounding}.ts`.

**All four configuration tables are empty.** No Timberhill plan exists.

**The ladder in the phase brief (50 / 55 @ $3,000 / 60 @ $4,500 / 65 @ $5,500 /
70 @ $7,000) is NOT verified.** This repo's own evidence review
(`docs/business-rules/timberhill-payroll-observed.md`) inspected twelve monthly
payroll trackers and concluded the per-trainer derivation was **not in the
exports** — cliff-vs-marginal is recorded as an OPEN question, and *"nothing in
the summary proves tiers exist or not."* What **is** confirmed: monthly periods,
per-trainer monthly totals, flat payouts for free sessions and consultations
(amounts unconfirmed), department analytics with 12% overhead and a department
commission line (2% in 2024–25, 5% in Feb 2026), and a flat $500/month salary line.

Note the divergence from G3: **Timberhill pays monthly; G3 pays bi-weekly.**

## 14. PAYROLL

Full lifecycle modelled: `payroll_runs`, `payroll_calculation_lines`,
`payroll_trainer_summaries`, `payroll_snapshots`, `payroll_adjustments`,
`payroll_issues`, `payroll_run_events`, `payroll_exports`, plus a period-close
domain (`period_close_runs`, `period_close_manifests`, `period_close_events`,
`period_close_acknowledgements`, `close_exports`, `organization_close_policies`)
and post-close change guards.

Permissions separate the verbs properly: `payroll:read | read_self | calculate |
approve | export | adjust | reopen`. **0 payroll runs exist.**

For v1 the Director should read **`payroll:read` summaries only**, and
`payroll:read_self` for trainers. No payroll writes, no approval, no reopen.

## 15. CONSULTATIONS

**Not a first-class model.** There is no consultations table. A consultation is
representable as a service within a category, and the historical trackers show
consultations carrying a small flat payout — but conversion state, conversion
date, and follow-up are **not modelled anywhere**.

Therefore "consultation conversion" would have to be **inferred** (first paid
appointment by the same client after a consultation, within some window). That
inference is a business definition, not a fact. It must be defined by the owner,
implemented deterministically, and labelled as derived — or excluded from v1.
The Director must never invent a conversion rate.

## 16. RETENTION / INACTIVITY

Implemented deterministically as metrics: `active_clients`, `inactive_clients`,
`client_retention_rate_bp`, `new_clients`, `returning_clients`,
`repeat_client_count`, `client_first_visit`, `client_last_visit`,
`client_growth_bp`.

Because `inactive_clients` is a catalogued metric with one evaluator, the
"at-risk" definition is already code, not model judgment — exactly the property
the brief demands. **Action required:** confirm the inactivity threshold the
evaluator uses and make it configurable per organization; the Director must
state the threshold whenever it reports inactivity ("no session in N days").

## 17. UTILIZATION

Two distinct implemented metrics — `capacity_utilization_bp` and
`schedule_utilization_bp` — plus `scheduled_minutes`, `completed_minutes`,
`coaching_minutes`, `average/median_session_duration_minutes`.

Two utilization numbers means the Director must **name which one** it reports.
The denominators must be read from the evaluators, not assumed; no target value
should be presumed.

## 18. TRAINER KPI ENGINE

| Metric | Status |
| --- | --- |
| Gross revenue (listed/eligible/recognized/paid) | **IMPLEMENTED** |
| Completed / cancelled / late-cancelled / no-show / rescheduled counts | **IMPLEMENTED** |
| Cancellation rate, no-show rate, completed rate (bp) | **IMPLEMENTED** |
| Revenue per session / hour / client | **IMPLEMENTED** |
| Active clients, new clients, returning, retention | **IMPLEMENTED** |
| Average client spend, average session value | **IMPLEMENTED** |
| Payroll gross, per session, per hour, % of revenue, variance, adjustments | **IMPLEMENTED** |
| Utilization (capacity + schedule) | **IMPLEMENTED** |
| Session/revenue/payroll/client growth (bp) | **IMPLEMENTED** |
| Consultation count / conversion | **NOT IMPLEMENTED** (no consultation model) |
| Projected month-end revenue | **DERIVABLE** (pace × remaining days; must be labelled a projection) |
| Commission-tier proximity | **DERIVABLE** once plans exist; **NOT IMPLEMENTED** today |
| Effective hourly rate | **DERIVABLE** (`revenue_per_hour_cents` / `payroll_per_hour_cents`) |
| Facility contribution / net | **DERIVABLE** (revenue − payroll); overhead % is a business input, not modelled |

## 19. DEPARTMENT KPI ENGINE

Implemented: `active_trainers`, `active_departments`, `active_clients`,
`inactive_clients`, appointment totals by status, cancellation rate, revenue
family, payroll family, `payroll_pct_of_revenue_bp`, utilization, growth,
`organization_readiness_bp`, `payroll_readiness_bp`, `import_health_bp`,
`compensation_coverage_bp`, `trainer_assignment_coverage_bp`,
`service_alias_coverage_bp`, `reporting_period_coverage_bp`.

The `*_coverage_bp` and `*_readiness_bp` family is unusually valuable for an
agent: these are **self-assessment metrics about data completeness**, ideal for
grounding honest answers.

Trainer production *distribution* and revenue-per-trainer are derivable from the
per-trainer metrics; not separate metrics today.

## 20. IMPORT / SYNC ARCHITECTURE

| Integration | Status | Auth | Notes |
| --- | --- | --- | --- |
| Setmore API | **BLOCKED** (recorded in DB) | None — limited beta needs approved application from the org's Setmore Pro account | No appointment status field in the API (label only) → canonical status mapping unverifiable; recurring-series occurrence identity unverified; cost unit cents-vs-dollars ambiguous |
| Acuity API | **BLOCKED** (recorded in DB) | No account credentials | No representative sample data; status semantics / identifier stability / calendar-trainer / type-service models unconfirmed |
| Test provider | AVAILABLE | synthetic | Development only |
| Manual CSV | **DESIGNED, UNUSED** | n/a | Full pipeline exists: batches, rows, issues, resolutions, schema profiles |
| Payroll trackers | **MANUAL** | n/a | PDFs in gitignored `business-inputs/`; summary sheets only |

Idempotency (`appointment_source_links`, `integration_cursors`), duplicate
handling (`import_resolutions`), error handling (`integration_failures`,
`import_row_issues`), retry (`background_job_attempts`) and audit
(`import_batch_events`, `integration_sync_runs`) are all modelled. **Zero rows
everywhere.** Data freshness today is: *no data at all*.

## 21. DATA FRESHNESS

Sources available for a deterministic freshness signal:
`integration_sync_runs` (last sync per connection), `integration_cursors`,
`import_batches` (last upload + approval), `reporting_periods` (period cutoff),
`payroll_runs` (last calculation), plus `import_health_bp` and
`reporting_period_coverage_bp` as quality signals.

**Design requirement:** a `get_data_freshness` tool must be callable by the
Director *and* its output must be attached to every quantitative answer — e.g.
*"Appointment data is current through August 14; last Setmore import August 12."*
Given both integrations are blocked, the honest v1 answer will frequently be
*"no appointment data has been imported"* — and the Director must say exactly
that rather than reporting zeros as facts.

## 22. AUDITABILITY

Existing: `audit_events` (2 rows — live, working), `import_batch_events`,
`integration_sync_runs` / `integration_failures`, `payroll_run_events`,
`period_close_events`, `appointment_status_history`, `appointment_corrections`,
`export_events`, `email_delivery_events`, `notifications`.

Mapping to the core's ports (**design only, not implemented**):

| Core port | Backing |
| --- | --- |
| `AuditPort` | New `agent_audit` table, or extend `audit_events` with an agent actor kind — prefer a separate table so agent noise never dilutes financial audit |
| `RunTraceStore` | New `agent_runs` (mirroring G3's `g3_director_runs`) |
| `ConversationStore` | New `agent_conversations` / `agent_messages` |
| Rate/spend | New `agent_rate_events` + a `rate_limit_hit`-style RPC |

None of these exist. All four would be new tables in a future phase.

## 23. PRIVILEGED ACCESS / SERVICE ROLE

Service-role references appear in exactly four places: `src/lib/env.ts` (config)
and three migrations — `integration_domain`, `jobs_and_delivery`,
`worker_secret_access` (plus `connection_revocation_paths` /
`store_secret_status_reset` / `rotate_active_credentials` around credential
handling).

Classification:

| Path | Class |
| --- | --- |
| Worker secret access / credential rotation | **VALID SERVER ADMIN** — background workers need it; not a domain read |
| Jobs & delivery | **BOOKKEEPING ONLY** |
| Integration domain (connection secrets) | **VALID SERVER ADMIN**, sensitive |
| Ordinary domain reads | **None found using service role** — reads go through RLS clients |

This is materially cleaner than G3's starting position. **Rule for v1:** the
Director must use the RLS request client for every domain read, and may use
elevated access only for its own bookkeeping tables — the same quarantine that
G3 enforces structurally, and it should be enforced by a structural test here too.

## 24. SECURITY GAP ANALYSIS

| # | Scenario | Assessment | Severity |
| --- | --- | --- | --- |
| 1 | Trainer A asks for Trainer B's payroll | Blocked: `payroll:read_self` + RLS `app.current_trainer_id()` | OK |
| 2 | Trainer asks for department revenue | Blocked: `analytics:read` + department scope; metric `requiredPermission` | OK |
| 3 | Trainer asks for another trainer's clients | **NOT ENFORCEABLE FROM STORED DATA** — no trainer↔client assignment exists; scope must be derived from appointments | **P1-1** |
| 4 | Non-payroll manager asks for compensation rates | Blocked: `compensation:read` is a separate permission | OK |
| 5 | User alters client / trainer / organization id | Blocked: ids validated against server-loaded memberships; RLS backstop | OK |
| 6 | User alters conversation id | **No conversation store exists** — must be built with an actor+org ownership triple (G3's IDOR lesson) | **P1-2** |
| 7 | User requests service-role access | No domain path exposes it | OK |
| 8 | User requests arbitrary SQL | No generic SQL surface; must stay that way | OK |
| 9 | User asks the model to ignore policy | Policy is in permissions/RLS, not the prompt | OK |
| 10 | Imported note contains malicious instructions | Imported text will reach tool output; must be treated as data, with prompt-injection evals | **P1-3** |
| 11 | Agent quotes "revenue" ambiguously | Four distinct revenue metrics exist; unqualified quoting misleads | **P1-4** |
| 12 | Agent reports zeros from an empty database as fact | Today every metric returns zero | **P0-1** |

**P0-1 is the only P0, and it is a data-state problem, not a code defect:** with
no imported data, a Director would answer "$0 revenue, 0 clients, 0% cancellation"
truthfully-but-misleadingly. Any v1 must refuse to report quantitative results
when freshness shows no data, and say so plainly.

## 25. PROPOSED TIMBERHILL PT DIRECTOR (v1 — design only)

**Authority: READ + ANALYZE + RECOMMEND. No writes of any kind.**

Positioning: an operational intelligence layer over the PT department that
retrieves deterministic metrics before answering anything quantitative, states
its data-freshness basis on every numeric answer, and names which metric variant
it used (listed vs recognized revenue; capacity vs schedule utilization).

It should not be built until: appointments/clients/services are loaded, a
Timberhill compensation plan is configured, and at least one payroll run exists.

## 26. INITIAL TOOL REGISTRY (design only)

Nine tools. Domain-level, never table-level; each returns evidence + freshness.

| # | Tool | Purpose | Roles | Source | Input | Sensitive |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `get_data_freshness` | What data exists and how current | all | sync runs, import batches, periods | none | no |
| 2 | `get_department_summary` | Department KPIs for a period | `analytics:read` (+dept scope) | metric catalog | period, department | no |
| 3 | `get_trainer_kpis` | One trainer's KPIs | `trainer:read`; self via `trainer:read_self` | metric catalog | trainer, period | no |
| 4 | `search_trainers` | Find trainers in scope | `trainer:read`/self | trainers + assignments | query | no |
| 5 | `get_trainer_clients` | Clients a trainer works with | `client:read`; self **only if** derivation shipped (P1-1) | appointments-derived | trainer, period | names only |
| 6 | `get_client_activity` | One client's history/status | `client:read` | clients + appointments | client, window | names only, **no contact fields** |
| 7 | `get_inactive_clients` | Inactivity list with stated threshold | `client:read` | `inactive_clients` evaluator | threshold, scope | names only |
| 8 | `get_revenue_summary` | Revenue by variant, explicitly labelled | `analytics:read` | revenue metrics | period, scope, variant | financial |
| 9 | `get_payroll_summary` | Payroll totals for a run | `payroll:read`; self via `payroll:read_self` | payroll summaries | period | **payroll-sensitive** |
| — | `compare_periods` | Deterministic period-over-period deltas | inherits the metric's own permission | metric catalog | two periods, metric set | inherits |

Deferred until the underlying model exists: `get_consultation_summary`
(no consultation model), `get_commission_projection` (no plans configured).
Prohibited tombstone: `modify_operations_data` — exists only to audit refusals.

## 27. ROLE / TOOL ACCESS MATRIX

| Tool | Platform admin | Workspace admin | Payroll mgr | Dept mgr | Trainer | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| freshness | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| department summary | ✔ | ✔ | ✔ | own depts | ✖ | read-only |
| trainer KPIs | ✔ | ✔ | ✔ | own depts | **self only** | ✖ |
| search trainers | ✔ | ✔ | ✔ | own depts | self | ✖ |
| trainer clients | ✔ | ✔ | ✔ | own depts | **self only, pending P1-1** | ✖ |
| client activity | ✔ | ✔ | ✔ | own depts | ✖ (v1) | ✖ |
| inactive clients | ✔ | ✔ | ✔ | own depts | ✖ (v1) | ✖ |
| revenue summary | ✔ | ✔ | ✔ | own depts | ✖ | ✖ |
| payroll summary | ✔ | ✔ | ✔ | ✖ | **self only** | ✖ |

Derived from existing permissions — **not** invented for the agent, and **not**
enforced by the system prompt.

## 28. INITIAL POLICY

- **READ** — only within the authenticated user's normal application scope, via RLS clients and existing permission helpers.
- **RECOMMEND** — allowed, grounded strictly in authorized read evidence.
- **WRITE / BULK WRITE / PAYROLL WRITE / ROLE CHANGE / DELETE / RAW SQL** — not exposed; prohibited tombstone audits attempts.
- Page/route context is a **hint**; every tool re-authorizes.
- A management-sounding title never widens scope — only permissions do.
- No quantitative answer without a freshness statement.

## 29. MODEL STRATEGY

OpenAI, via the shared core's provider. Env seam **`TIMBERHILL_PT_DIRECTOR_MODEL`**,
defaulting to `gpt-5.1` (the model now running G3 in production at ~16s and
~7.3k tokens per turn). Anthropic remains owner-deferred and unnecessary. Vera's
and G3's model configuration must not be touched.

## 30. UI STRATEGY

Global panel with route-derived context, matching the shipped G3 pattern:
department dashboard → *"What needs my attention?"*; trainer page → *"Analyze
this trainer"*; client page → *"Summarize this client"*; payroll page (authorized
only) → *"Explain this period."* The panel hides itself when the agent is
disabled. Route context improves convenience and never grants authority.

## 31. SHARED CORE ADAPTER MAP

| Piece | Timberhill plan | Reuse from G3? |
| --- | --- | --- |
| `@builtforher/agent-core` | Vendor the **same pinned 0.1.0 tarball** | Mechanism yes |
| AgentDefinition | New — PT domain instructions | Pattern only |
| Actor/Tenant adapter | Wrap `authz.ts` + `organization_memberships`; **do not** copy G3's role logic | **No** |
| ContextProvider | Workspace/department/period context | Pattern |
| ToolRegistry | §26, built on `src/lib/intelligence` | Pattern |
| Policy | Existing permission catalog | **No** — richer here |
| RunTraceStore / AuditPort / ConversationStore | New tables (§22) | Schema shape yes |
| Rate/spend | New `agent_rate_events` + RPC | Yes |
| ModelProvider | OpenAI Responses from the core | Yes |
| API + UI | New route + panel | Pattern |

Critically: **the metric catalog means Timberhill needs far fewer bespoke tools
than G3 did.** G3's tools each assembled their own data; here a tool is largely a
permission-checked wrapper over catalogued evaluators.

## 32. EXECUTIVE AGENT FUTURE INTERFACE

Timberhill should eventually expose **one curated capability**, not its internal
tools: `get_timberhill_executive_summary` returning revenue (variant-labelled),
sessions and cancellation rate, active/inactive clients and retention, trainer
production distribution, payroll and % of revenue, data-freshness and coverage,
plus a short list of items needing owner attention. Aggregate only, no client
detail, no per-trainer compensation, freshness mandatory. No raw database access
to any orchestrator, ever.

## 33. IMPLEMENTATION PLAN (proposed; not started)

1. **Unblock data** (owner + engineering): choose CSV import or pursue Setmore/Acuity credentials; load Timberhill services, trainers, clients, appointments.
2. **Configure compensation**: capture the real per-trainer terms (the open question in `timberhill-payroll-observed.md`), create the plan/version/rules/tiers, run one payroll period and validate against a known month.
3. **Close P1-1**: implement and test the deterministic trainer↔client derivation, or withhold trainer-scoped client tools.
4. **Agent infrastructure**: runs/audit/conversations/rate tables + RLS with no client write policies.
5. **Tool registry** (§26) over the metric catalog, with per-tool permission checks and structural tests.
6. **Security matrix + injection evals** (§24), live QA with one identity per role.
7. **Ship dark**, enable after gates.

Steps 1–2 are the long poles and are **owner-dependent**, not code.

## 34. REMAINING RISKS

**P0**
- **P0-1 — Empty operational dataset.** Every metric returns zero. An agent would present zeros as facts. Blocks implementation until data exists or the Director hard-refuses on empty freshness.

**P1**
- **P1-1 — No stored trainer↔client assignment.** Trainer self-scope for clients must be derived from appointments; unverified derivation = wrong-trainer data exposure.
- **P1-2 — No conversation store.** Must ship with the actor+organization ownership triple (G3's verified IDOR defence).
- **P1-3 — Imported free text reaches tool output.** Notes/labels from vendors must be treated as data; needs injection evals before production.
- **P1-4 — Four revenue metrics.** Unqualified "revenue" misleads; the tool contract must force a variant label. Same for two utilization metrics.

**P2**
- **P2-1 — Repo `.env.local` points at a dead Supabase project** (`yoolmtleaezprjmfasku`, connection timeout) while the live pilot is `uavwqtbnkirvfvdilcwy`. Confusing and a footgun for any future work; owner should reconcile.
- **P2-2 — Status semantics live in evaluators, not configuration.** Acceptable today; document which statuses count where.
- **P2-3 — Consultation conversion is unmodelled.** Any conversion metric will be inferred and must be labelled as such.
- **P2-4 — Commission ladder unverified.** Do not encode the brief's numbers.

**P3**
- Inactivity threshold should be organization-configurable and always stated.
- Client status vocabulary (member / PT client / lead / former) is undefined.
- Agent audit should be a separate table from financial `audit_events`.

## 35. FINAL READINESS

- **TIMBERHILL SYSTEM AUDITED: YES**
- **TIMBERHILL TENANCY UNDERSTOOD: YES** — organization-scoped multi-tenancy, `timberhill-athletic-club` = `cc0f5b54-3e44-4902-94cf-b25ea6446d3a`, RLS-enforced, co-resident with G3 pilot by design.
- **TIMBERHILL READ AUTHORIZATION SAFE: YES, with one exception** — the permission/RLS architecture is sound and per-metric gated; **P1-1** (no stored trainer↔client assignment) must be closed before trainer-scoped client tools ship.
- **TIMBERHILL DATA SOURCES AUTHORITATIVE: NO** — the platform is the intended source of truth but holds no operational data; the authoritative Timberhill record is currently Setmore exports and payroll-tracker PDFs held locally. Both integrations are recorded as blocked for lack of credentials.
- **TIMBERHILL FINANCIAL READ SECURITY SAFE: YES** — `analytics:read`, department scoping, and per-metric permissions gate revenue; **P1-4** requires variant labelling for honesty, not for security.
- **TIMBERHILL PAYROLL READ SECURITY SAFE: YES** — `payroll:read` vs `payroll:read_self` vs `compensation:read` are distinct permissions with RLS backing. Role-based here is correct; the G3 named-grant pattern is unnecessary because `payroll_manager` is a real distinct role.
- **READY TO BUILD TIMBERHILL PT DIRECTOR V1: NO** — not for security reasons. There is no data to read (P0-1), no compensation plan configured, no payroll run, and no consultation model. Building now would produce a correct agent that can only say "zero." Revisit after implementation-plan steps 1–3.
- **READY FOR TIMBERHILL WRITE AUTHORITY: NO** — v1 is read-only by mandate, and no write case has been evaluated. Payroll and period-close are financial records with an approval workflow; agent writes there are far beyond current scope.
- **G3 PRODUCTION TRACK RECORD SUFFICIENT FOR EXECUTIVE AGENT: NO** — G3's Director was enabled and live-verified within the last day. It has correctness evidence, not an operational track record: no accumulated run history, no observed cost curve over time, no incident experience.
- **READY TO DESIGN JR EXECUTIVE AGENT: YES** — designing the contract is safe and useful now; §32 defines what Timberhill would expose. Design only.
- **READY TO BUILD JR EXECUTIVE AGENT: NO** — orchestration requires two stable, in-use production agent interfaces. Vera qualifies; G3 is days old; Timberhill does not exist yet.

---

### Files changed by this audit

`docs/timberhill-pt-director-audit.md` (new). No code, migrations, agent tables,
routes, env vars, or dependencies were added or modified.
