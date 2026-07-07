-- Fix: infinite recursion (42P17) between the agents and agent_shares RLS
-- policies. `agents_select_scoped` read `agent_shares` directly, whose own
-- select policy reads `agents` back — a cycle. Break it the same way the orgs
-- migration handles organization_members: a SECURITY DEFINER helper in the
-- private schema that reads agent_shares with RLS bypassed.

create or replace function private.is_shared_with_me(p_agent uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.agent_shares s
    where s.agent_id = p_agent
      and s.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_shared_with_me(uuid) from public;
grant execute on function private.is_shared_with_me(uuid) to authenticated;

drop policy if exists "agents_select_scoped" on public.agents;
create policy "agents_select_scoped" on public.agents
  for select to authenticated
  using (
    private.is_org_member(org_id)
    and (
      scope = 'org'
      or owner_user_id = (select auth.uid())
      or (scope = 'people' and private.is_shared_with_me(id))
    )
  );
