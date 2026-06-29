import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { AlertResolutionSchema } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PATCH /api/alerts/[id]
 * Resuelve una alerta PLD activa, agregando la bitácora de notas del Oficial de Cumplimiento.
 * Solo accesible por Oficiales de Cumplimiento.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    const { id: alertId } = await context.params;
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento puede dictaminar alertas
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para dictaminar alertas' },
        { status: 403 }
      );
    }
    
    // 3. Validar notas de dictamen usando Zod
    const body = await request.json();
    const validationResult = AlertResolutionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Esquema de resolución inválido', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { notes } = validationResult.data;
    const supabase = createUserClient(session.accessToken);
    
    // Obtener alerta actual antes de modificar para bitácora previa
    const { data: currentAlert, error: findError } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', alertId)
      .single();
      
    if (findError || !currentAlert) {
      return NextResponse.json({ error: 'Alerta no encontrada o sin privilegios de acceso' }, { status: 404 });
    }
    
    // 4. Modificar estado de la alerta
    const { data: updatedAlert, error: updateError } = await supabase
      .from('alerts')
      .update({
        status: 'resolved',
        notes: notes
      })
      .eq('id', alertId)
      .select()
      .single();
      
    if (updateError || !updatedAlert) {
      return NextResponse.json({ error: 'Error al actualizar alerta en base de datos', details: updateError?.message }, { status: 500 });
    }
    
    // 5. Ejecutar recalculo del donante para sincronizar overall_status tras resolver alerta
    const { error: rpcError } = await supabase.rpc('evaluate_donor_compliance', {
      p_donor_id: updatedAlert.donor_id
    });
    
    if (rpcError) {
      console.error('Error al recalcular estatus del donante tras resolución de alerta:', rpcError.message);
    }
    
    // 6. Registrar en bitácora de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'ALERT_RESOLVE',
      entityType: 'alerts',
      entityId: alertId,
      previousState: currentAlert,
      newState: updatedAlert,
      request
    });
    
    return NextResponse.json({
      success: true,
      alert: updatedAlert
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
