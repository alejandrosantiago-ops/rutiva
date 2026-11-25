-- Rutiva · esquema de sincronización para Supabase (PostgreSQL).
-- Ejecuta este archivo una vez en el SQL Editor de tu proyecto de Supabase.
--
-- Diseño: una tabla genérica de registros por usuario. Cada fila es un
-- registro de la app (hábito, cumplimiento de un día, agua, noche o ajustes)
-- guardado como JSON, con:
--   updated_at → cuándo se editó en el teléfono (decide qué versión gana)
--   synced_at  → cuándo lo recibió el servidor (cursor para descargar cambios)
-- La seguridad la garantiza Row Level Security: cada usuario solo puede leer
-- y escribir sus propias filas.

create table if not exists public.rutiva_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('habit', 'log', 'water', 'sleep', 'settings')),
  key        text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, key)
);

create index if not exists rutiva_records_user_synced on public.rutiva_records (user_id, synced_at);

alter table public.rutiva_records enable row level security;

-- Los proyectos nuevos de Supabase no conceden permisos automáticos sobre las
-- tablas: se dan solo a usuarios con sesión. RLS (abajo) limita a sus filas.
grant usage on schema public to authenticated;
grant select, insert, update on public.rutiva_records to authenticated;

drop policy if exists "rutiva: leer lo propio" on public.rutiva_records;
create policy "rutiva: leer lo propio" on public.rutiva_records
  for select using (user_id = auth.uid());

drop policy if exists "rutiva: escribir lo propio" on public.rutiva_records;
create policy "rutiva: escribir lo propio" on public.rutiva_records
  for insert with check (user_id = auth.uid());

drop policy if exists "rutiva: actualizar lo propio" on public.rutiva_records;
create policy "rutiva: actualizar lo propio" on public.rutiva_records
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Subida de cambios: guarda cada registro solo si es más reciente que el que
-- ya existe ("gana la última edición"), así ningún teléfono pisa datos nuevos
-- con datos viejos. Se ejecuta con los permisos del usuario (RLS aplica).
create or replace function public.rutiva_push(records jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión';
  end if;
  for r in select * from jsonb_array_elements(records) loop
    insert into public.rutiva_records as t (user_id, kind, key, data, updated_at, synced_at)
    values (auth.uid(), r->>'kind', r->>'key', r->'data', (r->>'updated_at')::timestamptz, clock_timestamp())
    on conflict (user_id, kind, key) do update
      set data = excluded.data,
          updated_at = excluded.updated_at,
          synced_at = clock_timestamp()
      where t.updated_at < excluded.updated_at;
  end loop;
end;
$$;

grant execute on function public.rutiva_push(jsonb) to authenticated;
