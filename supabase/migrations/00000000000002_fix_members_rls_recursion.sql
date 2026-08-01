drop policy "Members can view their own membership rows" on members;

create policy "Members can view their own membership rows"
  on members for select
  using (user_id = auth.uid());
