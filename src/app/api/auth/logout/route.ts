import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Intentar verificar sesión para registrar en auditoría (si falla, igual removemos cookies)
    let authUser = null;
    try {
      authUser = await verifySessionAndCsrf(request);
    } catch {
      // Ignorar error al desloguear sesión inválida
    }
    
    // Preparar respuesta de remoción de cookies
    const response = NextResponse.json({
      success: true,
      message: 'Sesión cerrada exitosamente.'
    });
    
    // Expirar cookies asignándoles fecha pasada y valor vacío
    response.cookies.set('session_token', '', { maxAge: 0, path: '/' });
    response.cookies.set('csrf_token', '', { maxAge: 0, path: '/' });
    
    if (authUser) {
      await logAudit({
        organizationId: authUser.orgId,
        userId: authUser.userId,
        action: 'USER_LOGOUT',
        entityType: 'profiles',
        entityId: authUser.userId,
        request
      });
    }
    
    return response;
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno al cerrar sesión', details: err.message },
      { status: 500 }
    );
  }
}
