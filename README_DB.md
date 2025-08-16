# Documentación de la Base de Datos

Este documento detalla el esquema de la base de datos PostgreSQL en Supabase, incluyendo las tablas, relaciones y políticas de seguridad (RLS).

## 1. Descripción General

La base de datos está diseñada para almacenar todo el contenido de las guías interactivas. La seguridad se gestiona a nivel de fila (RLS), permitiendo un acceso granular a los datos basado en el rol del usuario que realiza la consulta.

## 2. Esquema de Tablas

### `profiles`
Almacena información pública y el rol de los usuarios. Se vincula 1 a 1 con la tabla `auth.users` de Supabase.

-   `id` (uuid, pk): Referencia a `auth.users.id`.
-   `email` (text): Email del usuario.
-   `role` (text): Rol del usuario (`viewer`, `editor`, `admin`). Por defecto `viewer`.
-   `created_at`, `updated_at`: Timestamps de auditoría.

### `guides`
Contiene la información principal de cada guía.

-   `id` (uuid, pk): Identificador único.
-   `slug` (text, unique): URL amigable para la guía.
-   `title` (text): Título de la guía.
-   `summary` (text): Resumen corto.
-   `language` (text): Idioma principal de la guía (ej. 'es', 'en').
-   `cover_url` (text): URL a la imagen de portada en Supabase Storage.
-   `status` (text): Estado de la guía (`draft`, `published`). Por defecto `draft`.
-   `author_id` (uuid, fk): Referencia al autor en `auth.users`.

### `guide_sections`
Almacena las secciones de contenido de una guía.

-   `id` (uuid, pk): Identificador único.
-   `guide_id` (uuid, fk): Referencia a la guía padre.
-   `order` (integer): Orden de la sección dentro de la guía.
-   `title` (text): Título de la sección.
-   `body_md` (text): Contenido de la sección en formato Markdown.

### `tags` y `guide_tags`
Sistema de etiquetado para las guías.

-   `tags`:
    -   `id` (uuid, pk), `name` (text, unique), `slug` (text, unique).
-   `guide_tags` (tabla de unión):
    -   `guide_id` (uuid, fk), `tag_id` (uuid, fk).

### `media`
Almacena referencias a archivos multimedia (imágenes, etc.) asociados a una guía.

-   `id` (uuid, pk): Identificador único.
-   `guide_id` (uuid, fk): Referencia a la guía padre.
-   `url` (text): URL al archivo en Supabase Storage.
-   `alt` (text): Texto alternativo.
-   `kind` (text): Tipo de medio (ej. 'image', 'video').

## 3. Políticas de Seguridad (Row Level Security)

RLS está habilitado en todas las tablas para garantizar que los usuarios solo puedan acceder a los datos que les corresponden.

-   **Acceso Público (`anon`, `viewer`)**:
    -   Pueden leer **únicamente** las guías con `status = 'published'`.
    -   Pueden leer las secciones, etiquetas y medios asociados a guías publicadas.
-   **Acceso de Autor**:
    -   Un usuario puede leer **todas** sus propias guías, incluyendo las que están en estado `draft`.
-   **Acceso de Editor/Admin (`editor`, `admin`)**:
    -   Pueden realizar cualquier operación (Crear, Leer, Actualizar, Borrar) en **todas** las tablas (`guides`, `guide_sections`, `tags`, `media`, etc.).
-   **Perfiles (`profiles`)**:
    -   Cualquier usuario autenticado puede leer y actualizar **su propio** perfil. Nadie puede ver perfiles ajenos (excepto un admin en el futuro, con políticas adicionales).

## 4. Consultas de Verificación (Ejemplos con `supabase-js`)

Estas consultas pueden usarse en el frontend para verificar que las políticas RLS funcionan correctamente.

### Como usuario `anon` (no autenticado):
```javascript
// Debería devolver solo las guías publicadas
const { data, error } = await supabase.from('guides').select('*');
```

### Como usuario `viewer` (autenticado):
```javascript
// Debería devolver solo las guías publicadas
const { data: guides, error: guidesError } = await supabase.from('guides').select('*');

// Debería devolver el perfil del usuario actual
const { data: profile, error: profileError } = await supabase.from('profiles').select('*').single();
```

### Como usuario `editor`:
```javascript
// Debería devolver TODAS las guías (publicadas y borradores)
const { data, error } = await supabase.from('guides').select('*');

// Debería permitir crear una nueva guía
const { error: insertError } = await supabase.from('guides').insert({
  slug: 'nueva-guia-test',
  title: 'Nueva Guía de Prueba',
  language: 'es',
  author_id: 'user-uuid-del-editor' // Se debe obtener del usuario autenticado
});

// Debería permitir actualizar una guía
const { error: updateError } = await supabase.from('guides').update({ status: 'draft' }).eq('slug', 'nueva-guia-test');

// Debería permitir eliminar una guía
const { error: deleteError } = await supabase.from('guides').delete().eq('slug', 'nueva-guia-test');
```

### Cómo promover un usuario a `editor`
Esta operación requiere privilegios de `service_role` y debe ejecutarse en un entorno seguro (backend, script de confianza o directamente en el dashboard de Supabase), **NUNCA en el cliente**.

```sql
-- Desde el editor SQL de Supabase o usando un cliente con la service_role_key
update public.profiles
set role = 'editor'
where id = 'uuid-del-usuario-a-promover';
```
