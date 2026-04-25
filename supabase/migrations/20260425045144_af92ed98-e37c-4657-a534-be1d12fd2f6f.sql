ALTER TABLE public.daily_task_completions
  ALTER COLUMN completion_date
  SET DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka'))::date;