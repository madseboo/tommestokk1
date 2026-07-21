-- Tommestokk1 — databaseskjema for prosjekter og lagrede beregninger.
-- Kjør denne i Supabase → SQL Editor på et nytt prosjekt.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  navn text not null,
  opprettet_at timestamptz not null default now()
);

create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  verktoy text not null check (verktoy in ('terrasse','dryppstop','rekkverk','parkett','kledning','levegg','pergola','utemaling','belegningsstein')),
  inndata jsonb not null default '{}'::jsonb,
  resultat jsonb not null default '{}'::jsonb,
  opprettet_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists calculations_project_id_idx on public.calculations(project_id);

alter table public.projects enable row level security;
alter table public.calculations enable row level security;

-- projects: bruker kan kun se/endre egne rader
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- calculations: eierskap går via prosjektets user_id (ingen user_id-kolonne her)
create policy "calculations_select_own" on public.calculations
  for select using (
    exists (select 1 from public.projects p where p.id = calculations.project_id and p.user_id = auth.uid())
  );
create policy "calculations_insert_own" on public.calculations
  for insert with check (
    exists (select 1 from public.projects p where p.id = calculations.project_id and p.user_id = auth.uid())
  );
create policy "calculations_delete_own" on public.calculations
  for delete using (
    exists (select 1 from public.projects p where p.id = calculations.project_id and p.user_id = auth.uid())
  );
create policy "calculations_update_own" on public.calculations
  for update using (
    exists (select 1 from public.projects p where p.id = calculations.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = calculations.project_id and p.user_id = auth.uid())
  );
