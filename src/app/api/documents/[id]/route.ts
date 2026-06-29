import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DocumentReviewSchema = z.object({
  review_status: z.enum(['ok', 'rejected']),
  rejection_reason: z.string().optional().or(z.literal(''))
});

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PATCH /api/documents/[id]
 * Permite al Oficial de Cumplimiento aprobar (review_status = 'ok') o rechazar (review_status = 'rejected')
 * un documento KYC cargado por el operador.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    const { id: documentId } = await context.params;
    
    // 2. Control de Acceso: Solo el Oficial de Cumplimiento puede revisar/dictaminar expedientes
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para revisar documentos' },
        { status: 403 }
      );
    }
    
    // 3. Validar payload de dictamen usando Zod
    const body = await request.json();
    const validationResult = DocumentReviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Esquema de resolución inválido', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { review_status, rejection_reason } = validationResult.data;
    const supabase = createUserClient(session.accessToken);
    
    // Recuperar el documento antes de editar para registrar el estado previo en bitácora
    const { data: currentDoc, error: findError } = await supabase
      .from('donor_documents')
      .select('*')
      .eq('id', documentId)
      .single();
      
    if (findError || !currentDoc) {
      return NextResponse.json({ error: 'Documento no encontrado o sin privilegios de acceso' }, { status: 404 });
    }
    
    // 4. Modificar estado de revisión en base de datos
    const { data: updatedDoc, error: updateError } = await supabase
      .from('donor_documents')
      .update({
        review_status: review_status,
        rejection_reason: review_status === 'rejected' ? rejection_reason : null
      })
      .eq('id', documentId)
      .select()
      .single();
      
    if (updateError || !updatedDoc) {
      return NextResponse.json({ error: 'Error al actualizar el documento en la base de datos', details: updateError?.message }, { status: 500 });
    }
    
    // 5. Ejecutar recalculo del donante tras modificar el estatus de sus documentos
    const { error: rpcError } = await supabase.rpc('evaluate_donor_compliance', {
      p_donor_id: updatedDoc.donor_id
    });
    
    if (rpcError) {
      console.error('Error al recalcular estatus del donante tras evaluar documento:', rpcError.message);
    }
    
    // 6. Registrar en bitácora de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'DOCUMENT_REVIEW',
      entityType: 'donor_documents',
      entityId: documentId,
      previousState: currentDoc,
      newState: updatedDoc,
      request
    });
    
    return NextResponse.json({
      success: true,
      document: updatedDoc
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
