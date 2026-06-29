import * as jose from 'jose';

const secretStr = process.env.JWT_SECRET || 'secret-fallback-debe-ser-largo-de-32-bytes-en-produccion';
const JWT_SECRET = new TextEncoder().encode(secretStr);

interface SessionPayload {
  accessToken: string;
  csrfToken: string;
  orgId: string;
  role: string;
}

/**
 * Firma un token JWT de sesión cifrado para el backend.
 * @param payload Datos de la sesión, incluyendo tokens de acceso de Supabase y CSRF.
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h') // Expiración de 2 horas (sincronizada con Supabase por defecto)
    .sign(JWT_SECRET);
}

/**
 * Verifica la firma criptográfica y expiración del JWT de sesión.
 * @param token JWT de sesión.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  });
  return payload as unknown as SessionPayload;
}
