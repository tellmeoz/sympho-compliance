import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

const secretStr = process.env.JWT_SECRET || 'secret-fallback-debe-ser-largo-de-32-bytes-en-produccion';
const JWT_SECRET = new TextEncoder().encode(secretStr);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Excluir rutas públicas estáticas, API de auth y endpoints de cron
  const isPublicAsset = pathname.startsWith('/_next') || 
                        pathname.startsWith('/static') || 
                        pathname.includes('.') ||
                        pathname === '/favicon.ico';
                        
  const isAuthApi = pathname.startsWith('/api/auth/login') || 
                    pathname.startsWith('/api/auth/bootstrap') || 
                    pathname.startsWith('/api/auth/logout') ||
                    pathname.startsWith('/api/auth/reset-request') ||
                    pathname.startsWith('/api/auth/reset-password') ||
                    pathname.startsWith('/api/auth/confirm-invite');
                    
  const isCronApi = pathname.startsWith('/api/cron/');

  if (isPublicAsset || isAuthApi || isCronApi) {
    return NextResponse.next();
  }

  // 2. Extraer cookie de sesión
  const sessionToken = request.cookies.get('session_token')?.value;

  // 3. Validar sesión
  let isSessionValid = false;
  let userRole = '';
  
  if (sessionToken) {
    try {
      const { payload } = await jose.jwtVerify(sessionToken, JWT_SECRET);
      isSessionValid = true;
      userRole = (payload.role as string) || 'Operador';
    } catch {
      // Token inválido o expirado
    }
  }

  // 4. Reglas de redirección para páginas (HTML)
  const isApiRequest = pathname.startsWith('/api/');
  const isLoginPage = pathname === '/login';
  const isBootstrapPage = pathname === '/bootstrap';
  const isForgotPasswordPage = pathname === '/forgot-password';
  const isResetPasswordPage = pathname === '/reset-password';
  const isAcceptInvitePage = pathname === '/accept-invite';

  if (!isSessionValid) {
    // Si no está autenticado y busca rutas protegidas
    if (!isLoginPage && !isBootstrapPage && !isForgotPasswordPage && !isResetPasswordPage && !isAcceptInvitePage) {
      if (isApiRequest) {
        return NextResponse.json({ error: 'No autorizado: Inicie sesión' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  } else {
    // Si ya está autenticado e intenta ir a páginas públicas de login/registro
    if (isLoginPage || isBootstrapPage || isForgotPasswordPage || isResetPasswordPage || isAcceptInvitePage) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Control de roles específico en API para Oficial de Cumplimiento
    if (isApiRequest && pathname.startsWith('/api/auth/invite') && userRole !== 'Oficial de Cumplimiento') {
      return NextResponse.json({ error: 'Prohibido: Se requieren privilegios de Oficial de Cumplimiento' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

// Configurar matcher para interceptar todo excepto assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (handled internally inside proxy)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
