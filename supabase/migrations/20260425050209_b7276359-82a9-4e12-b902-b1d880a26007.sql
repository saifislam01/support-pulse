-- Update the new-user trigger so signups become support_engineer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  insert into public.user_roles (user_id, role) values (new.id, 'support_engineer');
  return new;
end;
$function$;

-- Manager RLS policies
CREATE POLICY "Managers can view all tasks"
ON public.tasks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can insert tasks for engineers"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update any task"
ON public.tasks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete any task"
ON public.tasks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers view all daily completions"
ON public.daily_task_completions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers view all adjustments"
ON public.point_adjustments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'));