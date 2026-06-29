import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{
    id: string; // ID de la alerta
  }>;
}

/**
 * GET /api/reports/emergency/[id]
 * Obtiene el expediente de emergencia para presentar el Aviso de 24 horas del SAT.
 * Solo accesible por Oficiales de Cumplimiento.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 1. Validar sesión y CSRF
    const session = await verifySessionAndCsrf(request);
    const { id: alertId } = await context.params;
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento' },
        { status: 403 }
      );
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // 3. Consultar la alerta
    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', alertId)
      .single();
      
    if (alertError || !alert) {
      return NextResponse.json({ error: 'Alerta no encontrada o sin privilegios de acceso' }, { status: 404 });
    }
    
    // Validar que la alerta sea de coincidencia de lista negra
    if (alert.category !== 'blacklist_match') {
      return NextResponse.json({ error: 'La alerta solicitada no corresponde a una coincidencia de lista negra para aviso de 24h' }, { status: 400 });
    }
    
    // 4. Consultar detalles del donante bloqueado
    const { data: donor, error: donorError } = await supabase
      .from('donors')
      .select('*')
      .eq('id', alert.donor_id)
      .single();
      
    if (donorError || !donor) {
      return NextResponse.json({ error: 'Donante asociado no encontrado' }, { status: 404 });
    }
    
    // 5. Obtener datos de la organización (sujeto obligado)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', session.orgId)
      .single();
      
    if (orgError || !org) {
      return NextResponse.json({ error: 'Organización no encontrada' }, { status: 500 });
    }
    
    // 6. Estructurar el reporte de aviso de 24h
    const reportData = {
      tipo_reporte: 'AVISO_24H_EMERGENCIA_UIF',
      ley_reguladora: 'LFPIORPI Art. 17 Fracc. XIII y Reglas de Carácter General',
      fecha_deteccion: alert.created_at,
      tiempo_limite_24h: new Date(new Date(alert.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      causa_bloqueo: alert.description,
      sujeto_obligado: {
        rfc: org.rfc,
        name: org.name
      },
      donante_bloqueado: {
        tipo_persona: donor.type,
        nombre_o_razon_social: donor.name,
        rfc: donor.rfc,
        curp: donor.curp || null,
        fecha_nacimiento_o_constitucion: donor.dob_or_constitution,
        actividad_economica: donor.economic_activity,
        procedencia_fondos: donor.funds_origin,
        contacto: {
          email: donor.email || null,
          phone: donor.phone || null
        },
        domicilio: {
          calle: donor.address_street,
          num_ext: donor.address_number_ext,
          num_int: donor.address_number_int || null,
          colonia: donor.address_colony,
          municipio: donor.address_city,
          estado: donor.address_state,
          cp: donor.address_zip
        },
        representante_legal: donor.type === 'Persona Moral' ? {
          nombre: donor.representative_name,
          rfc: donor.representative_rfc,
          curp: donor.representative_curp
        } : null
      }
    };
    
    return NextResponse.json({
      success: true,
      report: reportData
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
