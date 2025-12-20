-- Add fields to store reading snapshots and STEMI metadata
ALTER TABLE public.emergency_alerts
  ADD COLUMN IF NOT EXISTS stemi_level DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS reading_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Index for quick queries by stemi level
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_stemi_level ON public.emergency_alerts(stemi_level);
