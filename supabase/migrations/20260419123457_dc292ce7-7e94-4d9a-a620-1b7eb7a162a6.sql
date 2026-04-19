DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Service role inserts notifications"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (true);