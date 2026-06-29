'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_state: string | null;
  new_state: string | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
  profiles?: {
    name: string;
    email: string;
  };
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado para el modal de detalle del log
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de Oficial de Cumplimiento');
        }
        throw new Error('Error al cargar la bitácora de auditoría');
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Extraer las acciones únicas para poblar el filtro
  const uniqueActions = ['ALL', ...Array.from(new Set(logs.map(log => log.action)))];

  // Filtrado de logs en tiempo real
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(search.toLowerCase()) ||
      log.ip_address.toLowerCase().includes(search.toLowerCase()) ||
      (log.profiles?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.profiles?.email || '').toLowerCase().includes(search.toLowerCase());
      
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'SYSTEM_BOOTSTRAP':
        return 'success';
      case 'DONOR_CREATE':
        return 'active';
      case 'DONOR_UPDATE':
        return 'warning';
      case 'DONATION_RECORD':
        return 'success';
      case 'DOCUMENT_UPLOAD':
      case 'DOCUMENT_UPDATE':
        return 'active';
      case 'DOCUMENT_REVIEW':
        return 'warning';
      case 'ALERT_RESOLVE':
        return 'danger';
      case 'OPERATOR_INVITE':
        return 'active';
      default:
        return '';
    }
  };

  // Renderizar la diferencia de estados como una tabla comparativa
  const renderStateDiff = (prevStr: string | null, newStr: string | null) => {
    let prev: Record<string, any> = {};
    let current: Record<string, any> = {};

    try {
      if (prevStr) prev = typeof prevStr === 'string' ? JSON.parse(prevStr) : prevStr;
      if (newStr) current = typeof newStr === 'string' ? JSON.parse(newStr) : newStr;
    } catch {
      return <p style={{ color: 'var(--color-danger)' }}>Error al parsear el estado del registro.</p>;
    }

    const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(current)]))
      .filter(k => k !== 'created_at' && k !== 'updated_at' && k !== 'organization_id');

    if (allKeys.length === 0) {
      return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin datos detallados de cambios.</p>;
    }

    return (
      <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '0.5rem' }}>Propiedad</th>
              <th style={{ padding: '0.5rem' }}>Valor Anterior</th>
              <th style={{ padding: '0.5rem' }}>Valor Nuevo</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map(key => {
              const valPrev = prev[key] === undefined || prev[key] === null ? '-' : String(prev[key]);
              const valNew = current[key] === undefined || current[key] === null ? '-' : String(current[key]);
              const isChanged = valPrev !== valNew;

              return (
                <tr key={key} style={{ backgroundColor: isChanged ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: isChanged ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                    {key}
                  </td>
                  <td style={{ padding: '0.5rem', textDecoration: isChanged ? 'line-through' : 'none', color: isChanged ? 'var(--text-dark)' : 'inherit' }}>
                    {valPrev}
                  </td>
                  <td style={{ padding: '0.5rem', color: isChanged ? 'var(--color-success)' : 'inherit', fontWeight: isChanged ? 600 : 'normal' }}>
                    {valNew}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (user?.role !== 'Oficial de Cumplimiento') {
    return (
      <section className="view-panel active">
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>
          ⚠️ Acceso Restringido: Esta sección contiene registros confidenciales de auditoría y solo está disponible para el Oficial de Cumplimiento de la organización.
        </div>
      </section>
    );
  }

  return (
    <section className="view-panel active">
      <div className="card-widget">
        <div className="widget-header">
          <h2>Bitácora de Auditoría Normativa (Historial Inmutable)</h2>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlock: '1.5rem', color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Filtros de búsqueda */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBlock: '1.5rem' }}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar por operador, acción, IP o tipo de entidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.85rem 1.25rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: '0.95rem' }}
          />

          <select 
            className="form-control" 
            value={actionFilter} 
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ padding: '0.85rem', backgroundColor: 'var(--bg-main)' }}
          >
            {uniqueActions.map(action => (
              <option key={action} value={action}>
                {action === 'ALL' ? 'Filtrar por Acción (Todas)' : action}
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Operador</th>
                <th>Acción Realizada</th>
                <th>Entidad Afectada</th>
                <th>Dirección IP</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    Cargando bitácora de auditoría...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    📖 No se encontraron registros de auditoría que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(log.created_at).toLocaleString('es-MX')}
                    </td>
                    <td>
                      <strong>{log.profiles?.name || 'Sistema (Automático)'}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.profiles?.email || '-'}</div>
                    </td>
                    <td>
                      <span className={`badge ${getActionBadgeClass(log.action)}`} style={{ fontSize: '0.75rem' }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                        {log.entity_type}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {log.entity_id || 'N/A'}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {log.ip_address}
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                        🔍 Inspeccionar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle de Cambios del Log */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'grid', placeContent: 'center', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '680px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem' }}>Dictamen de Auditoría del Registro</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID Log: {selectedLog.id}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <div><strong>Operación:</strong> {selectedLog.action}</div>
                <div><strong>Estructura:</strong> {selectedLog.entity_type}</div>
                <div><strong>Operador:</strong> {selectedLog.profiles?.name || 'Sistema (Trigger)'}</div>
                <div><strong>Dirección IP:</strong> {selectedLog.ip_address}</div>
                <div style={{ gridColumn: 'span 2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>Navegador / Cliente:</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{selectedLog.user_agent}</span>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.95rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Diferencia de Estados (Diff del Motor)</h3>
                {renderStateDiff(selectedLog.previous_state, selectedLog.new_state)}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1rem', marginBlockStart: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>Cerrar Dictamen</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
