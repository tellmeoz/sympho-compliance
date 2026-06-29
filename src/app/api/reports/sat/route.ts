import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/reports/sat
 * Obtiene la lista de operaciones reportables al SAT para un mes y año específicos.
 * Las operaciones son donativos recibidos de donantes que acumulan más de $376,565.10 MXN (3,210 UMA).
 * Restringido exclusivamente al Oficial de Cumplimiento.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF
    const session = await verifySessionAndCsrf(request);
    
    // 2. Control de Acceso: Solo Oficial de Cumplimiento puede descargar reportes regulatorios
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento para acceder al Centro de Reportes SAT' },
        { status: 403 }
      );
    }
    
    const monthStr = request.nextUrl.searchParams.get('month');
    const yearStr = request.nextUrl.searchParams.get('year');
    
    if (!monthStr || !yearStr) {
      return NextResponse.json({ error: 'Faltan parámetros: month y year son obligatorios' }, { status: 400 });
    }
    
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);
    
    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
      return NextResponse.json({ error: 'Parámetros de fecha inválidos' }, { status: 400 });
    }
    
    const supabase = createUserClient(session.accessToken);
    
    // Calcular rangos de fecha del mes
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Último día del mes
    
    // 3. Consultar todos los donativos del mes cruzados con datos de donantes
    const { data: donations, error: donationsError } = await supabase
      .from('donations')
      .select(`
        *,
        donors (
          *
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
      
    if (donationsError) {
      return NextResponse.json({ error: 'Error al recuperar donativos del mes', details: donationsError.message }, { status: 500 });
    }
    
    // 4. Consultar acumulaciones históricas para la ventana de 6 meses móvil que termina en este mes
    const startDate6M = new Date(year, month - 6, 1);
    const startDate6MStr = startDate6M.toISOString().split('T')[0];
    
    const { data: histDonations, error: histError } = await supabase
      .from('donations')
      .select('donor_id, amount')
      .eq('status', 'Validada')
      .gte('date', startDate6MStr)
      .lte('date', endDate);
      
    if (histError) {
      return NextResponse.json({ error: 'Error al recuperar saldos acumulados históricos del período', details: histError.message }, { status: 500 });
    }
    
    // Mapear saldos acumulados indexados por donor_id
    const accumMap = new Map<string, number>();
    histDonations?.forEach((don: any) => {
      const currentSum = accumMap.get(don.donor_id) || 0;
      accumMap.set(don.donor_id, currentSum + Number(don.amount || 0));
    });
    
    // 5. Filtrar donativos que corresponden a donantes en estado de aviso (acumulación >= $376,565.10 MXN)
    const LIMIT_AVISO = 117.31 * 3210; // $376,565.10 MXN (3,210 UMA)
    const reportableDonations = (donations || [])
      .map((don: any) => {
        const accumAmount = accumMap.get(don.donor_id) || 0;
        return {
          ...don,
          donor_accumulation_6m: accumAmount,
          requires_report: accumAmount >= LIMIT_AVISO
        };
      })
      .filter((don: any) => don.requires_report);
      
    // 6. Consultar datos de la organización actual para el encabezado del reporte
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', session.orgId)
      .single();
      
    if (orgError) {
      return NextResponse.json({ error: 'Error al obtener datos de la organización', details: orgError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      metadata: {
        organization: {
          rfc: org.rfc,
          name: org.name,
          activity: 'Donataria Autorizada (Asistencia Social / Educación / Cultura)'
        },
        period: {
          month,
          year,
          startDate,
          endDate
        },
        uma_value_2026: 117.31,
        aviso_threshold_mxn: LIMIT_AVISO,
        total_donations_count: reportableDonations.length,
        total_reportable_amount: reportableDonations.reduce((sum: number, don: any) => sum + Number(don.amount), 0)
      },
      donations: reportableDonations
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
