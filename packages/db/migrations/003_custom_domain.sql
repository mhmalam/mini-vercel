-- Extra hostnames a project answers to besides <name>.<base-domain>,
-- space-separated (e.g. "malam.me www.malam.me"). This is what lets the
-- apex domain itself be served by the platform.
alter table projects add column custom_domain text;
