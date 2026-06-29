import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient, createAdminClient } from '@/lib/supabase-server';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // 2. Extraer FormData de la petición multipart
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const donorId = formData.get('donor_id') as string | null;
    const documentType = formData.get('document_type') as string | null;
    
    if (!file || !donorId || !documentType) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios en el formulario (file, donor_id, document_type)' },
        { status: 400 }
      );
    }
    
    // 3. Validaciones rígidas de frontera de archivos
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `El archivo excede el tamaño máximo permitido (Límite: 5MB. Peso actual: ${(file.size / 1024 / 1024).toFixed(2)}MB)` },
        { status: 400 }
      );
    }
    
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo se permiten formatos PDF, JPEG y PNG.' },
        { status: 400 }
      );
    }
    
    // Validar tipo de documento permitido por ley
    const validDocTypes = ['ine', 'acta', 'rfc', 'comprobante'];
    if (!validDocTypes.includes(documentType)) {
      return NextResponse.json(
        { error: 'Tipo de documento no clasificado como requerido por la regulación PLD' },
        { status: 400 }
      );
    }
    
    // 4. Preparar ruta de almacenamiento privada y sistemática
    const fileExt = file.name.split('.').pop() || 'pdf';
    const cleanExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(fileExt.toLowerCase()) ? fileExt.toLowerCase() : 'pdf';
    const storagePath = `${session.orgId}/${donorId}/${documentType}_${crypto.randomUUID()}.${cleanExt}`;
    
    // Convertir el archivo a buffer para su transmisión serverless
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Instanciar clientes Supabase (Admin para Storage, User para base de datos bajo RLS)
    const supabaseAdmin = createAdminClient();
    const supabaseUser = createUserClient(session.accessToken);
    
    // 5. Subir físicamente al bucket privado de Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('kyc-documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true
      });
      
    if (uploadError) {
      return NextResponse.json(
        { error: 'Error al cargar el archivo físico en almacenamiento seguro', details: uploadError.message },
        { status: 500 }
      );
    }
    
    // 6. Verificar existencia para saber si es insert o update (para bitácora previa)
    const { data: previousDoc } = await supabaseUser
      .from('donor_documents')
      .select('*')
      .eq('donor_id', donorId)
      .eq('document_type', documentType)
      .maybeSingle();
      
    // 7. Insertar o actualizar registro en base de datos bajo RLS
    // Se incluye organization_id y donor_id, garantizando la verificación multi-tenant por FK compuesta
    const documentRecord = {
      organization_id: session.orgId,
      donor_id: donorId,
      document_type: documentType,
      storage_bucket: 'kyc-documents',
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: session.userId,
      review_status: 'pending_review' // Pasa a revisión del Oficial de Cumplimiento
    };
    
    const { data: newDoc, error: dbError } = await supabaseUser
      .from('donor_documents')
      .upsert(documentRecord, { onConflict: 'donor_id,document_type' })
      .select()
      .single();
      
    if (dbError || !newDoc) {
      // Intentar limpiar archivo subido si falla base de datos para no dejar basura
      await supabaseAdmin.storage.from('kyc-documents').remove([storagePath]);
      return NextResponse.json(
        { error: 'Error al registrar el documento en la base de datos', details: dbError?.message },
        { status: 500 }
      );
    }
    
    // 8. Ejecutar función de recálculo en BD (Para verificar si el expediente pasa a completo)
    const { error: rpcError } = await supabaseUser.rpc('evaluate_donor_compliance', {
      p_donor_id: donorId
    });
    
    if (rpcError) {
      console.error('Error al recalcular estatus del donante tras subir documento:', rpcError.message);
    }
    
    // 9. Registrar en bitácora de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: previousDoc ? 'DOCUMENT_UPDATE' : 'DOCUMENT_UPLOAD',
      entityType: 'donor_documents',
      entityId: newDoc.id,
      previousState: previousDoc || null,
      newState: newDoc,
      request
    });
    
    return NextResponse.json({
      success: true,
      message: 'Documento KYC subido e integrado exitosamente. Estado puesto en revisión.',
      document: newDoc
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
