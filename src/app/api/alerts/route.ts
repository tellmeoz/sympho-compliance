import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/alerts
 * Obtiene todas las alertas (por defecto las activas e investigando) asociadas al tenant.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    const supabase = createUserClient(session.accessToken);
    
    // 2. Obtener alertas del tenant actual
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select(`
        *,
        donors (
          name,
          rfc,
          overall_status
        )
      `)
      .order('created_at', { ascending: false });
      
    if (alertsError) {
      return NextResponse.json({ error: 'Error al recuperar alertas', details: alertsError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      alerts
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
