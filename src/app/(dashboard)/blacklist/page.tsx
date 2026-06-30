'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastProvider';

interface BlacklistEntry {
  id: string;
  name: string;
  rfc: string | null;
  reason: string;
  created_at: string;
}

export default function BlacklistPage() {
  const { user, csrfToken } = useAuth();
  const { showToast } = useToast();
  
  const [list, setList] = useState<BlacklistEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para el Modal de bloquear persona
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRfc, setFormRfc] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchList = async () => {
    try {
      const res = await fetch('/api/blacklist');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de Oficial de Cumplimiento');
        }
        throw new Error('Error al cargar la lista de personas bloqueadas');
      }
      const data = await res.json();
      setList(data.list || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});

    const payload = {
      name: formName,
      rfc: formRfc || undefined,
      reason: formReason
    };

    try {
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 400 && result.details && typeof result.details === 'object') {
          const errors: Record<string, string> = {};
          Object.entries(result.details).forEach(([key, val]: any) => {
            if (val && typeof val === 'object' && '_errors' in val) {
              errors[key] = (val as any)._errors?.[0] || 'Campo inválido';
            }
          });
          setFormErrors(errors);
          showToast('Campos con formato inválido. Por favor revise el formulario (ej. RFC inválido).', 'warning');
        } else {
          const errorMsg = result.details ? `${result.error}: ${result.details}` : result.error;
          showToast(`Error: ${errorMsg}`, 'danger');
        }
        return;
      }

      showToast('Persona agregada a la lista negra exitosamente.', 'success');
      setFormName('');
      setFormRfc('');
      setFormReason('');
      setModalOpen(false);
      fetchList(); // Refrescar listado
    } catch (err: any) {
      showToast(`Error al enviar datos: ${err.message}`, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblock = async (id: string, name: string) => {
    const confirmed = window.confirm(`¿Está seguro de que desea remover a ${name} de la lista de personas bloqueadas?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/blacklist/${id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al desbloquear persona');

      showToast(`Se ha removido a ${name} de la lista de bloqueados.`, 'success');
      fetchList(); // Refrescar listado
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  };

  // Filtrado de la lista negra en tiempo real
  const filteredList = list.filter(entry => 
    entry.name.toLowerCase().includes(search.toLowerCase()) ||
    (entry.rfc || '').toLowerCase().includes(search.toLowerCase()) ||
    entry.reason.toLowerCase().includes(search.toLowerCase())
  );

  if (user?.role !== 'Oficial de Cumplimiento') {
    return (
      <section className="view-panel active">
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>
          ⚠️ Acceso Restringido: Esta sección contiene la lista de personas bloqueadas y solo está disponible para el Oficial de Cumplimiento de la organización.
        </div>
      </section>
    );
  }

  return (
    <section className="view-panel active">
      <div className="card-widget">
        <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Lista de Personas Bloqueadas (Lista Negra Local)</h2>
          <button className="btn" onClick={() => setModalOpen(true)}>🚫 Bloquear Persona</button>
        </div>

        <div className="search-bar-container" style={{ marginBlock: '1.5rem' }}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar por nombre, RFC o motivo del bloqueo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.85rem 1.25rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: '0.95rem' }}
          />
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlockEnd: '1.5rem', color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre / Razón Social</th>
                <th>RFC Registrado</th>
                <th>Motivo del Bloqueo</th>
                <th>Fecha de Registro</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    Cargando lista de personas bloqueadas...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    ✅ La lista negra está vacía. Ninguna persona se encuentra bloqueada localmente.
                  </td>
                </tr>
              ) : (
                filteredList.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <strong style={{ color: 'var(--color-danger)' }}>{entry.name}</strong>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {entry.rfc || 'No registrado'}
                    </td>
                    <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.reason}>
                      {entry.reason}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(entry.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td>
                      <button 
                        onClick={() => handleUnblock(entry.id, entry.name)} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', backgroundColor: 'var(--color-success-glow)', border: '1px solid var(--color-success)', color: 'var(--color-success)' }}
                      >
                        🔓 Desbloquear
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Agregar Persona a la Lista Negra */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'grid', placeContent: 'center', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '520px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Bloquear Persona (Lista de Personas Bloqueadas)</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Nombre Completo o Razón Social</label>
                <input 
                  type="text" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                  className="form-control" 
                  placeholder="Ej. Juan Pérez López o Constructora S.A." 
                  required 
                />
                {formErrors.name && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">RFC (Opcional)</label>
                <input 
                  type="text" 
                  value={formRfc} 
                  onChange={(e) => setFormRfc(e.target.value)} 
                  className="form-control" 
                  placeholder="Ej. ABCD900101XYZ" 
                />
                {formErrors.rfc && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.rfc}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Motivo o Causa del Bloqueo (Requerimiento PLD)</label>
                <textarea 
                  value={formReason} 
                  onChange={(e) => setFormReason(e.target.value)} 
                  className="form-control" 
                  rows={3} 
                  placeholder="Escriba la causa por la cual se restringe la aceptación de donativos de esta persona (ej. investigación judicial, reportes de actividades inusuales)..." 
                  required
                ></textarea>
                {formErrors.reason && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.reason}</span>}
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1rem', marginBlockStart: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn" style={{ backgroundColor: 'var(--color-danger)' }} disabled={submitting}>
                  {submitting ? 'Registrando...' : '🚫 Bloquear Persona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
