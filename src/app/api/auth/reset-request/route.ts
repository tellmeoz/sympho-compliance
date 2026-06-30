import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ResetRequestSchema = z.object({
  email: z.string().email('Formato de correo inválido')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ResetRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }
    
    const { email } = validation.data;
    const supabaseAdmin = createAdminClient();
    
    // Obtener la URL base de la app de forma dinámica (soporta producción y local sin configurar variables de entorno)
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const appUrl = `${protocol}://${host}`;
    
    // 1. Generar el enlace de recuperación de Supabase sin enviar correo a través de Supabase
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${appUrl}/reset-password`
      }
    });
    
    if (linkError || !linkData.properties?.action_link) {
      return NextResponse.json({ 
        error: 'No se pudo generar el enlace de recuperación. Verifique que el correo exista en el sistema.', 
        details: linkError?.message 
      }, { status: 400 });
    }
    
    const recoveryLink = linkData.properties.action_link;
    const linkUrl = new URL(recoveryLink);
    const token = linkUrl.searchParams.get('token') || '';
    const customLink = `${appUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    
    // 2. Si hay API Key de Resend configurada, enviar correo por Resend
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
          subject: 'Restablecer su contraseña - Sympho PLD',
          html: `
            <div style="background-color: #0b0f19; padding: 3rem; font-family: sans-serif; color: #f3f4f6; text-align: center; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f2937;">
              <div style="background-color: #06b6d4; width: 48px; height: 48px; border-radius: 50%; line-height: 48px; font-size: 24px; font-weight: bold; color: #0b0f19; margin: 0 auto 1.5rem; text-align: center;">S</div>
              <h2 style="color: #ffffff; margin-bottom: 1rem; font-size: 22px;">Restablecer Contraseña - Sympho PLD</h2>
              <p style="color: #9ca3af; font-size: 15px; margin-bottom: 2rem;">Ha solicitado un enlace para restablecer su contraseña de acceso en Sympho PLD. Haga clic en el botón a continuación para ingresar sus nuevas credenciales:</p>
              <a href="${customLink}" style="display: inline-block; background-color: #06b6d4; color: #0b0f19; padding: 0.85rem 2rem; font-weight: bold; text-decoration: none; border-radius: 6px; font-size: 15px; margin-bottom: 2rem; box-shadow: 0 4px 12px rgba(6,182,212,0.3);">Restablecer Contraseña</a>
              <p style="color: #6b7280; font-size: 12px;">Si usted no solicitó este cambio, puede ignorar este correo de forma segura. El enlace expirará en 24 horas.</p>
            </div>
          `
        })
      });
      
      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        console.error('Error de Resend detectado en servidor:', resendData);
        const errorDetail = resendData.message || resendData.error?.message || 'Error de API desconocido';
        return NextResponse.json({ 
          error: 'Error al enviar correo mediante Resend', 
          details: errorDetail 
        }, { status: 502 });
      }
      
      return NextResponse.json({
        success: true,
        message: 'Correo de restablecimiento enviado exitosamente mediante Resend.'
      });
    } else {
      // Modo Desarrollo / Fallback: Si no está configurado Resend, logueamos el enlace y lo devolvemos
      console.warn("⚠️ ADVERTENCIA: RESEND_API_KEY no configurado en .env.local");
      console.log("🔗 Enlace de recuperación generado:", customLink);
      
      return NextResponse.json({
        success: true,
        message: 'Enlace generado exitosamente (Modo Desarrollo).',
        devLink: customLink // Retornado solo para facilitar pruebas en local sin configurar Resend
      });
    }
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
