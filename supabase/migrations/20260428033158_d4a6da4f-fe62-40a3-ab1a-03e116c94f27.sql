-- Update leaderboard_all view to include daily task completion points and counts
DROP VIEW IF EXISTS public.leaderboard_all;

CREATE VIEW public.leaderboard_all AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.avatar_url,
  (COALESCE(t.total_points, 0::bigint)
   + COALESCE(d.total_points, 0::bigint)
   + COALESCE(a.adj_total, 0::bigint)) AS total_points,
  (COALESCE(t.tasks_completed, 0::bigint)
   + COALESCE(d.tasks_completed, 0::bigint)) AS tasks_completed,
  COALESCE(t.has_high, 0::bigint) AS has_high,
  t.first_completion
FROM profiles p
LEFT JOIN (
  SELECT tasks.user_id,
         sum(tasks.points_awarded) AS total_points,
         count(*) AS tasks_completed,
         sum(CASE WHEN tasks.priority = 'high'::task_priority THEN 1 ELSE 0 END) AS has_high,
         min(tasks.completed_at) AS first_completion
  FROM tasks
  WHERE tasks.status = 'completed'::task_status
  GROUP BY tasks.user_id
) t ON t.user_id = p.id
LEFT JOIN (
  SELECT daily_task_completions.user_id,
         sum(daily_task_completions.points_awarded) AS total_points,
         count(*) AS tasks_completed
  FROM daily_task_completions
  GROUP BY daily_task_completions.user_id
) d ON d.user_id = p.id
LEFT JOIN (
  SELECT point_adjustments.user_id,
         sum(point_adjustments.delta) AS adj_total
  FROM point_adjustments
  GROUP BY point_adjustments.user_id
) a ON a.user_id = p.id;