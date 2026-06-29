'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastProvider';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'Oficial de Cumplimiento' | 'Operador';
  created_at: string;
}

export default function UsersPage() {
  const { user, csrfToken } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para modal de invitación
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Estados para modal de cambio de contraseña
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdTargetUser, setPwdTargetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [updatingPwd, setUpdatingPwd] = useState(false);

  // Estado para procesar cambios en segundo plano
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de Oficial de Cumplimiento');
        }
        throw new Error('Error al cargar la lista de usuarios');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Oficial de Cumplimiento') {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  // Invitar a un nuevo operador
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      showToast('Por favor complete todos los campos.', 'warning');
      return;
    }

    setInviting(true);
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar la invitación');

      showToast(`Invitación enviada exitosamente a ${inviteEmail}.`, 'success');
      setInviteModalOpen(false);
      setInviteName('');
      setInviteEmail('');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setInviting(false);
    }
  };

  // Alternar el rol de un usuario (Oficial <-> Operador)
  const handleToggleRole = async (targetUser: UserProfile) => {
    const nextRole = targetUser.role === 'Oficial de Cumplimiento' ? 'Operador' : 'Oficial de Cumplimiento';
    
    // Evitar degradarse a sí mismo
    if (targetUser.id === user?.id) {
      showToast('No puedes degradar tu propio rol desde aquí.', 'warning');
      return;
    }

    const confirmed = window.confirm(`¿Estás seguro de que deseas cambiar el rol de ${targetUser.name} a "${nextRole}"?`);
    if (!confirmed) return;

    setProcessingId(targetUser.id);
    try {
      const res = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ role: nextRole })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el rol');

      showToast(`Rol de ${targetUser.name} actualizado a ${nextRole}.`, 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setProcessingId(null);
    }
  };

  // Restablecer contraseña desde el panel de control
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdTargetUser || newPassword.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres.', 'warning');
      return;
    }

    setUpdatingPwd(true);
    try {
      const res = await fetch(`/api/users/${pwdTargetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ password: newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al restablecer contraseña');

      showToast(`Contraseña restablecida exitosamente para ${pwdTargetUser.name}.`, 'success');
      setPwdModalOpen(false);
      setPwdTargetUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setUpdatingPwd(false);
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (targetUser: UserProfile) => {
    if (targetUser.id === user?.id) {
      showToast('No puedes eliminar tu propia cuenta de la organización.', 'warning');
      return;
    }

    const confirmed = window.confirm(`⚠️ ADVERTENCIA: ¿Estás seguro de que deseas eliminar permanentemente a ${targetUser.name} (${targetUser.email})? Esto revocará su acceso inmediato.`);
    if (!confirmed) return;

    setProcessingId(targetUser.id);
    try {
      const res = await fetch(`/api/users/${targetUser.id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');

      showToast(`Usuario ${targetUser.name} eliminado de la organización.`, 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setProcessingId(null);
    }
  };

  if (user?.role !== 'Oficial de Cumplimiento') {
    return (
      <section className="view-panel active">
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>
          ⚠️ Acceso Restringido: La administración de usuarios y asignación de privilegios de seguridad está limitada al Oficial de Cumplimiento.
        </div>
      </section>
    );
  }

  return (
    <section className="view-panel active">
      <div className="card-widget">
        <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>Control y Administración de Usuarios</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gestione accesos, roles y credenciales de su equipo de cumplimiento</p>
          </div>
          <button className="btn" onClick={() => setInviteModalOpen(true)}>
            ➕ Invitar Operador
          </button>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlock: '1.5rem', color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="table-wrapper" style={{ marginBlockStart: '1.5rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre / Colaborador</th>
                <th>Correo Electrónico</th>
                <th>Rol Asignado</th>
                <th>Fecha de Registro</th>
                <th style={{ textAlign: 'right' }}>Acciones Administrativas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    Cargando usuarios de la organización...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No se encontraron colaboradores registrados.
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong> {u.id === user.id && <span className="badge success" style={{ fontSize: '0.7rem', paddingInline: '0.35rem', marginInlineStart: '0.5rem' }}>Tú</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {u.email}
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'Oficial de Cumplimiento' ? 'danger' : 'active'}`} style={{ fontSize: '0.75rem' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(u.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          onClick={() => handleToggleRole(u)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                          disabled={processingId === u.id || u.id === user.id}
                        >
                          🔄 Cambiar Rol
                        </button>
                        <button
                          onClick={() => { setPwdTargetUser(u); setPwdModalOpen(true); }}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                          disabled={processingId === u.id}
                        >
                          🔑 Contraseña
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="btn"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-danger)' }}
                          disabled={processingId === u.id || u.id === user.id}
                        >
                          🗑️ Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Invitar Colaborador */}
      {inviteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'grid', placeContent: 'center', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '450px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem' }}>Invitar Colaborador</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>El nuevo usuario recibirá una invitación por email para configurar su acceso.</p>
              </div>
              <button onClick={() => setInviteModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleInviteUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. Juan Pérez"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="ejemplo@organizacion.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1.25rem', marginBlockStart: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setInviteModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={inviting}>
                  {inviting ? 'Enviando...' : 'Enviar Invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Restablecer Contraseña Administrativamente */}
      {pwdModalOpen && pwdTargetUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'grid', placeContent: 'center', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '450px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem' }}>Restablecer Contraseña</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Establezca una nueva contraseña temporal para <strong>{pwdTargetUser.name}</strong></p>
              </div>
              <button onClick={() => { setPwdModalOpen(false); setPwdTargetUser(null); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Nueva Contraseña Temporal</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1.25rem', marginBlockStart: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setPwdModalOpen(false); setPwdTargetUser(null); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={updatingPwd}>
                  {updatingPwd ? 'Guardando...' : 'Establecer Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
