# Hosted Internal Pilot — Deployment Record

**This is a Hosted Internal Pilot, not production.** It exists so the
owner can use Performance Operations from any browser without running a
local dev server. No production claims are made about uptime, backups,
support, or data retention.

Deployed 2026-07-31. No application code was changed to deploy it.

## What is hosted

| Component | Value |
| --- | --- |
| Application URL | `https://performance-operations.vercel.app` |
| Vercel project | `built-for-her-s-projects/performance-operations` (`prj_RnpiwJdH8v9bUKjsFoAefDyrmrAA`) |
| Production deployment | `dpl_APBYpYR2AX48AW9dxnofBbYEgLsT` |
| Source commit | `1a0a02e` (clean tree at deploy time) |
| Supabase project | `performance-operations-pilot` (`uavwqtbnkirvfvdilcwy`), region `us-west-1`, Postgres 17.6 |
| Supabase API URL | `https://uavwqtbnkirvfvdilcwy.supabase.co` |

## Why a separate Supabase project

The pilot does **not** share the development project
(`performance-operations-dev`). The deciding factor was not whether RLS
works — it does — but whether automated development activity can
*operationally* contaminate the pilot. It can: the background-job worker
claims jobs globally rather than per organization, the e2e fixtures hold
`platform_admin`, and the documented cleanup recipes run destructive SQL
against whatever project they are pointed at. Those are operational
couplings that RLS does not mediate, so the pilot gets its own database.

Cost: $10/month (Supabase Pro), approved by the owner before creation.

## Database provisioning

All 32 repository migrations were replicated verbatim. The Supabase CLI
could not be used (non-interactive shell, no access token, no database
password), so each file was applied through the Supabase MCP
`apply_migration`, preserving exact file contents and order. Some
consecutive migrations were applied in a single batch; the ledger
therefore holds 22 entries covering migrations 1–32.

### Ordering defect found and repaired

Migrations 12, 14, 19, 22, and 28 each insert permissions **and** grant
them to roles by joining `public.roles`. On a fresh project those
migrations run before `seed.sql` creates the roles, so every grant block
silently inserted zero rows — leaving a database with a complete
permission catalogue and an empty permission matrix. Nothing errors; the
symptom would have been an operator who can sign in and see nothing.

The repair was to seed roles and permissions first, then re-execute the
five grant blocks verbatim (all are `on conflict do nothing`, so
re-execution is safe). Parity with the development project is now exact:

| Measure | Dev | Pilot |
| --- | --- | --- |
| Roles | 6 | 6 |
| Permissions | 99 | 99 |
| Role→permission grants | 279 | 279 |
| Per-role grant fingerprints (md5 of sorted keys) | — | identical for all six roles |
| Public tables | 84 | 84 |
| Tables with RLS enabled **and** forced | 84 | 84 |
| RLS policies | 219 | 219 |

## What was seeded

Only structure and identity — no financial data, no trainers, no
services, no compensation plans, no reporting periods:

- `timberhill-athletic-club` — "Timberhill Athletic Club", 3 departments
- `g3-performance` — "G3 Performance", 6 departments

(Both renamed 15 Sep 2026 from `…-pilot`. References further down this file
use the original names because they describe what was done at the time.)
- 11 service-category headings per organization
- JR Romero (`jrpromero16@gmail.com`) with `platform_admin` membership in
  both organizations
- One platform audit event recording the seed

The sandbox organizations from `seed.sql` were deliberately **not**
seeded — those exist only as e2e fixtures in the development project.

The account was created with a throwaway random password generated
inside the database and never recorded, printed, or transmitted. **The
owner must set a real password before first use** (see the runbook).

## Storage and background work

- Storage bucket `performance-operations-imports` exists: private,
  10 MB limit, CSV mime types only.
- The Vault secret `worker_server_key` is **intentionally not
  provisioned**. It only enables decryption of stored integration
  provider credentials, and the pilot has none — Setmore and Acuity are
  `blocked` and no connections exist. Absent the secret, the credential
  RPC raises `worker_key_not_provisioned`, so that path is unreachable by
  construction rather than by configuration. See
  [HOSTED_PILOT_ENVIRONMENT.md](HOSTED_PILOT_ENVIRONMENT.md) for the
  activation procedure.

## The deployment defect that verification caught

The first two production deployments looked healthy — pages rendered,
routes were protected, TLS was valid — but the application was silently
running in its "Supabase is not configured" degraded mode. Every server
component fell back to empty states, and the session proxy could not
recognise a valid session cookie, which would have left the owner unable
to log in (sign in, get redirected straight back to the login page).

**Cause.** The Vercel CLI stored all four environment variables as
*Sensitive*. Sensitive variables are exposed at runtime but **not at
build time**, and this application resolves its Supabase configuration
during module initialisation (`src/lib/env.ts` evaluates `readEnv()` at
import). The build therefore baked in "not configured".

**Detection.** A pending invitation was inserted into the pilot database
with a known raw token, then requested from the hosted app
unauthenticated. The hosted app answered "Invitation not found" while an
identical local production build, pointed at the same project, resolved
it to "Join Timberhill Athletic Club (Pilot)". That isolated the fault to
the hosted environment rather than the code or the database. Response
timing corroborated it: the hosted proxy took the same ~160 ms with a
valid session cookie, a corrupt one, and none at all, proving it never
performed a session lookup.

**Fix.** The three `NEXT_PUBLIC_*` variables were re-added with
`--no-sensitive` (they are browser-safe by design — the project URL and
publishable key are public, and RLS is the enforcement layer) and the
project was redeployed. `WORKER_SECRET` remains Sensitive, which is
correct: it is server-only and read at runtime.

**Lesson worth keeping.** On Vercel, any `NEXT_PUBLIC_*` value this
application depends on must be non-sensitive, because it is needed at
build time. A deployment can look completely healthy while running
disconnected from its database; only a probe that asserts on *data known
to exist in the intended database* catches it.

## Verification evidence

Performed against the live hosted URL after the fix:

- **Database identity** — the hosted app resolved a pilot-only
  invitation token to "Join Timberhill Athletic Club (Pilot)", proving it
  reads the pilot project and not the development project.
- **Unauthenticated access** — `/overview`, `/payroll`, `/analytics`,
  `/configuration/users`, `/audit` all return 307 to
  `/login?next=…`; `POST /api/worker` without the secret header is
  likewise blocked.
- **Authentication lifecycle** — a wrong password returns
  `400 invalid_credentials`; a correct password issues a 1-hour token.
- **Session handling** — with a valid session, `/overview` returns 200
  and `/login` redirects to `/overview`.
- **Workspace scoping through the UI** — a viewer with membership in
  Timberhill only saw exactly that workspace; G3 was absent from the
  selector.
- **Permission gating through the UI** — the same viewer opening
  `/payroll` got "Not available — You do not have access to this area in
  the selected workspace."
- **RLS at the API layer** — with a real user JWT: organizations
  returned Timberhill only, an explicit request for the G3 slug returned
  empty, `payroll_runs` / `audit_events` / `trainers` /
  `compensation_plans` all returned empty, `profiles` returned only the
  caller's own row, and an attempted organization insert was rejected
  `403 new row violates row-level security policy`.
- **Anonymous API access** — reading `organizations` with only the
  publishable key returns `[]`.
- **Security advisors** — one WARN (leaked-password protection
  disabled); no RLS or definer findings.

Every verification account and probe row was deleted afterwards. The
pilot database now holds exactly one auth user (the owner), one profile,
two organizations, nine departments, zero invitations, and zero
operational records.

## Deliberate exclusions

No new features, no Phase 10 work, no AI or forecasting, no integration
activation, no custom domain, no production email provider (delivery
stays test-mode), no service-role key in any hosted environment, and no
development or e2e credentials copied to hosted.
