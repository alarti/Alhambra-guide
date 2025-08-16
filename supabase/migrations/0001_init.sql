-- Creación de la tabla de perfiles de usuario
-- Esta tabla almacena datos públicos de los usuarios que no deben estar en auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text check (role in ('viewer', 'editor', 'admin')) default 'viewer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Creación de la tabla de guías
create table guides (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  language text not null,
  cover_url text,
  status text check (status in ('draft', 'published')) default 'draft',
  author_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Creación de la tabla de secciones de guías
create table guide_sections (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid references guides(id) on delete cascade,
  "order" integer,
  title text,
  body_md text
);

-- Creación de la tabla de etiquetas
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null
);

-- Creación de la tabla de unión entre guías y etiquetas
create table guide_tags (
  guide_id uuid references guides(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (guide_id, tag_id)
);

-- Creación de la tabla de medios
create table media (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid references guides(id) on delete cascade,
  url text not null,
  alt text,
  kind text
);

-- Creación de índices para optimizar consultas
create index on guides (slug);
create index on guides (status, language);
create index on guide_sections (guide_id, "order");
create index on tags (slug);


-- Función para crear un perfil de usuario al registrarse en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$;

-- Trigger que llama a la función handle_new_user() después de cada inserción en auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
