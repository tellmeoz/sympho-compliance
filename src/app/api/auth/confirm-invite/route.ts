import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ConfirmInviteSchema = z.object({
  email: z.string().email('Formato de correo inválido'),
  token: z.string().min(1, 'Token de invitación requerido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ConfirmInviteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos de invitación inválidos', details: validation.error.format() }, { status: 400 });
    }
    
    const { token, password, name } = validation.data;
    const supabaseAdmin = createAdminClient();
    
    // 1. Verificar el token de invitación (OTP tipo invite) en Supabase
    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: 'invite'
    });
    
    if (verifyError || !verifyData.user) {
      return NextResponse.json({ 
        error: 'El enlace de invitación es inválido, ha sido utilizado o ha expirado.', 
        details: verifyError?.message 
      }, { status: 400 });
    }
    
    // 2. Establecer la contraseña y el nombre en Supabase Auth
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(verifyData.user.id, {
      password,
      user_metadata: { name }
    });
    
    if (authUpdateError) {
      return NextResponse.json({ 
        error: 'Error al establecer contraseña de colaborador', 
        details: authUpdateError.message 
      }, { status: 500 });
    }
    
    // 3. Sincronizar el nombre en la tabla public.profiles de la base de datos
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ name })
      .eq('id', verifyData.user.id);
      
    if (profileError) {
      console.error('Error al actualizar nombre en profiles:', profileError.message);
      // No bloqueamos el flujo ya que la cuenta ya fue activada en Auth
    }
    
    return NextResponse.json({
      success: true,
      message: 'Cuenta activada exitosamente. Ya puede iniciar sesión.'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
