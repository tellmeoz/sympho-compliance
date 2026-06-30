import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ResetPasswordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  token: z.string().min(1, 'Token de recuperación requerido'),
  email: z.string().email('Correo electrónico inválido')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ResetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos de contraseña inválidos', details: validation.error.format() }, { status: 400 });
    }
    
    const { password, token, email } = validation.data;
    const supabaseAdmin = createAdminClient();
    
    // 1. Verificar el token OTP de tipo recovery para el correo electrónico provisto
    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      email,
      token,
      type: 'recovery'
    });
    
    if (verifyError || !verifyData.user) {
      return NextResponse.json({ 
        error: 'El enlace de recuperación es inválido o ha expirado. Por favor solicite uno nuevo.', 
        details: verifyError?.message 
      }, { status: 400 });
    }
    
    // 2. Actualizar la contraseña del usuario en Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(verifyData.user.id, {
      password
    });
    
    if (updateError) {
      return NextResponse.json({ 
        error: 'Error al cambiar la contraseña en la base de datos de autenticación', 
        details: updateError.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada exitosamente. Ya puede iniciar sesión.'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
