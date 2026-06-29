import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cron/compliance-decay
 * Ejecutado periódicamente a medianoche para evaluar la ventana móvil de todos los donantes
 * y resolver estados por el paso del tiempo (time decay de límites).
 * Protegido mediante secreto CRON_SECRET de Vercel.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar firma de Vercel Cron Job
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('No autorizado: Firma del Cron Job inválida o ausente', { status: 401 });
    }
    
    // Instanciar cliente administrativo (Bypassea RLS para recalcular todo el sistema)
    const supabaseAdmin = createAdminClient();
    
    // 2. Obtener lista de todos los IDs de donantes registrados
    const { data: donors, error: fetchError } = await supabaseAdmin
      .from('donors')
      .select('id, organization_id');
      
    if (fetchError) {
      return NextResponse.json(
        { error: 'Error al recuperar donantes para evaluación del decay', details: fetchError.message },
        { status: 500 }
      );
    }
    
    if (!donors || donors.length === 0) {
      return NextResponse.json({ success: true, message: 'No hay donantes registrados en el sistema.' });
    }
    
    // 3. Evaluar e iterar secuencialmente para recalcular umbrales móviles
    const results = [];
    for (const donor of donors) {
      const { error: rpcError } = await supabaseAdmin.rpc('evaluate_donor_compliance', {
        p_donor_id: donor.id
      });
      
      if (rpcError) {
        console.error(`Error de recalculo para donante ${donor.id}:`, rpcError.message);
        results.push({ id: donor.id, success: false, error: rpcError.message });
      } else {
        results.push({ id: donor.id, success: true });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Procesamiento de Time Decay completado. Evaluados: ${donors.length} donantes.`,
      details: results
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor cron', details: err.message },
      { status: 500 }
    );
  }
}
