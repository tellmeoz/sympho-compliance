import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { DonorSchema } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/donors
 * Retorna todos los donantes de la organización junto con su acumulado móvil actual.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verificar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // Instanciar cliente Supabase usando el JWT del usuario (RLS activo)
    const supabase = createUserClient(session.accessToken);
    
    // 2. Obtener lista de donantes del tenant actual
    const { data: donors, error: donorsError } = await supabase
      .from('donors')
      .select('*')
      .order('name', { ascending: true });
      
    if (donorsError) {
      return NextResponse.json({ error: 'Error al recuperar donantes', details: donorsError.message }, { status: 500 });
    }
    
    // 3. Obtener acumulados móviles desde la vista de acumulación actual del tenant
    const { data: accumulations, error: accumError } = await supabase
      .from('v_donor_current_accumulation')
      .select('*');
      
    if (accumError) {
      return NextResponse.json({ error: 'Error al recuperar acumulados', details: accumError.message }, { status: 500 });
    }
    
    // Mapear acumulados indexando por id de donante
    const accumMap = new Map(accumulations.map(a => [a.donor_id, a.accumulated_amount_6m]));
    
    // Combinar donante con su acumulado móvil
    const enrichedDonors = donors.map(donor => ({
      ...donor,
      accumulation: Number(accumMap.get(donor.id) || 0)
    }));
    
    return NextResponse.json({ success: true, donors: enrichedDonors });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/donors
 * Registra un nuevo donante. Dispara triggers BEFORE y AFTER de screening de listas negras.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF
    const session = await verifySessionAndCsrf(request);
    
    // 2. Validar payload de entrada usando Zod
    const body = await request.json();
    const validationResult = DonorSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de donante inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // 3. Inyectar organization_id del tenant autenticado en el objeto a insertar
    const newDonorData = {
      ...validationResult.data,
      organization_id: session.orgId
    };
    
    // 4. Escribir en base de datos
    const { data: donor, error: insertError } = await supabase
      .from('donors')
      .insert(newDonorData)
      .select()
      .single();
      
    if (insertError || !donor) {
      // Si el error es por duplicación de RFC dentro del mismo tenant
      if (insertError?.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe un donante registrado con este RFC en la organización' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Error al registrar donante en la base de datos', details: insertError?.message },
        { status: 500 }
      );
    }
    
    // 5. Escribir en bitácora de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'DONOR_CREATE',
      entityType: 'donors',
      entityId: donor.id,
      newState: donor,
      request
    });
    
    // Retornar donante creado. Si cayó en lista negra, los triggers ya habrán
    // modificado su screening_status y overall_status a 'blocked' y creado su alerta.
    return NextResponse.json({
      success: true,
      donor
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
