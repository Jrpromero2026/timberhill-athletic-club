-- Hub library: documents, links and short notes shown in each hub section.
-- Content lives in the database (behind login), never in this repository.
create table if not exists public.hub_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section text not null check (section in ('payroll','audit','trainers','projects','marketing','reports')),
  kind text not null default 'link' check (kind in ('link','note')),
  title text not null,
  summary text,
  body text,
  url text,
  source text,
  item_date date,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, section, title),
  check (kind = 'note' or url is not null)
);

alter table public.hub_items enable row level security;

-- Payroll and audit material needs payroll access; the rest needs org access.
create policy hub_items_select on public.hub_items for select
  using (
    app.is_platform_admin()
    or app.has_permission_in(
      organization_id,
      case when section in ('payroll','audit') then 'payroll:read' else 'org:read' end
    )
  );

create policy hub_items_admin_write on public.hub_items for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

grant select on public.hub_items to authenticated;
grant insert, update, delete on public.hub_items to authenticated;

-- A heading to file each item under within its section.
alter table public.hub_items add column if not exists group_name text;
