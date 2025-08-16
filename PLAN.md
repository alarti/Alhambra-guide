# Plan de Arquitectura: Alhambra Guide con Supabase

Este documento describe la arquitectura y el plan de desarrollo para migrar la aplicación Alhambra Guide a una infraestructura sin backend propio, basada en Supabase.

## 1. Arquitectura General

La nueva arquitectura se basará en un stack desacoplado:

-   **Frontend**: Un proyecto **Astro** que se encarga de la renderización de la UI, la gestión del estado y la interacción con el usuario.
-   **Backend (BaaS)**: **Supabase** proporcionará todos los servicios de backend necesarios.
    -   **Authentication**: Gestión de usuarios a través de proveedores OAuth (inicialmente Google). El frontend interactuará directamente con Supabase Auth.
    -   **Database**: Una base de datos **PostgreSQL** donde se almacenará todo el contenido (guías, perfiles, etc.). La seguridad se garantizará mediante **Row Level Security (RLS)**, permitiendo al frontend leer y escribir datos directamente según las políticas de permisos.
    -   **Storage**: Para el almacenamiento de imágenes (portadas de guías, medios de las secciones) de forma segura, con políticas de acceso integradas con Auth y RLS.
-   **SDK**: El cliente `supabase-js` se utilizará en el frontend para todas las interacciones con Supabase.

## 2. Módulos del Proyecto

El desarrollo se dividirá en los siguientes módulos funcionales:

1.  **Autenticación (`auth`)**: Flujo de inicio y cierre de sesión con Google. Gestión de la sesión del usuario en el cliente.
2.  **Datos (`data`)**:
    -   **Guías**: Creación, lectura, actualización y borrado (CRUD) de guías.
    -   **Secciones**: Contenido de cada guía, ordenado y editable.
    -   **Etiquetas (`tags`)**: Sistema de categorización para las guías.
    -   **Media**: Referencias a imágenes y otros medios asociados a las guías.
3.  **Almacenamiento (`storage`)**: Subida y gestión de imágenes para las guías.
4.  **Sincronización Markdown (Opcional)**: Un script para publicar contenido desde archivos Markdown locales a la base de datos de Supabase. Ideal para flujos de trabajo basados en Git.
5.  **Mejoras Generales**:
    -   **i18n y Slugs**: Soporte básico para URLs amigables e internacionalización.
    -   **SEO**: Mejoras básicas de SEO aprovechando las capacidades de Astro.
    -   **DX y Despliegue**: Linters, formateadores, scripts de prueba y configuración para un despliegue sencillo en Vercel/Netlify.

## 3. Matriz de Permisos (Roles y RLS)

Se definirán tres roles de usuario principales:

| Rol             | Permisos                                                                                                   |
| :-------------- | :--------------------------------------------------------------------------------------------------------- |
| **`anon`**      | (Usuario no autenticado) Puede leer todas las guías publicadas (`status = 'published'`). No puede escribir. |
| **`viewer`**    | (Usuario autenticado) Mismos permisos que `anon`. Puede ver su propio perfil.                              |
| **`editor`**    | Puede crear, leer, actualizar y eliminar **cualquier** guía, sección, etiqueta o medio.                      |
| **`admin`**     | Mismos permisos que `editor`, con la capacidad adicional de gestionar roles de usuario (futuro).           |

## 4. Riesgos y Mitigaciones

-   **RLS mal configurada**: Una política de RLS incorrecta podría exponer datos privados o bloquear el acceso legítimo.
    -   **Mitigación**: Pruebas exhaustivas para cada rol y operación. Documentar las políticas claramente.
-   **Gestión de Redirect URIs de OAuth**: Una configuración incorrecta puede romper el flujo de login en diferentes entornos (local, producción).
    -   **Mitigación**: Documentar claramente las variables de entorno y los pasos de configuración para cada entorno.
-   **Exposición de Claves**: Las claves de Supabase no deben ser expuestas en el repositorio.
    -   **Mitigación**: Uso estricto de variables de entorno (`.env.local`) y secrets de GitHub Actions.
-   **Límites y Cuotas (Throttling)**: El plan gratuito de Supabase tiene límites de uso.
    -   **Mitigación**: Optimizar consultas, comprimir imágenes y monitorizar el uso.
-   **CORS**: Problemas de Cross-Origin Resource Sharing al intentar acceder a Supabase desde el navegador.
    -   **Mitigación**: Configurar los orígenes permitidos en el panel de Supabase.

## 5. Roadmap por Ramas (PRs)

El proyecto se desarrollará de forma iterativa a través de las siguientes ramas y Pull Requests:

1.  **`plan/supabase`**: Creación de este documento `PLAN.md`.
2.  **`setup/supabase`**: Documentación para la configuración de Supabase y Google OAuth (`SUPABASE_SETUP.md`) y plantilla de entorno (`.env.example`).
3.  **`feat/db-schema`**: Creación del esquema SQL, políticas RLS y seeds iniciales en `supabase/migrations`.
4.  **`feat/auth-frontend`**: Integración del SDK de Supabase en Astro, implementación del login con Google y guardias de rutas/componentes.
5.  **`feat/data-queries`**: Implementación de las consultas para leer y escribir datos (CRUD) respetando las políticas RLS.
6.  **`feat/storage`**: Implementación de la subida de imágenes a Supabase Storage.
7.  **`chore/tests-dx`**: Configuración de linters y creación de scripts de prueba (smoke tests).
8.  **`docs/ops-deploy`**: Creación de la documentación operativa final y guías de despliegue.
9.  **`feat/md-sync` (Opcional)**: Script y workflow de CI para publicar guías desde archivos Markdown.
10. **`main`**: PR final de integración y resumen del proyecto.
