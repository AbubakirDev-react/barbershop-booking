-- Каждые 5 минут cron вызывает Edge Function send-reminders. Секрет берётся
-- из Vault в момент вызова и нигде не хранится в открытом виде.
select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://ihpqnoobjlcpozusxomd.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
