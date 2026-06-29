import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Las variables se comprueban en tiempo de ejecución al llamar a las fábricas para evitar fallos de compilación estática.

/**
 * Cliente con permisos administrativos completos.
 * Salta políticas RLS. Reservado para tareas de sistema (bootstrap, storage, cron job).
 */
export function createAdminClient() {
  if (!supabaseUrl) {
    throw new Error('Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseServiceKey) {
    throw new Error('Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY para el cliente administrativo');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Cliente con el contexto y JWT del usuario actual.
 * Evalúa políticas RLS en base de datos para garantizar aislamiento tenant.
 * @param accessToken Token JWT (access_token) extraído de la cookie de sesión del usuario.
 */
export function createUserClient(accessToken: string) {
  if (!supabaseUrl) {
    throw new Error('Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Falta la variable de entorno NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
