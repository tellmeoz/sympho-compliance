import { verifySessionAndCsrf } from '@/lib/api-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1. Validar sesión. Extrae accessToken y orgId
    const session = await verifySessionAndCsrf(request);
    const supabaseAdmin = createAdminClient();
    
    // 2. Obtener el perfil público del usuario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('name, role, email')
      .eq('id', session.userId)
      .single();
      
    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Perfil de usuario no encontrado en la base de datos' },
        { status: 404 }
      );
    }
    
    // 3. Obtener el nombre de la organización
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', session.orgId)
      .single();
      
    return NextResponse.json({
      success: true,
      user: {
        id: session.userId,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        orgName: org?.name || 'Asociación Civil',
        orgId: session.orgId
      }
    });
    
  } catch (err: any) {
    // Si falla la sesión (por ejemplo, al no estar logueado), retornamos un estado limpio de 401
    return NextResponse.json(
      { error: err.message },
      { status: 401 }
    );
  }
}
