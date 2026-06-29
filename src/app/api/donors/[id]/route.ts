import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createUserClient, createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/donors/[id]
 * Recupera la ficha KYC completa de un donante, incluyendo transacciones,
 * alertas activas y documentos con enlaces de lectura firmados por 15 minutos.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF
    const session = await verifySessionAndCsrf(request);
    const { id: donorId } = await context.params;
    
    const supabase = createUserClient(session.accessToken);
    const supabaseAdmin = createAdminClient();
    
    // 2. Obtener ficha básica del donante (Filtrada por RLS)
    const { data: donor, error: donorError } = await supabase
      .from('donors')
      .select('*')
      .eq('id', donorId)
      .maybeSingle();
      
    if (donorError) {
      return NextResponse.json({ error: 'Error al recuperar donante', details: donorError.message }, { status: 500 });
    }
    
    if (!donor) {
      return NextResponse.json({ error: 'Donante no encontrado o sin privilegios de acceso' }, { status: 404 });
    }
    
    // 3. Obtener donaciones asociadas
    const { data: donations } = await supabase
      .from('donations')
      .select('*')
      .eq('donor_id', donorId)
      .order('date', { ascending: false });
      
    // 4. Obtener alertas de cumplimiento
    const { data: alerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false });
      
    // 5. Obtener acumulado móvil actual de la vista
    const { data: accumData } = await supabase
      .from('v_donor_current_accumulation')
      .select('accumulated_amount_6m')
      .eq('donor_id', donorId)
      .maybeSingle();
      
    // 6. Obtener documentos cargados
    const { data: documents } = await supabase
      .from('donor_documents')
      .select('*')
      .eq('donor_id', donorId);
      
    // 7. Firmar URLs temporales de documentos privados usando el admin client
    let signedDocuments: any[] = [];
    if (documents && documents.length > 0) {
      signedDocuments = await Promise.all(
        documents.map(async (doc) => {
          if (doc.review_status !== 'missing' && doc.storage_path) {
            try {
              const { data: signedData, error: signError } = await supabaseAdmin.storage
                .from(doc.storage_bucket)
                .createSignedUrl(doc.storage_path, 900); // Enlace expira en 15 minutos
                
              return {
                ...doc,
                signedUrl: signError ? null : signedData?.signedUrl || null
              };
            } catch {
              return { ...doc, signedUrl: null };
            }
          }
          return { ...doc, signedUrl: null };
        })
      );
    }
    
    return NextResponse.json({
      success: true,
      donor: {
        ...donor,
        accumulation: Number(accumData?.accumulated_amount_6m || 0)
      },
      donations: donations || [],
      alerts: alerts || [],
      documents: signedDocuments
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
