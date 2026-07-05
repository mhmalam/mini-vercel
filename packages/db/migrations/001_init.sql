create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- becomes the subdomain
  repo_url    text not null,
  branch      text not null default 'main',
  port        int  not null default 3000,    -- port the app listens on inside its container
  created_at  timestamptz not null default now()
);

create table deployments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  commit_sha   text,
  status       text not null default 'queued',
  -- queued | building | deploying | live | failed | stopped | rolled_back
  image_tag    text,
  container_id text,
  host_port    int,
  error        text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index deployments_project_idx on deployments (project_id, created_at desc);

create table build_logs (
  deployment_id uuid not null references deployments(id) on delete cascade,
  seq           bigint not null,
  stream        text not null,               -- stdout | stderr | system
  line          text not null,
  at            timestamptz not null default now(),
  primary key (deployment_id, seq)
);

create table routes (
  subdomain     text primary key,
  deployment_id uuid not null references deployments(id) on delete cascade,
  updated_at    timestamptz not null default now()
);
