import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/users
 * Obtiene el listado de todos los usuarios (perfiles) de la organización actual.
 * Solo accesible por Oficiales de Cumplimiento.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF
    const session = await verifySessionAndCsrf(request);
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento' },
        { status: 403 }
      );
    }
    
    const supabaseAdmin = createAdminClient();
    
    // 3. Consultar perfiles asociados a la organización
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('organization_id', session.orgId)
      .order('created_at', { ascending: true });
      
    if (fetchError) {
      return NextResponse.json({ error: 'Error al recuperar usuarios', details: fetchError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      users
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
