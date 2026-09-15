# Pilot Configuration Inventory

Inventory of the `performance-operations-dev` Supabase project
(`yoolmtleaezprjmfasku`) taken 2026-07-30 at commit `a422470`, read-only.
Classification legend: **REAL** (intended business configuration),
**FIXTURE** (durable development/e2e fixture), **SYNTHETIC** (run-unique
e2e test record), **SUPERSEDED** (historical, closed-out development
evidence). Nothing was modified during this inventory.

## Organization: Timberhill Athletic Club

| Item | Contents | Classification |
| --- | --- | --- |
| Organization | `timberhill-athletic-club`, id `4dbc3f9f-703f-4a65-9f36-69a7fcdee059`, active | **REAL** (correct name/slug) |
| Departments (3) | Personal Training, PACK Training, Nutrition Coaching | **REAL** (intended structure; managers/dates unset) |
| Users (2) | jrpromero16@gmail.com (platform_admin — JR), e2e-admin@perfops.local (platform_admin) | JR **REAL** · e2e admin **FIXTURE** (required by the live test suite) |
| Trainers (3) | "Payton E2E Payroll", "Alex Fixture", "Morgan C." — no logins, no department assignments | **FIXTURE** (live-suite roster; documented in the Phase 4 fixture notes) |
| Services (1) | "E2E Signature 60" (category "E2E Fixtures", 60 min, payroll-eligible, **19 accumulated source aliases**) | **FIXTURE** |
| Compensation plans (1) | "E2E Payroll 50% Split" v1 published, percentage_of_revenue, 0 tiers, assigned to Payton | **FIXTURE** |
| Reporting periods (4) | E2E Schedule Window (2024-01), E2E Payroll Window (2090–2098), E2E Close Window (2099-06), E2E Analytics Closed Window (2100-01, closed) | **FIXTURE** (deliberately date-fenced far outside real operating dates) |
| Import batches (95) | All `e2e-*`/`test_provider-sync-*` files; terminal states (posted/reversed/failed); **0 active appointments** (every posted batch reversed by spec cleanup) | **SYNTHETIC / SUPERSEDED** |
| Payroll runs (27) | All "E2E Payroll Run *"; every one voided or superseded | **SYNTHETIC / SUPERSEDED** |
| Period-close runs | All voided/superseded; **0 closed** | **SYNTHETIC / SUPERSEDED** |
| Close policy | `allow_self_approval = true` for Timberhill | **FIXTURE** (dev-only; lets the single e2e admin approve their own close — a real multi-operator org should keep the fail-closed default; for a single-operator pilot JR must consciously re-decide this) |
| Goals (10) | All "E2E Goal */E2E Dept Goal *"; 2 still `active`, 2 `draft`, rest cancelled/archived | **SYNTHETIC** (active/draft strays are leftovers from sleep-interrupted test runs) |
| Benchmarks (5) | All "E2E Bench *"; 2 still `approved`, 3 deprecated | **SYNTHETIC** (approved strays as above) |
| Dashboards (9) | All "E2E Dash *" (5 active, 4 archived copies) | **SYNTHETIC** |
| Saved views (0) | — | — |
| Scheduled reports (28) | Accumulated e2e definitions (quick_report + Phase 9 types) | **SYNTHETIC** |
| Integration connections (30) | All test_provider connections from e2e runs | **SYNTHETIC** |
| Report packages (13) / export & delivery events (83 deliveries) | All generated against fixture periods | **SYNTHETIC / SUPERSEDED** |

## Organization: G3 Sports & Fitness

| Item | Contents | Classification |
| --- | --- | --- |
| Organization | `g3-sports-fitness`, id `b775a2f5-73df-4124-bc18-f36d1968c730`, active | **REAL** intent — but the pilot brief names the business "G3 Performance"; the recorded name needs JR's confirmation |
| Departments (6) | Adult Human Performance, Athlete Performance, G3 Volleyball, Performance Evaluations, Tactical Performance, Team Performance | **REAL** (intended structure) |
| Everything else | 0 users, 0 trainers, 0 services, 0 periods, 0 imports, 0 payroll runs, 0 analytics objects | Empty shell |

## Missing required configuration (both organizations)

No real configuration exists anywhere for: trainer/coach rosters, service
catalogs, source aliases, compensation plans or tiers, reporting periods
covering real dates, goals, benchmarks, or delivery channels. **Every
operational record in the development database is a test artifact.** The
only REAL rows are the two organizations, their department structures,
and JR's platform-admin account.

## Unknown records

None — every record matched a known fixture or run-unique e2e naming
pattern. Nothing ambiguous was found.

---

# Pilot Environment Recommendation (Phase E)

**Recommendation: Option 2 — create two new pilot organizations inside
the existing dev project.** Evidence:

- **Option 1 (reuse existing orgs) is rejected for Timberhill.** The org
  carries 95 batches / 27 payroll runs / 28 schedules / 30 connections of
  synthetic history. Although synthetic *appointments* are date-fenced
  (2024-01 and 2090+) and all reversed, several operator surfaces count
  org-wide state regardless of period: close-readiness ("N failed
  batch(es) on record" needs acknowledgement every close), import health
  metrics, export/delivery history, audit feed, dashboards/goals lists.
  JR's first real close would wade through fixture noise, and the live
  e2e suite must KEEP writing to this org (specs pin it by name) — real
  and synthetic data would interleave forever.
- **Option 1 is also rejected for G3** only because of the name question
  and because the live suite switches workspaces into it
  (leak-prevention tests); it is otherwise clean.
- **Option 2 works structurally**: organization isolation is exactly what
  RLS enforces and what the live suites verify (cross-org denial checks
  in every phase). New orgs start with zero history, so every readiness
  counter starts honest. The e2e fixtures stay where they are and the
  test suites keep passing untouched. No new environment management.
- **Option 3 (separate Supabase project) is premature**: it duplicates
  migration/replication overhead before production, and the
  contamination risk Option 2 leaves behind is limited to shared
  PLATFORM-level surfaces (platform-admin "All Workspaces" views show
  both pilot and sandbox orgs). Acceptable for an internal pilot;
  production launch should still get its own project (already the plan).

**Setup path**: there is deliberately no organization-creation UI
(`org:create` is reserved; orgs were seeded by migration). Pilot orgs are
created by an additive, owner-confirmed seed (SQL via MCP or a one-off
migration) containing ONLY: organization row, department rows, and JR's
platform-admin membership — no services, trainers, plans, or periods
(those are JR's in-app configuration work, per
[PILOT_INPUTS_REQUIRED.md](PILOT_INPUTS_REQUIRED.md)). Proposed names,
pending JR's confirmation:

- **"Timberhill Athletic Club"** — slug `timberhill-athletic-club`
- **"G3 Performance"** — slug `g3-performance`

> Renamed 15 Sep 2026. Both were created as `… (Pilot)` on the slugs
> `timberhill-pilot` and `g3-performance-pilot`; the suffix was dropped once
> the pilot became the live system. Ids are unchanged.

The "(Pilot)" suffix guarantees nobody mistakes sandbox for pilot (and
vice versa) until production launch renames them. Existing orgs remain
e2e sandboxes; the stray active "E2E Goal/Bench" rows there should be
cancelled/deprecated through the UI as routine hygiene.
