-- Monthly report from Setmore: sessions that have happened, their value and
-- the distinct clients seen, per trainer and for the department (trainer is
-- null on the department row). Same gross rule as the payroll views.
-- Depends on the pkg_* package audit tables, which are applied to the
-- database directly and are not yet in this folder.
create or replace view public.v_pkg_monthly_report
with (security_invoker = true) as
with s as (
  select
    organization_id,
    replace(staff_name, ', CSCS', '') as trainer,
    date_trunc('month', start_at at time zone 'America/Los_Angeles')::date as month,
    coalesce(customer_key, lower(trim(customer_name))) as client,
    case
      when coalesce(service_name, '') not ilike 'performance lab%'
       and coalesce(service_name, '') <> 'Private Training | Intro Session - 1x30 min.'
      then coalesce(cost, 0) else 0
    end as gross
  from public.pkg_setmore_sessions
  where removed_at is null
    and staff_name is not null
    and nullif(trim(coalesce(customer_name, '')), '') is not null
    and start_at <= now()
)
select organization_id, month, trainer,
       count(*) as sessions,
       sum(gross) as gross,
       count(distinct client) as active_clients
from s
group by grouping sets ((organization_id, month, trainer), (organization_id, month));

grant select on public.v_pkg_monthly_report to authenticated;
