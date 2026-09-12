-- Re-home stored notification links under /performance-operations.
--
-- `notifications.link_path` holds real application paths written at the time
-- the notification was created — '/payroll/<run-id>', '/imports/<batch-id>'
-- and so on. The operations platform has moved beneath /performance-operations
-- so that the public website can own the domain root, which means every row
-- written before that move now points at a path the application no longer
-- serves: the notification bell would hand users 404s.
--
-- This rewrites those rows to match the new routing. It is written to be safe
-- to run more than once and safe to run against a table that already contains
-- new-style paths:
--
--   * rows already beginning with '/performance-operations/' are skipped, so
--     re-running changes nothing,
--   * only the known top-level segments are rewritten, so an unrelated or
--     external link is left alone,
--   * NULL link_path rows are untouched.
--
-- Down migration: strip the prefix from the same set. Kept in a comment rather
-- than executed — Supabase applies migrations forward only.

update public.notifications
set link_path = '/performance-operations' || link_path
where link_path is not null
  and link_path not like '/performance-operations/%'
  and (
    link_path = '/analytics'        or link_path like '/analytics/%'        or
    link_path = '/appointments'     or link_path like '/appointments/%'     or
    link_path = '/audit'            or link_path like '/audit/%'            or
    link_path = '/clients'          or link_path like '/clients/%'          or
    link_path = '/configuration'    or link_path like '/configuration/%'    or
    link_path = '/data-health'      or link_path like '/data-health/%'      or
    link_path = '/departments'      or link_path like '/departments/%'      or
    link_path = '/director'         or link_path like '/director/%'         or
    link_path = '/imports'          or link_path like '/imports/%'          or
    link_path = '/integrations'     or link_path like '/integrations/%'     or
    link_path = '/notifications'    or link_path like '/notifications/%'    or
    link_path = '/overview'         or link_path like '/overview/%'         or
    link_path = '/payroll'          or link_path like '/payroll/%'          or
    link_path = '/period-close'     or link_path like '/period-close/%'     or
    link_path = '/reports'          or link_path like '/reports/%'          or
    link_path = '/revenue'          or link_path like '/revenue/%'          or
    link_path = '/setup'            or link_path like '/setup/%'            or
    link_path = '/snapshots'        or link_path like '/snapshots/%'        or
    link_path = '/trainers'         or link_path like '/trainers/%'
  );

-- To reverse:
--   update public.notifications
--   set link_path = substring(link_path from length('/performance-operations') + 1)
--   where link_path like '/performance-operations/%';
