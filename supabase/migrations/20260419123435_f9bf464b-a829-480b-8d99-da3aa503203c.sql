-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update their notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Trigger: create notification on task completion
CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (
      NEW.user_id,
      'task_completed',
      'Task completed',
      NEW.name || ' · +' || NEW.points_awarded || ' pts',
      jsonb_build_object('task_id', NEW.id, 'points', NEW.points_awarded, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_completed
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_completed();

-- Point adjustments table (admin manual bonuses)
CREATE TABLE public.point_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_point_adjustments_user ON public.point_adjustments(user_id);

ALTER TABLE public.point_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage adjustments"
  ON public.point_adjustments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view their adjustments"
  ON public.point_adjustments FOR SELECT
  USING (auth.uid() = user_id);

-- Notify user on point adjustment
CREATE OR REPLACE FUNCTION public.notify_point_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    NEW.user_id,
    'points_adjusted',
    CASE WHEN NEW.delta >= 0 THEN 'Bonus points awarded' ELSE 'Points adjusted' END,
    (CASE WHEN NEW.delta >= 0 THEN '+' ELSE '' END) || NEW.delta || ' pts' ||
      COALESCE(' · ' || NEW.reason, ''),
    jsonb_build_object('delta', NEW.delta, 'reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_point_adjustment
AFTER INSERT ON public.point_adjustments
FOR EACH ROW EXECUTE FUNCTION public.notify_point_adjustment();

-- Recreate leaderboard view to include adjustments
DROP VIEW IF EXISTS public.leaderboard_all;
CREATE VIEW public.leaderboard_all
WITH (security_invoker = on)
AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.avatar_url,
  COALESCE(t.total_points, 0) + COALESCE(a.adj_total, 0) AS total_points,
  COALESCE(t.tasks_completed, 0) AS tasks_completed,
  COALESCE(t.has_high, 0) AS has_high,
  t.first_completion
FROM public.profiles p
LEFT JOIN (
  SELECT
    user_id,
    SUM(points_awarded) AS total_points,
    COUNT(*) AS tasks_completed,
    SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS has_high,
    MIN(completed_at) AS first_completion
  FROM public.tasks
  WHERE status = 'completed'
  GROUP BY user_id
) t ON t.user_id = p.id
LEFT JOIN (
  SELECT user_id, SUM(delta) AS adj_total
  FROM public.point_adjustments
  GROUP BY user_id
) a ON a.user_id = p.id;