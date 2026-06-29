import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { BlacklistSchema } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/blacklist
 * Obtiene la lista negra local (personas bloqueadas) de la organización.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await verifySessionAndCsrf(request);
    
    // Control de Acceso: Solo Oficial de Cumplimiento puede listar la lista negra
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para acceder a la lista de bloqueados' },
        { status: 403 }
      );
    }

    const supabase = createUserClient(session.accessToken);
    
    // Consultar lista negra del tenant actual
    // RLS en la tabla 'blocked_list' filtrará automáticamente los registros
    const { data: list, error: fetchError } = await supabase
      .from('blocked_list')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (fetchError) {
      return NextResponse.json({ error: 'Error al recuperar lista de personas bloqueadas', details: fetchError.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, list });
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}

/**
 * POST /api/blacklist
 * Agrega un nuevo registro a la lista negra.
 * Solo accesible por Oficiales de Cumplimiento.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento puede agregar personas a la lista negra
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para agregar registros a la lista de bloqueados' },
        { status: 403 }
      );
    }
    
    // 3. Validar payload de entrada usando Zod
    const body = await request.json();
    const validationResult = BlacklistSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de bloqueo inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { name, rfc, reason } = validationResult.data;
    const supabase = createUserClient(session.accessToken);
    
    // 4. Preparar registro e inyectar el tenant organization_id
    const entryData = {
      organization_id: session.orgId,
      name,
      rfc: rfc || null,
      reason
    };
    
    // 5. Escribir en base de datos
    const { data: newEntry, error: insertError } = await supabase
      .from('blocked_list')
      .insert(entryData)
      .select()
      .single();
      
    if (insertError || !newEntry) {
      return NextResponse.json({ error: 'Error al agregar registro a la lista de bloqueados', details: insertError?.message }, { status: 500 });
    }
    
    // 6. Escribir log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'BLACKLIST_ADD',
      entityType: 'blocked_list',
      entityId: newEntry.id,
      newState: newEntry,
      request
    });

    return NextResponse.json({
      success: true,
      entry: newEntry
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
