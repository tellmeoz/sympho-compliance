import { createClient } from '@supabase/supabase-js';
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
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
    }
    
    const { email } = validation.data;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Configuración de base de datos incompleta' }, { status: 500 });
    }
    
    // Usar cliente público para disparar la recuperación por correo
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    
    // Obtener la URL base de la app
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`
    });
    
    if (error) {
      return NextResponse.json({ error: 'Error al enviar el enlace de recuperación', details: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Enlace de recuperación enviado. Por favor revise su bandeja de entrada.'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
