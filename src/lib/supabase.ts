import { createClient } from '@supabase/supabase-js';

// Obtener las variables de entorno de Astro
// https://docs.astro.build/en/guides/environment-variables/#default-env-files
const supabaseUrl = import.meta.env.PUBLIC_ASTRO_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_ASTRO_SUPABASE_ANON_KEY;

// Validar que las variables de entorno estén presentes
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key are required.");
}

// Crear y exportar el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
