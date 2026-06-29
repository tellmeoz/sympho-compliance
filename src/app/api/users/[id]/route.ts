import { verifySessionAndCsrf, logAudit } from '@/lib/api-helper';
import { createAdminClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  name: z.string().min(3).optional(),
  role: z.enum(['Oficial de Cumplimiento', 'Operador']).optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional()
});

interface RouteContext {
  params: Promise<{
    id: string; // ID del usuario a modificar/eliminar
  }>;
}

/**
 * PATCH /api/users/[id]
 * Permite al Oficial de Cumplimiento actualizar el nombre, rol o restablecer contraseña de un usuario.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await verifySessionAndCsrf(request);
    const { id: targetUserId } = await context.params;
    
    // 1. Control de Acceso: Solo Oficial de Cumplimiento
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json({ error: 'No autorizado: Privilegios insuficientes' }, { status: 403 });
    }
    
    // 2. Validar payload
    const body = await request.json();
    const validation = UpdateUserSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Esquema de datos inválido', details: validation.error.format() }, { status: 400 });
    }
    
    const { name, role, password } = validation.data;
    const supabaseAdmin = createAdminClient();
    
    // 3. Verificar que el usuario pertenece a la misma organización
    const { data: targetProfile, error: findError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .eq('organization_id', session.orgId)
      .single();
      
    if (findError || !targetProfile) {
      return NextResponse.json({ error: 'Usuario no encontrado en esta organización' }, { status: 404 });
    }
    
    // 4. Bloquear cambio de rol propio si es el único Oficial de Cumplimiento
    if (targetUserId === session.userId && role && role !== 'Oficial de Cumplimiento') {
      return NextResponse.json({ error: 'No puede degradar su propio rol de Oficial de Cumplimiento para evitar bloqueo' }, { status: 400 });
    }
    
    // 5. Aplicar cambios en Supabase Auth y base de datos
    const updateData: any = {};
    const metadataUpdate: any = {};
    
    if (password) {
      updateData.password = password;
    }
    if (name) {
      metadataUpdate.name = name;
    }
    if (role) {
      metadataUpdate.role = role;
    }
    
    if (Object.keys(metadataUpdate).length > 0) {
      updateData.user_metadata = metadataUpdate;
    }
    
    // Actualizar en Auth de Supabase (Admin API)
    if (Object.keys(updateData).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, updateData);
      if (authError) {
        return NextResponse.json({ error: 'Error al actualizar credenciales de autenticación', details: authError.message }, { status: 500 });
      }
    }
    
    // Actualizar tabla public.profiles en base de datos
    const dbUpdate: any = {};
    if (name) dbUpdate.name = name;
    if (role) dbUpdate.role = role;
    
    if (Object.keys(dbUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(dbUpdate)
        .eq('id', targetUserId);
        
      if (profileError) {
        return NextResponse.json({ error: 'Error al actualizar perfil en base de datos', details: profileError.message }, { status: 500 });
      }
    }
    
    // 6. Registrar en auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: password ? 'USER_PASSWORD_RESET' : 'USER_PROFILE_UPDATE',
      entityType: 'profiles',
      entityId: targetUserId,
      previousState: targetProfile,
      newState: { name: name || targetProfile.name, role: role || targetProfile.role },
      request
    });
    
    return NextResponse.json({
      success: true,
      message: 'Usuario actualizado exitosamente'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Permite al Oficial de Cumplimiento eliminar un usuario (desvincularlo y borrar de la BD y Auth).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await verifySessionAndCsrf(request);
    const { id: targetUserId } = await context.params;
    
    // 1. Control de Acceso: Solo Oficial de Cumplimiento
    if (session.role !== 'Oficial de Cumplimiento') {
      return NextResponse.json({ error: 'No autorizado: Privilegios insuficientes' }, { status: 403 });
    }
    
    // 2. No permitirse eliminarse a sí mismo
    if (targetUserId === session.userId) {
      return NextResponse.json({ error: 'No autorizado: No puede eliminarse a sí mismo de la organización' }, { status: 400 });
    }
    
    const supabaseAdmin = createAdminClient();
    
    // 3. Verificar que pertenezca a la organización
    const { data: targetProfile, error: findError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .eq('organization_id', session.orgId)
      .single();
      
    if (findError || !targetProfile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    
    // 4. Borrar de Auth (Admin API)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authError) {
      return NextResponse.json({ error: 'Error al eliminar usuario en Auth', details: authError.message }, { status: 500 });
    }
    
    // 5. Borrar de tabla public.profiles
    const { error: dbError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);
      
    if (dbError) {
      return NextResponse.json({ error: 'Error al borrar perfil de base de datos', details: dbError.message }, { status: 500 });
    }
    
    // 6. Log de auditoría
    await logAudit({
      organizationId: session.orgId,
      userId: session.userId,
      action: 'USER_DELETE',
      entityType: 'profiles',
      entityId: targetUserId,
      previousState: targetProfile,
      request
    });
    
    return NextResponse.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno en el servidor', details: err.message }, { status: 500 });
  }
}
