import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const InviteSchema = z.object({
  email: z.string().email('El correo electrónico no tiene un formato válido'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres')
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
    
    // 5. Enviar invitación de forma dinámica usando Resend
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const appUrl = `${protocol}://${host}`;
    
    // Generar el enlace de invitación en Supabase sin disparar correo por su servidor
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${appUrl}/login`,
        data: {
          name,
          role: 'Operador',
          organization_id: session.orgId
        }
      }
    });
    
    if (linkError || !linkData.properties?.action_link || !linkData.user) {
      return NextResponse.json({ 
        error: 'Error al generar el enlace de invitación de Supabase', 
        details: linkError?.message 
      }, { status: 500 });
    }
    
    const recoveryLink = linkData.properties.action_link;
    const linkUrl = new URL(recoveryLink);
    const token = linkUrl.searchParams.get('token') || '';
    const customLink = `${appUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
    
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    let emailSent = false;
    
    if (resendApiKey) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: 'Invitación de Acceso - Sympho PLD',
          html: `
            <div style="background-color: #0b0f19; padding: 3rem; font-family: sans-serif; color: #f3f4f6; text-align: center; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f2937;">
              <div style="background-color: #06b6d4; width: 48px; height: 48px; border-radius: 50%; line-height: 48px; font-size: 24px; font-weight: bold; color: #0b0f19; margin: 0 auto 1.5rem; text-align: center;">S</div>
              <h2 style="color: #ffffff; margin-bottom: 1rem; font-size: 22px;">Invitación de Acceso - Sympho PLD</h2>
              <p style="color: #9ca3af; font-size: 15px; margin-bottom: 2rem;">Hola <strong>${name}</strong>, has sido invitado a unirte al equipo de Sympho PLD como <strong>Operador</strong>. Haz clic en el botón a continuación para activar tu cuenta y configurar tu contraseña de acceso:</p>
              <a href="${customLink}" style="display: inline-block; background-color: #06b6d4; color: #0b0f19; padding: 0.85rem 2rem; font-weight: bold; text-decoration: none; border-radius: 6px; font-size: 15px; margin-bottom: 2rem; box-shadow: 0 4px 12px rgba(6,182,212,0.3);">Aceptar Invitación</a>
              <p style="color: #6b7280; font-size: 12px;">Este enlace expirará en 24 horas.</p>
            </div>
          `
        })
      });
      
      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        console.error('Error de Resend al invitar usuario:', resendData);
        return NextResponse.json({ 
          error: 'Error al enviar correo de invitación por Resend', 
          details: resendData.message || resendData.error?.message || 'Error de API' 
        }, { status: 502 });
      }
      emailSent = true;
    } else {
      console.warn("⚠️ ADVERTENCIA: RESEND_API_KEY no configurado. Logueando link de invitación.");
      console.log("🔗 Enlace de invitación generado:", customLink);
    }
    
    // 6. Escribir log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'OPERATOR_INVITE',
      entityType: 'profiles',
      entityId: linkData.user.id,
      newState: { email, name, role: 'Operador' },
      request
    });
    
    return NextResponse.json({
      success: true,
      message: emailSent 
        ? `Invitación enviada exitosamente al correo ${email} vía Resend.` 
        : `Invitación generada exitosamente (Modo Desarrollo).`,
      devLink: emailSent ? undefined : customLink,
      invitedUser: {
        id: linkData.user.id,
        email: linkData.user.email
      }
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno en el servidor', details: err.message },
      { status: 500 }
    );
  }
}
