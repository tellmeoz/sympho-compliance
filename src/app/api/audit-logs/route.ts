import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/audit-logs
 * Obtiene el historial completo de logs de auditoría inmutables del tenant actual.
 * Restringido exclusivamente para el rol de 'Oficial de Cumplimiento'.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento puede auditar bitácoras del sistema
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para acceder a las bitácoras de auditoría' },
        { status: 403 }
      );
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // 3. Consultar logs de auditoría cruzando con perfiles para ver nombres de operadores
    // RLS en la tabla 'audit_logs' filtrará automáticamente los registros del organization_id del usuario
    const { data: logs, error: logsError } = await supabase
      .from('audit_logs')
      .select(`
        *,
        profiles (
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });
      
    if (logsError) {
      return NextResponse.json({ error: 'Error al recuperar logs de auditoría', details: logsError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      logs
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
