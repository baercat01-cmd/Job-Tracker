-- Refresh PostgREST schema cache so new columns/functions are visible to the API.
-- Run this in Supabase SQL Editor after adding columns or RPCs (e.g. after add-quote-sent-columns.sql and mark-proposal-as-sent-rpc.sql).
-- Run BOTH statements (order matters): first the queue refresh, then the notify.

select pg_notification_queue_usage();
NOTIFY pgrst, 'reload schema';
