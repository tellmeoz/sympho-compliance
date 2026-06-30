import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const InviteSchema = z.object({
  email: z.string().email('El correo electrónico no tiene un formato válido'),
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres')
});

export async function POST(request: NextRequest) {
  try {
    // 1. Validar sesión y CSRF (Cliente standard)
    const session = await verifySessionAndCsrf(request);
    
    // 2. Validar rol: Solo Oficial de Cumplimiento puede invitar nuevos usuarios
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json(
        { error: 'No autorizado: Se requieren privilegios de Oficial de Cumplimiento' },
        { status: 403 }
      );
    }
    
    // 3. Validar payload de entrada usando Zod
    const body = await request.json();
    const validationResult = InviteSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos de invitación inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { email, name } = validationResult.data;
    const supabaseAdmin = createAdminClient();
    
    // 4. Verificar si el email ya existe en public.profiles para evitar duplicados
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
      
    if (existingUser) {
      return NextResponse.json(
        { error: 'El correo electrónico ya se encuentra registrado en el sistema' },
        { status: 409 }
      );
    }
    
    // 5. Enviar invitación por email a través de Supabase Auth Admin
    // Obtener la URL de redirección de forma dinámica (soporta producción y local)
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const redirectToUrl = `${protocol}://${host}/login`;
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: redirectToUrl,
        data: {
          name,
          role: 'Operador',
          organization_id: session.orgId
        }
      }
    );
    
    if (inviteError || !inviteData.user) {
      return NextResponse.json(
        { error: 'Error al enviar la invitación por correo electrónico', details: inviteError?.message },
        { status: 500 }
      );
    }
    
    // 6. Escribir log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'OPERATOR_INVITE',
      entityType: 'profiles',
      entityId: inviteData.user.id,
      newState: { email, name, role: 'Operador' },
      request
    });
    
    return NextResponse.json({
      success: true,
      message: `Invitación enviada exitosamente al correo ${email}.`,
      invitedUser: {
        id: inviteData.user.id,
        email: inviteData.user.email
      }
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
