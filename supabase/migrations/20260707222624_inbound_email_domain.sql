-- Switch the inbound-email domain from the in.datamodo.email placeholder to the
-- production apex datamodo.email (Cloudflare Email Routing catch-all). New users
-- get an @datamodo.email forwarding address; existing addresses are migrated in
-- place (same local part, new domain) so already-issued inboxes keep resolving.

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
                   || '@' || 'datamodo.email';
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

-- Migrate existing placeholder addresses in place (keep the token, swap domain).
update public.forwarding_addresses
   set address = replace(address, '@in.datamodo.email', '@datamodo.email')
 where address like '%@in.datamodo.email';
