-- 1. Helper function to get the role of the current user
create or replace function get_my_role()
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return 'anon';
  else
    return (select role from profiles where id = auth.uid());
  end if;
end;
$$;

-- 2. Habilitar RLS en todas las tablas
alter table profiles enable row level security;
alter table guides enable row level security;
alter table guide_sections enable row level security;
alter table tags enable row level security;
alter table guide_tags enable row level security;
alter table media enable row level security;

-- 3. Políticas para la tabla `profiles`
-- Los usuarios pueden ver su propio perfil.
create policy "Users can view their own profile" on profiles for select
  using (auth.uid() = id);
-- Los usuarios pueden actualizar su propio perfil.
create policy "Users can update their own profile" on profiles for update
  using (auth.uid() = id);

-- 4. Políticas para la tabla `guides`
-- Lectura pública de guías publicadas
create policy "Public can read published guides" on guides for select
  to anon, authenticated
  using (status = 'published');

-- Los autores pueden ver sus propias guías (borradores incluidos)
create policy "Authors can read their own guides" on guides for select
  using (auth.uid() = author_id);

-- Los editores/admins pueden leer todas las guías
create policy "Editors can read all guides" on guides for select
  using (get_my_role() in ('editor', 'admin'));

-- Los editores/admins pueden escribir en las guías
create policy "Editors can write to guides" on guides for insert, update, delete
  with check (get_my_role() in ('editor', 'admin'));


-- 5. Políticas para tablas relacionadas (sections, tags, media)
-- La lógica de lectura es: si puedes ver la guía, puedes ver sus partes.

-- `guide_sections`
create policy "Public can read sections of published guides" on guide_sections for select
  using (
    exists (
      select 1 from guides where id = guide_sections.guide_id and status = 'published'
    )
  );
create policy "Editors and authors can read all sections" on guide_sections for select
  using (
    get_my_role() in ('editor', 'admin') or
    exists (select 1 from guides where id = guide_sections.guide_id and author_id = auth.uid())
  );
create policy "Editors can write to guide_sections" on guide_sections for insert, update, delete
  with check (get_my_role() in ('editor', 'admin'));

-- `tags` (las etiquetas son públicas por definición)
create policy "Public can read all tags" on tags for select
  using (true);
create policy "Editors can write to tags" on tags for insert, update, delete
  with check (get_my_role() in ('editor', 'admin'));

-- `guide_tags`
create policy "Public can read tags of published guides" on guide_tags for select
  using (
    exists (
      select 1 from guides where id = guide_tags.guide_id and status = 'published'
    )
  );
create policy "Editors and authors can read all guide_tags" on guide_tags for select
  using (
    get_my_role() in ('editor', 'admin') or
    exists (select 1 from guides where id = guide_tags.guide_id and author_id = auth.uid())
  );
create policy "Editors can write to guide_tags" on guide_tags for insert, update, delete
  with check (get_my_role() in ('editor', 'admin'));

-- `media`
create policy "Public can read media of published guides" on media for select
  using (
    exists (
      select 1 from guides where id = media.guide_id and status = 'published'
    )
  );
create policy "Editors and authors can read all media" on media for select
  using (
    get_my_role() in ('editor', 'admin') or
    exists (select 1 from guides where id = media.guide_id and author_id = auth.uid())
  );
create policy "Editors can write to media" on media for insert, update, delete
  with check (get_my_role() in ('editor', 'admin'));
