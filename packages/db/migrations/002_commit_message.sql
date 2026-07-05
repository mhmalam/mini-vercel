-- Vercel-style cards show what each deployment actually shipped.
alter table deployments add column commit_message text;
