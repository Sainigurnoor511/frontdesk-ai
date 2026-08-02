do $$
declare
  org record;
  base_slug text;
  candidate_slug text;
  suffix int;
begin
  for org in select id, name from organizations where slug is null loop
    base_slug := lower(trim(regexp_replace(org.name, '[^a-zA-Z0-9]+', '-', 'g')));
    base_slug := trim(both '-' from base_slug);
    if base_slug = '' then
      base_slug := 'business';
    end if;

    candidate_slug := base_slug;
    suffix := 2;

    while exists (select 1 from organizations where slug = candidate_slug) loop
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    update organizations set slug = candidate_slug where id = org.id;
  end loop;
end $$;
