import { NextRequest } from 'next/server';
import { verifySessionToken } from './jwt-utils';
import { createAdminClient } from './supabase-server';

/**
 * Interfaz para los datos extraídos de la sesión verificada
 */
export interface AuthenticatedSession {
  accessToken: string;
  orgId: string;
  role: string;
  userId: string;
}

/**
 * Valida la sesión (JWT en cookie httpOnly) y el control CSRF (Double-Submit Token).
 * @param request Objeto NextRequest de la ruta API.
 * @returns Retorna la sesión autenticada con los tokens y datos de organización del usuario.
 */
export async function verifySessionAndCsrf(request: NextRequest): Promise<AuthenticatedSession> {
  // 1. Validar cookies de sesión y CSRF
  const sessionCookie = request.cookies.get('session_token')?.value;
  const csrfCookie = request.cookies.get('csrf_token')?.value;
  const csrfHeader = request.headers.get('x-csrf-token');

  if (!sessionCookie) {
    throw new Error('No autorizado: Sesión inexistente');
  }

  // 2. Verificar integridad y expiración del JWT de sesión
  let sessionPayload;
  try {
    sessionPayload = await verifySessionToken(sessionCookie);
  } catch {
    throw new Error('No autorizado: Sesión inválida o expirada');
  }

  // 3. Validación CSRF Double-Submit Token (Solo para métodos mutables: POST, PATCH, PUT, DELETE)
  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (!isSafeMethod) {
    if (!csrfCookie || !csrfHeader) {
      throw new Error('Validación de Red Fallida: Faltan tokens de control CSRF');
    }

    if (csrfCookie !== csrfHeader) {
      throw new Error('Validación de Red Fallida: Discrepancia en Token CSRF (Double-Submit)');
    }

    if (sessionPayload.csrfToken !== csrfHeader) {
      throw new Error('Validación de Red Fallida: Token CSRF no coincide con la sesión del servidor');
    }
  }

  // 4. Validación de Origen (Same-Origin Header Validation para proteger contra CSRF)
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw new Error('Validación de Red Fallida: Origen no permitido');
      }
    } catch {
      throw new Error('Validación de Red Fallida: Estructura de origen inválida');
    }
  }

  // 5. Decodificar la identidad de Supabase a partir del accessToken para obtener el userId
  // Supabase JWT almacena el ID del usuario en el claim 'sub'
  let userId = '';
  try {
    const payloadBase64 = sessionPayload.accessToken.split('.')[1];
    const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
    userId = decodedPayload.sub;
  } catch {
    throw new Error('No autorizado: Token de Supabase corrupto');
  }

  return {
    accessToken: sessionPayload.accessToken,
    orgId: sessionPayload.orgId,
    role: sessionPayload.role,
    userId
  };
}

interface LogAuditParams {
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  previousState?: any;
  newState?: any;
  request: NextRequest;
}

/**
 * Escribe un log de auditoría inmutable en la base de datos usando permisos de administrador.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  const supabase = createAdminClient();
  
  // Obtener IP y User-Agent de las cabeceras
  const ipAddress = params.request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = params.request.headers.get('user-agent') || 'Unknown';

  const { error } = await supabase.from('audit_logs').insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    previous_state: params.previousState ? JSON.stringify(params.previousState) : null,
    new_state: params.newState ? JSON.stringify(params.newState) : null,
    ip_address: ipAddress.split(',')[0].trim(), // Tomar la primera IP si viene de proxies
    user_agent: userAgent
  });

  if (error) {
    console.error('Error crítico al escribir bitácora de auditoría:', error.message);
  }
}
