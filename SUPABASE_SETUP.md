# Guía de Configuración de Supabase

Este documento proporciona una checklist para configurar un nuevo proyecto de Supabase para la Alhambra Guide.

## 1. Creación del Proyecto en Supabase

1.  **Regístrate o inicia sesión en [Supabase](https://supabase.com/).**
2.  **Crea un nuevo proyecto**:
    -   Haz clic en "New Project".
    -   Elige una organización.
    -   Asigna un nombre al proyecto (ej. `alhambra-guide`).
    -   Genera una contraseña segura para la base de datos y guárdala en un lugar seguro.
    -   Elige la región más cercana a tus usuarios.
    -   Espera a que el proyecto se aprovisione.
3.  **Obtén las claves de API**:
    -   En el dashboard de tu proyecto, ve a `Settings` > `API`.
    -   Copia los siguientes valores:
        -   **Project URL**: Esta será tu variable `PUBLIC_ASTRO_SUPABASE_URL`.
        -   **Project API Keys** > `anon` `public`: Esta será tu variable `PUBLIC_ASTRO_SUPABASE_ANON_KEY`.

## 2. Configuración de Autenticación con Google

1.  **Habilita el proveedor de Google en Supabase**:
    -   Ve a `Authentication` > `Providers` en el dashboard de Supabase.
    -   Activa el proveedor de **Google**.
    -   Verás que necesitas un **Client ID** y un **Client Secret**. También verás una URL de redirección (`Redirect URI`). Cópiala.

2.  **Crea credenciales OAuth en Google Cloud Platform (GCP)**:
    -   Ve a la [Consola de Google Cloud](https://console.cloud.google.com/).
    -   Crea un nuevo proyecto o selecciona uno existente.
    -   En el menú de navegación, ve a `APIs & Services` > `Credentials`.
    -   Haz clic en `+ CREATE CREDENTIALS` y selecciona `OAuth client ID`.
    -   Si se te solicita, configura la pantalla de consentimiento (`OAuth consent screen`).
        -   **User Type**: `External`.
        -   Rellena el nombre de la aplicación, el email de soporte y la información de contacto del desarrollador.
        -   En `Authorized domains`, añade el dominio de tu proveedor de Supabase (ej. `*.supabase.co`).
    -   Vuelve a la creación de credenciales:
        -   **Application type**: `Web application`.
        -   **Authorized JavaScript origins**: Añade la URL de tu proyecto de Supabase.
        -   **Authorized redirect URIs**:
            -   Pega la **URL de redirección** que copiaste del dashboard de Supabase.
            -   Añade las URLs para el desarrollo local: `http://localhost:4321` (puerto por defecto de Astro).
            -   Añade la URL de tu sitio en producción cuando la tengas (ej. `https://your-domain.com`).
    -   Haz clic en `Create`.
    -   Copia el **Client ID** y el **Client Secret** que se han generado.

3.  **Configura las credenciales en Supabase**:
    -   Vuelve al dashboard de Supabase (`Authentication` > `Providers` > `Google`).
    -   Pega el **Client ID** y el **Client Secret** que obtuviste de GCP.
    -   Haz clic en `Save`.

## 3. Variables de Entorno

Crea un archivo `.env` en la raíz de tu proyecto Astro con las siguientes variables:

```env
# Claves públicas de Supabase para el cliente
PUBLIC_ASTRO_SUPABASE_URL="tu-supabase-url-aqui"
PUBLIC_ASTRO_SUPABASE_ANON_KEY="tu-supabase-anon-key-aqui"
```

**Importante**: Nunca compartas claves `service_role` ni secretos en el código del frontend.

## 4. Configuración de Storage

1.  **Crea un Bucket**:
    -   En el dashboard de Supabase, ve a `Storage`.
    -   Haz clic en `New Bucket`.
    -   Nombra el bucket `guides`.
    -   **Deja el bucket como privado por ahora**. Configuraremos el acceso público a través de políticas más adelante.
2.  **Políticas de Acceso (se configurarán con el esquema SQL)**:
    -   **Lectura pública**: Se creará una política para permitir la lectura de objetos a cualquier usuario si la URL se conoce.
    -   **Escritura restringida**: Solo los usuarios con rol `editor` o `admin` podrán subir, actualizar o eliminar imágenes en este bucket.

## 5. Uso de Supabase CLI (Opcional)

Para gestionar las migraciones de la base de datos localmente de forma segura:

1.  **Instala la Supabase CLI**: Sigue la [guía oficial](https://supabase.com/docs/guides/cli).
2.  **Inicia sesión**: `supabase login`.
3.  **Vincula tu proyecto**: `supabase link --project-ref <tu-project-id>`. El ID del proyecto está en la URL del dashboard.
4.  **Genera nuevas migraciones**: `supabase db diff -f <nombre_migracion>`.
5.  **Aplica migraciones locales**: `supabase db push`.

Esto evita tener que pegar SQL directamente en el editor de Supabase y mantiene un historial de cambios versionado.
