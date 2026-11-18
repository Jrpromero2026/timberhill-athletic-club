-- Trainer revenue for a month split into what has happened and what is still
-- booked, using the same gross rule as v_pkg_trainer_monthly_revenue
-- (Performance Lab and the Private Training 1x30 intro are paid as additions,
-- so they are left out of gross; rows with no customer are admin blocks).
-- Depends on the pkg_* package audit tables, which are applied to the
-- database directly and are not yet in this folder.
create or replace view public.v_pkg_trainer_month_progress
with (security_invoker = true) as
with s as (
  select
    organization_id,
    replace(staff_name, ', CSCS', '') as trainer,
    date_trunc('month', start_at at time zone 'America/Los_Angeles')::date as month,
    start_at <= now() as happened,
    case
      when coalesce(service_name, '') not ilike 'performance lab%'
       and coalesce(service_name, '') <> 'Private Training | Intro Session - 1x30 min.'
      then coalesce(cost, 0) else 0
    end as gross
  from public.pkg_setmore_sessions
  where removed_at is null
    and staff_name is not null
    and nullif(trim(coalesce(customer_name, '')), '') is not null
), agg as (
  select organization_id, trainer, month,
    sum(gross) filter (where happened) as gross_to_date,
    sum(gross) filter (where not happened) as gross_booked,
    count(*) filter (where happened) as sessions_to_date,
    count(*) filter (where not happened) as sessions_booked
  from s group by 1, 2, 3
), a as (
  select organization_id, trainer, period_month as month, sum(amount) as manual_revenue
  from public.pkg_payroll_adjustments
  where kind = 'revenue'
  group by 1, 2, 3
)
select
  coalesce(agg.organization_id, a.organization_id) as organization_id,
  coalesce(agg.trainer, a.trainer) as trainer,
  coalesce(agg.month, a.month) as month,
  coalesce(agg.gross_to_date, 0) + coalesce(a.manual_revenue, 0) as gross_to_date,
  coalesce(agg.gross_booked, 0) as gross_booked,
  coalesce(agg.sessions_to_date, 0) as sessions_to_date,
  coalesce(agg.sessions_booked, 0) as sessions_booked
from agg
full join a on a.organization_id = agg.organization_id and a.trainer = agg.trainer and a.month = agg.month;

grant select on public.v_pkg_trainer_month_progress to authenticated;
