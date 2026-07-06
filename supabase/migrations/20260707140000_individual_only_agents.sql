-- Individual-only product: agents are never shared. Remove all agent
-- scoping/sharing. Each agent is private to its owner. The per-user "personal
-- org" stays as an invisible data boundary, but users can no longer create
-- additional (team) organizations.

-- The scope-aware select policy and the shares helper go first (they depend on
-- the scope column / agent_shares table).
drop policy if exists "agents_select_scoped" on public.agents;
drop function if exists private.is_shared_with_me(uuid);
drop table if exists public.agent_shares;

alter table public.agents drop column if exists scope;
drop type if exists public.agent_scope;

-- Owner-only visibility.
create policy "agents_select_own" on public.agents
  for select to authenticated
  using (owner_user_id = (select auth.uid()) and private.is_org_member(org_id));

-- No team organizations: remove the create-org RPC from the API roles.
revoke execute on function public.create_organization(text) from authenticated;
