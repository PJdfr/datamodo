-- The production inbound domain is datamodo.dev (Cloudflare Email Routing
-- catch-all). Point handle_new_user() at it and migrate any addresses minted
-- under the earlier datamodo.email / in.datamodo.email placeholders in place.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_name   text := coalesce(new.raw_user_meta_data ->> 'full_name',
                            split_part(new.email, '@', 1));
  v_addr   text := substr(md5(random()::text || new.id::text), 1, 12)
                   || '@' || 'datamodo.dev';
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name);

  insert into public.organizations (name, slug, is_personal, created_by)
  values (v_name, 'personal-' || substr(new.id::text, 1, 8), true, new.id)
  returning id into v_org_id;

  insert into public.organization_members (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  insert into public.forwarding_addresses (org_id, owner_user_id, address, label)
  values (v_org_id, new.id, v_addr, 'Personal inbox');

  return new;
end;
$$;

update public.forwarding_addresses
   set address = regexp_replace(address, '@(in\.)?datamodo\.email$', '@datamodo.dev')
 where address like '%@datamodo.email' or address like '%@in.datamodo.email';
