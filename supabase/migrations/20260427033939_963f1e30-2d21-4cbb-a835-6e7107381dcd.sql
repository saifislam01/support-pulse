-- Create team_messages table for realtime team chat
CREATE TABLE public.team_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_messages_created_at ON public.team_messages(created_at DESC);

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Any authenticated user (admin/manager/support_engineer) can read all messages
CREATE POLICY "Authenticated users can view team messages"
ON public.team_messages
FOR SELECT
TO authenticated
USING (true);

-- Users can post messages as themselves
CREATE POLICY "Users can post team messages"
ON public.team_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages; admins can delete any
CREATE POLICY "Users can delete own messages"
ON public.team_messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER TABLE public.team_messages REPLICA IDENTITY FULL;