import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { DonationSchema } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/donations
 * Recupera el historial completo de donaciones del tenant actual.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await verifySessionAndCsrf(request);
    const supabase = createUserClient(session.accessToken);
    
    const { data: donations, error } = await supabase
      .from('donations')
      .select(`
        *,
        donors (
          name,
          rfc
        )
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
      
    if (error) {
      return NextResponse.json({ error: 'Error al recuperar donativos', details: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, donations });
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}

/**
 * POST /api/donations
 * Registra un donativo. Lanza automáticamente el trigger tr_evaluate_compliance_donation
 * para evaluar el acumulado de los 6 meses móviles en base de datos.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // 2. Validar payload de entrada usando Zod
    const body = await request.json();
    const validationResult = DonationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de transacción inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // 3. Preparar registro e inyectar el tenant organization_id
    const donationData = {
      ...validationResult.data,
      organization_id: session.orgId
    };
    
    // 4. Insertar en la base de datos
    const { data: donation, error: insertError } = await supabase
      .from('donations')
      .insert(donationData)
      .select()
      .single();
      
    if (insertError || !donation) {
      return NextResponse.json(
        { error: 'Error al registrar la donación en la base de datos', details: insertError?.message },
        { status: 500 }
      );
    }
    
    // 5. Escribir log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'DONATION_RECORD',
      entityType: 'donations',
      entityId: donation.id,
      newState: donation,
      request
    });
    
    // 6. Consultar estatus del donante para ver si cambió tras los triggers
    const { data: donor } = await supabase
      .from('donors')
      .select('overall_status, threshold_status, kyc_status')
      .eq('id', donation.donor_id)
      .single();
      
    return NextResponse.json({
      success: true,
      donation,
      donorStatus: donor
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
