-- Daily 04:15 UTC. Reads project_ref + tasks_purge_secret from Supabase Vault.
-- Add the two secrets via Supabase dashboard -> Database -> Vault before applying:
--   project_ref         = <your project ref, e.g. abcdefghijkl>
--   tasks_purge_secret  = <same value as TASKS_PURGE_SECRET set on the edge function>
do $$ begin
  perform cron.unschedule('tasks-trash-purge-daily');
exception when others then null;
end $$;

select cron.schedule(
  'tasks-trash-purge-daily',
  '15 4 * * *',
  $$
  select net.http_post(
    url := 'https://' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_ref') || '.functions.supabase.co/tasks-trash-purge',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tasks_purge_secret')
    )
  ) as request_id;
  $$
);
