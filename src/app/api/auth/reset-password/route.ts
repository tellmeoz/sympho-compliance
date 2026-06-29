import { createUserClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ResetPasswordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  accessToken: z.string().min(1, 'Token de acceso requerido')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ResetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos de contraseña inválidos', details: validation.error.format() }, { status: 400 });
    }
    
    const { password, accessToken } = validation.data;
    
    // Crear cliente de Supabase con el token de acceso del usuario (modo usuario)
    const supabase = createUserClient(accessToken);
    
    // Actualizar la contraseña del usuario autenticado
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      return NextResponse.json({ error: 'Error al cambiar la contraseña', details: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada exitosamente. Ya puede iniciar sesión.'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
