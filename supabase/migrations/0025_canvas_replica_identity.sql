-- Supabase Realtime filters postgres_changes events server-side using
-- the row's REPLICA IDENTITY. The default is PK-only, but our channel
-- filter is `canvas_id=eq.<id>` which is NOT in the PK on canvas_edges
-- or canvas_nodes. Without REPLICA IDENTITY FULL, edge INSERT events
-- are silently dropped from filtered subscriptions, causing the
-- "user A draws an edge, user B doesn't see it" sync gap.

alter table public.canvas_edges replica identity full;
alter table public.canvas_nodes replica identity full;
