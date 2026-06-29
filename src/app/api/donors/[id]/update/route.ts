import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DonorUpdateSchema = z.object({
  notes: z.string().optional(),
  risk: z.enum(['Bajo', 'Medio', 'Alto']).optional()
});

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PATCH /api/donors/[id]/update
 * Permite actualizar notas internas de cumplimiento y nivel de riesgo asignado a un donante.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    const { id: donorId } = await context.params;
    
    // 2. Validar payload de actualización usando Zod
    const body = await request.json();
    const validationResult = DonorUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de actualización inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { notes, risk } = validationResult.data;
    const supabase = createUserClient(session.accessToken);
    
    // Recuperar donante antes de editar para registrar el estado previo en bitácora
    const { data: currentDonor, error: findError } = await supabase
      .from('donors')
      .select('*')
      .eq('id', donorId)
      .single();
      
    if (findError || !currentDonor) {
      return NextResponse.json({ error: 'Donante no encontrado o sin privilegios de acceso' }, { status: 404 });
    }
    
    // Preparar campos a actualizar
    const updateData: Record<string, any> = {};
    if (notes !== undefined) updateData.notes = notes;
    if (risk !== undefined) updateData.risk = risk;
    
    // 3. Modificar datos en la base de datos bajo RLS
    const { data: updatedDonor, error: updateError } = await supabase
      .from('donors')
      .update(updateData)
      .eq('id', donorId)
      .select()
      .single();
      
    if (updateError || !updatedDonor) {
      return NextResponse.json({ error: 'Error al actualizar el donante en la base de datos', details: updateError?.message }, { status: 500 });
    }
    
    // 4. Ejecutar recalculo del donante tras modificar riesgo/comentarios (en caso de que afecte evaluación)
    const { error: rpcError } = await supabase.rpc('evaluate_donor_compliance', {
      p_donor_id: donorId
    });
    
    if (rpcError) {
      console.error('Error al recalcular estatus del donante tras actualizar expediente:', rpcError.message);
    }
    
    // 5. Registrar en bitácora de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'DONOR_UPDATE',
      entityType: 'donors',
      entityId: donorId,
      previousState: currentDonor,
      newState: updatedDonor,
      request
    });
    
    return NextResponse.json({
      success: true,
      donor: updatedDonor
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
