-- supabase/reset.sql
--
-- Empties the study data (sessions and their trials) but keeps the item pool. Run it in the Supabase
-- SQL Editor after the storage contract test and after any dry run, so that only real participants
-- are in the database when the study starts. It cannot be undone.
truncate table public.trials, public.sessions;
