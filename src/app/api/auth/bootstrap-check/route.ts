import { createAdminClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();
    
    // Contar cuántas organizaciones existen
    const { count, error } = await supabaseAdmin
      .from('organizations')
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      return NextResponse.json({ error: 'Error al verificar base de datos', details: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      needsBootstrap: count === 0
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
