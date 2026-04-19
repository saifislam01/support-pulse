-- Daily task templates (the recurring checklist)
CREATE TABLE public.daily_task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON public.daily_task_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage templates"
  ON public.daily_task_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Per-user, per-day completions
CREATE TABLE public.daily_task_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.daily_task_templates(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id, completion_date)
);

CREATE INDEX idx_daily_completions_user_date
  ON public.daily_task_completions(user_id, completion_date);

ALTER TABLE public.daily_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their daily completions"
  ON public.daily_task_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all daily completions"
  ON public.daily_task_completions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert their daily completions"
  ON public.daily_task_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their daily completions"
  ON public.daily_task_completions FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-fill points_awarded from template at insert time
CREATE OR REPLACE FUNCTION public.set_daily_completion_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.points_awarded IS NULL OR NEW.points_awarded = 0 THEN
    SELECT points INTO NEW.points_awarded
    FROM public.daily_task_templates
    WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_daily_completion_points
  BEFORE INSERT ON public.daily_task_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_completion_points();

-- Notification on daily task completion
CREATE OR REPLACE FUNCTION public.notify_daily_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tname TEXT;
BEGIN
  SELECT name INTO tname FROM public.daily_task_templates WHERE id = NEW.template_id;
  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    NEW.user_id,
    'daily_task_completed',
    'Daily task completed',
    COALESCE(tname, 'Daily task') || ' · +' || NEW.points_awarded || ' pts',
    jsonb_build_object('template_id', NEW.template_id, 'points', NEW.points_awarded, 'date', NEW.completion_date)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_daily_task_completed
  AFTER INSERT ON public.daily_task_completions
  FOR EACH ROW EXECUTE FUNCTION public.notify_daily_task_completed();

-- Seed the 12 predefined daily tasks
INSERT INTO public.daily_task_templates (name, points, sort_order) VALUES
  ('Slack Check', 10, 1),
  ('Unassigned Tickets', 10, 2),
  ('Assigned Tickets', 10, 3),
  ('Live Chat', 10, 4),
  ('WordPress Forum/FB Community/AppSumo', 10, 5),
  ('Github Issue Progress', 10, 6),
  ('Meetings', 15, 7),
  ('Sum up Evaluation', 15, 8),
  ('Collaboration with Developer/team mates', 10, 9),
  ('Issue Investigation', 15, 10),
  ('Tickets & Live chat Evaluation', 15, 11),
  ('Quarter Personal Evaluation', 20, 12);