alter table organizations add column if not exists slug text unique;

create index if not exists organizations_slug_idx on organizations (slug);
