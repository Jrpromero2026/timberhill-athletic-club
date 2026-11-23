-- Hybrid Coaching in the package audit.
--
-- Every Hybrid plan on the service menu carries a fixed number of sessions, so
-- it is tracked the same way as a package: sessions bought minus sessions used.
-- Unused sessions roll over. An extra session in a month simply uses the next
-- one, so the client shows as behind until another plan is bought.
--
-- Hybrid keeps its own balance per client. It is stored under session length 0,
-- which the ledger reads as "Hybrid" and never mixes with 30/60/90-minute credit.

create table if not exists public.pkg_hybrid_plans (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system text not null,
  months int not null check (months > 0),
  sessions int not null check (sessions > 0),
  price_cents int not null check (price_cents > 0),
  primary key (organization_id, system, months)
);

alter table public.pkg_hybrid_plans enable row level security;

drop policy if exists pkg_hybrid_plans_read on public.pkg_hybrid_plans;
create policy pkg_hybrid_plans_read on public.pkg_hybrid_plans
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));

insert into public.pkg_hybrid_plans (organization_id, system, months, sessions, price_cents)
select o.id, v.system, v.months, v.sessions, v.price_cents
from public.organizations o,
  (values
    ('Full Coaching System', 1, 4, 35900),
    ('Full Coaching System', 3, 12, 102900),
    ('Full Coaching System', 6, 24, 201000),
    ('Progress System', 1, 2, 22100),
    ('Progress System', 3, 6, 63900),
    ('Progress System', 6, 12, 125400),
    ('Essentials System', 1, 1, 15000),
    ('Essentials System', 3, 3, 45000),
    ('Essentials System', 6, 6, 90000),
    ('Strategic Check-In', 3, 1, 30000),
    ('Strategic Check-In', 6, 2, 59200),
    ('Executive Overview', 6, 1, 51900)
  ) as v(system, months, sessions, price_cents)
where o.slug = 'timberhill-athletic-club'
on conflict do nothing;

-- Sessions a Hybrid plan adds when it is bought outright, from its GMS item name.
create or replace function public.pkg_hybrid_sessions(p_org uuid, p_item text)
returns int language sql stable set search_path to '' as $$
  select h.sessions
  from public.pkg_hybrid_plans h
  where h.organization_id = p_org
    and coalesce(p_item, '') ~* '^\s*hybrid coaching'
    and p_item ilike '%' || h.system || '%'
    and h.months = ((regexp_match(p_item, '(\d+)\s*-\s*month', 'i'))[1])::int
  limit 1
$$;

-- Sessions one payment-plan instalment adds. GMS records these as
-- "Personal Training Payment Plan" with no plan name, so the instalment amount
-- (plan price divided by its months) identifies the plan.
create or replace function public.pkg_plan_instalment_sessions(p_org uuid, p_cents bigint)
returns int language sql stable set search_path to '' as $$
  select h.sessions / h.months
  from public.pkg_hybrid_plans h
  where h.organization_id = p_org
    and h.months > 1
    and h.sessions % h.months = 0
    and round(h.price_cents::numeric / h.months) = p_cents
  order by h.months
  limit 1
$$;

create or replace function public.pkg_import_gms_rows(p_org uuid, p_file text, p_rows jsonb)
returns jsonb language plpgsql set search_path to '' as $function$
declare v_ins int; v_seen int;
begin
  with r as (
    select x.ord, x.j,
           nullif(btrim(x.j->>'Invoice ID'),'') invoice,
           btrim(x.j->>'Item Name') item,
           coalesce(x.j->>'Description','') descr,
           x.j->>'Member' member,
           round(coalesce(nullif(x.j->>'Total','')::numeric,0) * 100)::bigint cents,
           to_timestamp(x.j->>'Payment Date', 'MM/DD/YYYY HH24:MI:SS') at time zone 'UTC' as local_ts
    from jsonb_array_elements(p_rows) with ordinality x(j, ord)
  ), p as (
    select r.*,
      (r.local_ts::timestamp at time zone 'America/Los_Angeles') purchased_at,
      nullif(btrim(split_part(r.member, ' - ', 1)),'') member_id,
      btrim(substr(r.member, length(split_part(r.member, ' - ', 1)) + 4)) member_name,
      nullif(btrim((regexp_match(r.descr, 'From the POS of (.+)$'))[1]),'') pos_for,
      public.pkg_hybrid_sessions(p_org, r.item) hybrid_n,
      case when r.item ilike 'personal training payment plan%'
           then public.pkg_plan_instalment_sessions(p_org, r.cents) end plan_n,
      row_number() over (partition by r.invoice, r.item, r.descr, r.j->>'Total' order by r.ord) occ
    from r
  )
  insert into public.pkg_purchases (organization_id, line_key, purchased_at, gms_invoice, gms_member_id, gms_member_name,
      product_name, sessions_added, session_minutes, amount_cents, sold_by, is_refund, item_kind, for_name, import_file, source_row)
  select p_org,
         concat_ws('|', p.invoice, p.item, p.descr, p.j->>'Total', p.occ),
         p.purchased_at, p.invoice, p.member_id, p.member_name, p.item,
         case when p.hybrid_n is not null then p.hybrid_n
              when p.plan_n is not null then p.plan_n
              when public.pkg_is_package_item(p.item) then coalesce(public.pkg_parse_sessions(p.item),0)
              else 0 end,
         case when p.hybrid_n is not null or p.plan_n is not null then 0
              else public.pkg_parse_minutes(p.item) end,
         p.cents,
         nullif(btrim(regexp_replace(coalesce(p.j->>'Sold By',''), '^\d+\s*-\s*', '')),''),
         coalesce(p.j->>'Refunded','No') ilike 'yes',
         case when p.hybrid_n is not null or p.plan_n is not null or public.pkg_is_package_item(p.item) then 'package'
              when p.item ilike 'personal training payment plan%' then 'payment_plan' else 'other' end,
         coalesce(p.pos_for, p.member_name),
         p_file, p.j
  from p
  where p.invoice is not null
  on conflict (organization_id, line_key) do update
    set is_refund = excluded.is_refund, source_row = excluded.source_row;
  get diagnostics v_ins = row_count;
  select count(*) into v_seen from jsonb_array_elements(p_rows);
  return jsonb_build_object('rows_in_file', v_seen, 'rows_written', v_ins, 'link', public.pkg_link_accounts(p_org));
end $function$;

-- Payment-plan instalments already on file: credit the month's sessions.
update public.pkg_purchases p
set item_kind = 'package',
    session_minutes = 0,
    sessions_added = public.pkg_plan_instalment_sessions(p.organization_id, p.amount_cents)
where p.item_kind = 'payment_plan'
  and public.pkg_plan_instalment_sessions(p.organization_id, p.amount_cents) is not null;

-- Hybrid sessions from Setmore count, under the Hybrid balance. The trigger
-- sets this on every sync, so the nightly run keeps it.
create or replace function public.pkg_setmore_sessions_resolve()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.service_name is null and new.service_key is not null then
    select m.service_name into new.service_name from public.pkg_setmore_service_map m
    where m.organization_id = new.organization_id and m.service_key = new.service_key;
  end if;
  if coalesce(new.service_name, '') ~* '^\s*hybrid coaching' then
    new.session_minutes := 0;
    new.counts := coalesce(new.cost, 0) > 0;
  else
    new.session_minutes := public.pkg_parse_minutes(new.service_name);
    new.counts := public.pkg_session_counts(new.service_name, new.cost);
  end if;
  return new;
end $function$;

-- Re-run the trigger over sessions already synced.
update public.pkg_setmore_sessions s set last_seen_at = s.last_seen_at
where coalesce(s.service_name, '') ~* '^\s*hybrid coaching';

-- Hybrid credit is never offered as "credit on another session length".
create or replace view public.v_pkg_length_credit as
 with d as (
   select v_pkg_sessions.billing_account_id, v_pkg_sessions.minutes, count(*) as delivered
   from public.v_pkg_sessions
   where v_pkg_sessions.start_at <= now() and v_pkg_sessions.billing_account_id is not null
   group by v_pkg_sessions.billing_account_id, v_pkg_sessions.minutes
 ), u as (
   select coalesce(t.billing_account_id, d.billing_account_id) as acct,
          coalesce(t.minutes, d.minutes) as minutes,
          greatest(coalesce(t.purchased, 0) - coalesce(d.delivered, 0::bigint), 0::bigint) as unused
   from public.v_pkg_purchase_totals t
   full join d on d.billing_account_id = t.billing_account_id and d.minutes = t.minutes
 )
 select a.acct as billing_account_id,
        a.minutes,
        (coalesce(sum(b.unused) filter (where b.minutes <> a.minutes and a.minutes > 0 and b.minutes > 0), 0::numeric))::integer as other_length_credit
 from u a join u b on b.acct = a.acct
 group by a.acct, a.minutes;

-- "Hybrid" in place of a session length in the exceptions list. The view
-- public.v_pkg_exceptions uses this label for its detail text.
create or replace function public.pkg_length_label(p_minutes int)
returns text language sql immutable set search_path to '' as $$
  select case when p_minutes = 0 then 'Hybrid' else p_minutes::text || '-min' end
$$;
