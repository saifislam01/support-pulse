-- 1) Block users from inserting/updating/deleting their own roles (PRIVILEGE_ESCALATION)
-- Drop overly broad ALL policy on user_roles and replace with narrow admin-only write policies.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Restrict Realtime channel subscriptions to user-owned topics
-- (REALTIME_MISSING_CHANNEL_AUTHORIZATION)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to own topic" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow user-scoped topics like "user:<uid>" or "presence:<uid>"
  -- Also allow the team-wide "team_messages" / "presence" channels used in app.
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() = ('presence:' || auth.uid()::text)
  OR realtime.topic() = 'team_messages'
  OR realtime.topic() = 'presence'
  OR realtime.topic() LIKE 'postgres_changes%'
);

DROP POLICY IF EXISTS "Authenticated users can broadcast to own topic" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to own topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() = ('presence:' || auth.uid()::text)
  OR realtime.topic() = 'team_messages'
  OR realtime.topic() = 'presence'
);

-- 3) Prevent users from manipulating points_awarded on tasks
-- (MISSING_RLS_PROTECTION on tasks)
-- The handle_task_completion trigger already overwrites points_awarded server-side
-- based on priority. Add a hardening trigger to force points_awarded to be derived
-- from priority on INSERT and UPDATE by non-admins, ignoring any client-supplied value.
CREATE OR REPLACE FUNCTION public.enforce_task_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always reset points_awarded based on status/priority. The client's value is ignored.
  IF NEW.status = 'completed' THEN
    NEW.points_awarded := CASE NEW.priority
      WHEN 'high' THEN 20
      WHEN 'medium' THEN 15
      ELSE 10
    END;
  ELSE
    NEW.points_awarded := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_task_points_trg ON public.tasks;
CREATE TRIGGER enforce_task_points_trg
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_points();