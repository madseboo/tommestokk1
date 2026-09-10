-- Tommestokk1 — admin-dashbord (/admin): aggregert bruksstatistikk.
-- Kjør denne i Supabase → SQL Editor. Forutsetter at schema.sql er kjørt først.
--
-- Funksjonen kjører som security definer og leser derfor forbi RLS (inkl.
-- auth.users). Tilgangen styres av e-postlisten øverst i funksjonen — legg til
-- flere administratorer der ved behov, og kjør hele filen på nytt.

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_eposter constant text[] := array['madsconradi@gmail.com'];
  resultat jsonb;
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = any (admin_eposter)) then
    raise exception 'Ingen tilgang';
  end if;

  select jsonb_build_object(
    'hentet_at',          now(),
    'brukere_totalt',     (select count(*) from auth.users),
    'brukere_30d',        (select count(*) from auth.users
                            where created_at > now() - interval '30 days'),
    'aktive_30d',         (select count(*) from auth.users
                            where last_sign_in_at > now() - interval '30 days'),
    'prosjekter_totalt',  (select count(*) from public.projects),
    'beregninger_totalt', (select count(*) from public.calculations),
    'visninger_totalt',   (select count(*) from public.verktoy_visninger),
    'visninger_7d',       (select count(*) from public.verktoy_visninger
                            where opprettet_at > now() - interval '7 days'),
    'visninger_30d',      (select count(*) from public.verktoy_visninger
                            where opprettet_at > now() - interval '30 days'),

    -- Én rad per verktøy: visninger (totalt og siste 30 dager) + lagrede beregninger.
    'per_verktoy', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'verktoy', verktoy,
               'visninger', coalesce(v.totalt, 0),
               'visninger_30d', coalesce(v.siste30, 0),
               'beregninger', coalesce(b.antall, 0))
             order by coalesce(v.totalt, 0) desc), '[]'::jsonb)
      from (select verktoy, count(*) as totalt,
                   count(*) filter (where opprettet_at > now() - interval '30 days') as siste30
              from public.verktoy_visninger group by verktoy) v
      full outer join (select verktoy, count(*) as antall
                         from public.calculations group by verktoy) b
        using (verktoy)
    ),

    -- Visninger per dag siste 30 dager (norsk tid). Dager uten trafikk mangler
    -- i listen — dashbordet fyller inn nuller selv.
    'per_dag_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('dag', dag, 'antall', antall)
                                order by dag), '[]'::jsonb)
      from (select (opprettet_at at time zone 'Europe/Oslo')::date as dag,
                   count(*) as antall
              from public.verktoy_visninger
             where opprettet_at > now() - interval '30 days'
             group by 1) d
    ),

    -- De ti nyeste kontoene.
    'siste_brukere', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'epost', email,
               'opprettet_at', created_at,
               'sist_innlogget_at', last_sign_in_at)
             order by created_at desc), '[]'::jsonb)
      from (select email, created_at, last_sign_in_at
              from auth.users
             order by created_at desc
             limit 10) u
    )
  ) into resultat;

  return resultat;
end;
$$;

-- Bare innloggede brukere kan i det hele tatt kalle funksjonen;
-- e-postsjekken over avviser alle som ikke står i admin-listen.
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
