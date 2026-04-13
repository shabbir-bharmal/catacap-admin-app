ALTER TABLE public.scheduler_configurations
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

UPDATE public.scheduler_configurations
  SET is_enabled = true
  WHERE is_enabled = false;
