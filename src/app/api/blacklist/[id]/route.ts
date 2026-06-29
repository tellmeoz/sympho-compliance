import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * DELETE /api/blacklist/[id]
 * Remueve un registro de la lista negra local (desbloqueo administrativo).
 * Solo accesible por Oficiales de Cumplimiento.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    const { id: entryId } = await context.params;
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento puede remover registros de la lista negra
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para modificar la lista de bloqueados' },
        { status: 403 }
      );
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // Obtener el registro antes de borrar para auditoría
    const { data: currentEntry, error: findError } = await supabase
      .from('blocked_list')
      .select('*')
      .eq('id', entryId)
      .single();
      
    if (findError || !currentEntry) {
      return NextResponse.json({ error: 'Registro de bloqueo no encontrado o sin privilegios de acceso' }, { status: 404 });
    }
    
    // 3. Eliminar el registro en la base de datos bajo RLS
    const { error: deleteError } = await supabase
      .from('blocked_list')
      .delete()
      .eq('id', entryId);
      
    if (deleteError) {
      return NextResponse.json({ error: 'Error al remover el registro de la lista de bloqueados', details: deleteError.message }, { status: 500 });
    }

    // 3.5. Re-evaluar y desbloquear donantes coincidentes
    const { error: reevalError } = await supabase.rpc('reevaluate_blacklist_on_remove', {
      p_name: currentEntry.name,
      p_rfc: currentEntry.rfc || null,
      p_org_id: session.orgId
    });

    if (reevalError) {
      console.error('Error al reevaluar donantes tras remover bloqueo:', reevalError.message);
    }
    
    // 4. Escribir log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'BLACKLIST_REMOVE',
      entityType: 'blocked_list',
      entityId: entryId,
      previousState: currentEntry,
      request
    });
    
    return NextResponse.json({
      success: true,
      message: 'Persona removida exitosamente de la lista de bloqueados.'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
