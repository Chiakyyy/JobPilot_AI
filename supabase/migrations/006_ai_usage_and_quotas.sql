-- This migration creates the ai usage logs table with row level security and daily quota indexing.
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('cv_analysis', 'interview_prep')),
  offer_id uuid REFERENCES public.job_offers(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  request_id text NOT NULL,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT ai_usage_logs_user_feature_idempotency_key UNIQUE (user_id, feature, idempotency_key)
);

-- These indexes speed up daily quota verification and recent telemetry sorting.
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_quota
  ON public.ai_usage_logs (user_id, feature, usage_date, status);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
  ON public.ai_usage_logs (created_at DESC);

-- These statements configure access permissions and row level security for usage logs.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON TABLE public.ai_usage_logs TO authenticated;
GRANT ALL ON TABLE public.ai_usage_logs TO service_role;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- This policy allows authenticated users to read only their own usage logs.
CREATE POLICY "Users can read own ai usage logs"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
