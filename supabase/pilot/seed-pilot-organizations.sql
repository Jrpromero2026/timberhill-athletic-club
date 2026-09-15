-- ============================================================================
-- PILOT SEED — creates the two clean pilot organizations (Option 2 in
-- docs/PILOT_CONFIGURATION_INVENTORY.md).
--
-- ALREADY RUN. The two organizations exist and hold live data — Timberhill
-- alone carries several thousand appointments. The "(Pilot)" suffix and the
-- "-pilot" slugs were dropped on 15 Sep 2026 once the pilot became the real
-- thing; the values below match the database as it now stands, so the
-- `on conflict (slug) do nothing` guard still works and a re-run is still a
-- no-op. Editing the slugs here without also renaming them in the database
-- would make a re-run create DUPLICATE organizations.
--
-- Not a migration: this is
-- owner-triggered configuration seeding, executed once against
-- performance-operations-dev (MCP execute_sql or psql). Idempotent —
-- safe to re-run; it never touches the existing sandbox organizations.
--
-- Seeds ONLY: organization rows, department structures, and JR's
-- platform-admin membership. Services, trainers, compensation plans,
-- reporting periods, and policies are deliberately NOT seeded — JR
-- enters those in the app per docs/PILOT_INPUTS_REQUIRED.md.
-- ============================================================================

begin;

insert into public.organizations (slug, name, status)
values
  ('timberhill-athletic-club', 'Timberhill Athletic Club', 'active'),
  ('g3-performance', 'G3 Performance', 'active')
on conflict (slug) do nothing;

-- Department structures mirror the intended real structures already
-- recorded in the sandbox organizations.
insert into public.departments (organization_id, name)
select o.id, d.name
from public.organizations o
join (values
  ('timberhill-athletic-club', 'Personal Training'),
  ('timberhill-athletic-club', 'PACK Training'),
  ('timberhill-athletic-club', 'Nutrition Coaching'),
  ('g3-performance', 'Athlete Performance'),
  ('g3-performance', 'Adult Human Performance'),
  ('g3-performance', 'Team Performance'),
  ('g3-performance', 'Performance Evaluations'),
  ('g3-performance', 'Tactical Performance'),
  ('g3-performance', 'G3 Volleyball')
) as d(slug, name) on d.slug = o.slug
where not exists (
  select 1 from public.departments existing
  where existing.organization_id = o.id and existing.name = d.name
);

-- JR (platform admin) gets an explicit membership in both pilot orgs so
-- they appear in the workspace selector as first-class workspaces.
insert into public.organization_memberships (profile_id, organization_id, role_id)
select p.id, o.id, r.id
from public.profiles p
join public.roles r on r.key = 'platform_admin'
join public.organizations o on o.slug in ('timberhill-athletic-club', 'g3-performance')
where p.email = 'jrpromero16@gmail.com'
  and not exists (
    select 1 from public.organization_memberships m
    where m.profile_id = p.id and m.organization_id = o.id and m.effective_to is null
  );

commit;

-- Verification (expected: 2 rows with 3 and 6 departments, 1 member each)
select o.slug, o.name,
  (select count(*) from public.departments d where d.organization_id = o.id) as departments,
  (select count(*) from public.organization_memberships m
    where m.organization_id = o.id and m.effective_to is null) as members
from public.organizations o
where o.slug in ('timberhill-athletic-club', 'g3-performance')
order by o.slug;
