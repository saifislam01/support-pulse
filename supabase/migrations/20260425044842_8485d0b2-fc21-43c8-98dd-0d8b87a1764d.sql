CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule with the same name (safe if not present)
DO $$
BEGIN
  PERFORM cron.unschedule('reset-completed-tasks-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reset-completed-tasks-daily',
  '0 0 * * *',
  $$
  UPDATE public.tasks
  SET status = 'pending'
  WHERE status = 'completed';
  $$
);