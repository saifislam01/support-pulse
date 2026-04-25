ALTER TYPE public.app_role RENAME VALUE 'engineer' TO 'support_engineer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';