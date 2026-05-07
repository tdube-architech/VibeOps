// Supabase Edge Function — invoked daily by pg_cron (0030_tasks_purge_cron.sql).
// Hard-deletes tasks whose deleted_at is older than 30 days.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${Deno.env.get('TASKS_PURGE_SECRET') ?? ''}`;
  if (!auth || auth !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('tasks')
    .delete({ count: 'exact' })
    .lt('deleted_at', cutoff);
  if (error) {
    console.error('[purge] error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ purged: count ?? 0, cutoff }), {
    headers: { 'content-type': 'application/json' }
  });
});
