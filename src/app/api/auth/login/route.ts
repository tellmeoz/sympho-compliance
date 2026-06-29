import { createAdminClient } from '@/lib/supabase-server';
import { LoginSchema } from '@/lib/validations';
import { signSessionToken } from '@/lib/jwt-utils';
import { logAudit } from '@/lib/api-helper';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 1. Validar payload de entrada usando Zod
    const validationResult = LoginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Credenciales inválidas', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { email, password } = validationResult.data;
    const supabaseAdmin = createAdminClient();
    
    // 2. Autenticar con Supabase Auth
    const { data: sessionData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });
    
    if (loginError || !sessionData.session || !sessionData.user) {
      return NextResponse.json(
        { error: 'Credenciales incorrectas o usuario no encontrado' },
        { status: 401 }
      );
    }
    
    // 3. Buscar el perfil público asociado para obtener el organization_id y role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, role, name')
      .eq('id', sessionData.user.id)
      .single();
      
    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Error al recuperar perfil del usuario. Perfil no inicializado.' },
        { status: 500 }
      );
    }
    
    // Buscar nombre de la organización
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', profile.organization_id)
      .single();

    // 4. Generar Tokens CSRF y JWT de Sesión
    const csrfToken = crypto.randomUUID();
    const sessionToken = await signSessionToken({
      accessToken: sessionData.session.access_token,
      csrfToken,
      orgId: profile.organization_id,
      role: profile.role
    });
    
    // 5. Preparar respuesta con Cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: profile.name,
        role: profile.role,
        orgName: org?.name || 'Asociación Civil',
        orgId: profile.organization_id
      },
      csrfToken
    });
    
    // Inyectar cookie de Sesión (httpOnly)
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200, // 2 horas
      path: '/'
    });
    
    // Inyectar cookie CSRF
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200,
      path: '/'
    });
    
    // 6. Escribir log de auditoría
    await logAudit({
      organizationId: profile.organization_id,
      userId: sessionData.user.id,
      action: 'USER_LOGIN',
      entityType: 'profiles',
      entityId: sessionData.user.id,
      request
    });
    
    return response;
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
