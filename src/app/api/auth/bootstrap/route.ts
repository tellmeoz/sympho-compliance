import { createAdminClient } from '@/lib/supabase-server';
import { BootstrapSchema } from '@/lib/validations';
import { signSessionToken } from '@/lib/jwt-utils';
import { logAudit } from '@/lib/api-helper';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 1. Validar payload de entrada usando Zod
    const validationResult = BootstrapSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de registro inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { email, password, org_name, org_rfc } = validationResult.data;
    
    // Instanciar cliente de base de datos administrativo para verificar estado global
    const supabaseAdmin = createAdminClient();
    
    // 2. Bloquear si ya existen organizaciones registradas en el sistema (Solo bootstrap del primer tenant)
    const { count, error: countError } = await supabaseAdmin
      .from('organizations')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      return NextResponse.json({ error: 'Error al verificar base de datos', details: countError.message }, { status: 500 });
    }
    
    if (count !== null && count > 0) {
      return NextResponse.json(
        { error: 'El sistema ya ha sido inicializado. El aprovisionamiento bootstrap no está disponible.' },
        { status: 403 }
      );
    }
    
    // 3. Crear Organización de la A.C.
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: org_name, rfc: org_rfc })
      .select()
      .single();
      
    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Error al registrar la asociación civil', details: orgError?.message },
        { status: 500 }
      );
    }
    
    // 4. Crear el usuario en Supabase Auth.
    // Pasamos el metadata para que el trigger tr_sync_user_app_metadata
    // y handle_new_user creen el perfil público atómicamente.
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirmar email para agilizar la demo del MVP
      user_metadata: {
        name: 'Oficial de Cumplimiento Inicial',
        role: 'Oficial de Cumplimiento',
        organization_id: org.id
      }
    });
    
    if (authError || !authUser.user) {
      // Revertir organización si falla la creación del usuario para no dejar datos basura
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      return NextResponse.json(
        { error: 'Error al registrar la credencial de acceso', details: authError?.message },
        { status: 500 }
      );
    }
    
    // 5. Iniciar sesión en Supabase para obtener el access_token del usuario
    const { data: sessionData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });
    
    if (loginError || !sessionData.session) {
      return NextResponse.json(
        { error: 'Error al iniciar sesión tras el aprovisionamiento', details: loginError?.message },
        { status: 500 }
      );
    }
    
    // 6. Generar Tokens CSRF y JWT de Sesión
    const csrfToken = crypto.randomUUID();
    const sessionToken = await signSessionToken({
      accessToken: sessionData.session.access_token,
      csrfToken,
      orgId: org.id,
      role: 'Oficial de Cumplimiento'
    });
    
    // 7. Preparar respuesta con Cookies
    const response = NextResponse.json({
      success: true,
      message: 'Bootstrap completado exitosamente. Organización y administrador inicializados.',
      user: {
        id: authUser.user.id,
        email: authUser.user.email,
        name: 'Oficial de Cumplimiento Inicial',
        role: 'Oficial de Cumplimiento',
        orgName: org.name,
        orgId: org.id
      },
      csrfToken
    });
    
    // Inyectar cookie de Sesión (httpOnly para blindar de XSS)
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200, // 2 horas
      path: '/'
    });
    
    // Inyectar cookie CSRF (Accesible para que JS pueda leer y mandar la cabecera Double-Submit)
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200,
      path: '/'
    });
    
    // 8. Escribir log de auditoría
    await logAudit({
      organizationId: org.id,
      userId: authUser.user.id,
      action: 'SYSTEM_BOOTSTRAP',
      entityType: 'organizations',
      entityId: org.id,
      newState: { org, email },
      request
    });
    
    return response;
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en la solicitud', details: err.message },
      { status: 500 }
    );
  }
}
