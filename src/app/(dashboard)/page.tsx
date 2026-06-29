'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastProvider';

interface Donor {
  id: string;
  name: string;
  rfc: string;
  risk: string;
  accumulation: number;
  overall_status: 'ok' | 'warning' | 'danger' | 'blocked';
  screening_status: string;
}

interface Alert {
  id: string;
  donor_id: string;
  alert_type: string;
  category: string;
  title: string;
  description: string;
  status: 'active' | 'investigating' | 'resolved';
  created_at: string;
  donors?: {
    name: string;
    rfc: string;
  };
}

// Componente del reloj de cuenta regresiva de 24 horas
const BlacklistCountdown = ({ createdAt }: { createdAt: string }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const calculateTime = () => {
      const diffMs = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000 - Date.now();
      if (diffMs <= 0) {
        setTimeLeft('AVISO VENCIDO');
        setIsUrgent(true);
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeLeft(`Quedan ${hours}h ${minutes}m`);
      setIsUrgent(hours < 6); // Pulsar si quedan menos de 6 horas
    };

    calculateTime();
    const timer = setInterval(calculateTime, 60000); // Actualizar cada minuto
    return () => clearInterval(timer);
  }, [createdAt]);

  const badgeStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    padding: '0.35rem 0.65rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 600,
    backgroundColor: 'var(--color-danger-glow)',
    border: '1px solid var(--color-danger)',
    color: 'var(--color-danger)',
    ...(isUrgent ? { animation: 'pld-pulse 1.5s infinite alternate', boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)' } : {})
  };

  return (
    <>
      <style>{`
        @keyframes pld-pulse {
          0% { opacity: 0.6; transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1.03); }
        }
      `}</style>
      <span style={badgeStyle}>
        ⏰ {timeLeft}
      </span>
    </>
  );
};

export default function Dashboard() {
  const { user, csrfToken } = useAuth();
  const { showToast } = useToast();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para el Modal de Aviso de Emergencia 24h
  const [activeEmergencyAlert, setActiveEmergencyAlert] = useState<Alert | null>(null);
  const [emergencyReportData, setEmergencyReportData] = useState<any | null>(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [acuseFolio, setAcuseFolio] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [donorsRes, alertsRes] = await Promise.all([
        fetch('/api/donors'),
        fetch('/api/alerts')
      ]);

      if (!donorsRes.ok || !alertsRes.ok) {
        throw new Error('Error al cargar la información del servidor');
      }

      const donorsData = await donorsRes.json();
      const alertsData = await alertsRes.json();

      setDonors(donorsData.donors || []);
      setAlerts(alertsData.alerts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  };

  // Abrir Modal de Emergencia y cargar expediente de coincidencia
  const handleOpenEmergencyModal = async (alertItem: Alert) => {
    setActiveEmergencyAlert(alertItem);
    setEmergencyLoading(true);
    setAcuseFolio('');
    setResolutionNotes('');
    try {
      const res = await fetch(`/api/reports/emergency/${alertItem.id}`);
      if (!res.ok) throw new Error('Error al cargar el expediente de emergencia');
      const data = await res.json();
      setEmergencyReportData(data.report || null);
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
      setActiveEmergencyAlert(null);
    } finally {
      setEmergencyLoading(false);
    }
  };

  const escapeXml = (unsafe: string) => {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  // Descargar XML de Aviso de 24h
  const downloadEmergencyXML = () => {
    if (!emergencyReportData) return;
    const report = emergencyReportData;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AvisoUrgente24H xmlns="http://www.satsocial.gob.mx/pld/urgente" version="1.0">\n`;
    xml += `  <Encabezado fechaReporte="${new Date().toISOString()}" tipoAviso="IMMEDIATE_BLACKLIST_MATCH" />\n`;
    xml += `  <SujetoObligado rfc="${report.sujeto_obligado.rfc}" razonSocial="${escapeXml(report.sujeto_obligado.name)}" />\n`;
    xml += `  <DetalleCoincidencia fechaDeteccion="${report.fecha_deteccion}" causaBloqueo="${escapeXml(report.causa_bloqueo)}" />\n`;
    xml += `  <SujetoReportado tipoPersona="${report.donante_bloqueado.tipo_persona}" nombre="${escapeXml(report.donante_bloqueado.nombre_o_razon_social)}" rfc="${report.donante_bloqueado.rfc}" curp="${report.donante_bloqueado.curp || ''}">\n`;
    xml += `    <Domicilio calle="${escapeXml(report.donante_bloqueado.domicilio.calle)}" ext="${report.donante_bloqueado.domicilio.num_ext}" int="${report.donante_bloqueado.domicilio.num_int || ''}" colonia="${escapeXml(report.donante_bloqueado.domicilio.colonia)}" municipio="${escapeXml(report.donante_bloqueado.domicilio.municipio)}" estado="${escapeXml(report.donante_bloqueado.domicilio.estado)}" cp="${report.donante_bloqueado.domicilio.cp}" />\n`;
    if (report.donante_bloqueado.tipo_persona === 'Persona Moral') {
      const rep = report.donante_bloqueado.representante_legal;
      xml += `    <RepresentanteLegal nombre="${escapeXml(rep?.nombre || '')}" rfc="${rep?.rfc || ''}" curp="${rep?.curp || ''}" />\n`;
    }
    xml += `  </SujetoReportado>\n`;
    xml += `</AvisoUrgente24H>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AVISO_24H_${report.donante_bloqueado.rfc || 'S_RFC'}_${new Date().toISOString().split('T')[0]}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Descargar Ficha JSON
  const downloadEmergencyJSON = () => {
    if (!emergencyReportData) return;
    const blob = new Blob([JSON.stringify(emergencyReportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AVISO_24H_${emergencyReportData.donante_bloqueado.rfc || 'S_RFC'}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Confirmar presentación de aviso ante el SAT y resolver alerta
  const handleResolveEmergencyAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmergencyAlert) return;
    if (acuseFolio.trim().length < 5) {
      showToast('Por favor especifique un número de folio de acuse oficial válido del SAT.', 'warning');
      return;
    }
    if (resolutionNotes.trim().length < 5) {
      showToast('Las notas de resolución deben tener al menos 5 caracteres.', 'warning');
      return;
    }

    setSubmittingResolution(true);
    const resolvedNotesText = `[ACUSE SAT: ${acuseFolio.trim()}] ${resolutionNotes.trim()}`;

    try {
      const res = await fetch(`/api/alerts/${activeEmergencyAlert.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ notes: resolvedNotesText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al resolver la alerta');

      showToast('Aviso de 24h registrado exitosamente. La alerta ha sido dictaminada y resuelta.', 'success');
      setActiveEmergencyAlert(null);
      setEmergencyReportData(null);
      fetchDashboardData(); // Refrescar dashboard completo
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    } finally {
      setSubmittingResolution(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeContent: 'center', minHeight: '50vh' }}>
        <div className="brand-icon" style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 1rem' }}>S</div>
        <p style={{ color: 'var(--text-muted)' }}>Cargando consola de cumplimiento...</p>
      </div>
    );
  }

  // 1. Calcular métricas agregadas
  const totalDonations6M = donors.reduce((sum, d) => sum + d.accumulation, 0);
  const totalDonorsCount = donors.length;
  const activeAlertsCount = alerts.filter(a => a.status === 'active' || a.status === 'investigating').length;
  const satAvisosCount = donors.filter(d => d.overall_status === 'danger').length;

  // Donantes con alertas de cumplimiento
  const riskDonors = donors.filter(d => d.overall_status !== 'ok');

  return (
    <section className="view-panel active">
      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlockEnd: '1.5rem', color: 'var(--color-danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tarjetas de Métricas */}
      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-title">Donativos Recibidos (6M)</div>
          <div className="metric-value">{formatCurrency(totalDonations6M)}</div>
          <div className="metric-footer">Suma acumulada semestral</div>
        </div>
        <div className="metric-card success">
          <div className="metric-title">Donantes Registrados</div>
          <div className="metric-value">{totalDonorsCount}</div>
          <div className="metric-footer">Padrón de aportantes</div>
        </div>
        <div className="metric-card danger">
          <div className="metric-title">Alertas Activas</div>
          <div className="metric-value">{activeAlertsCount}</div>
          <div className="metric-footer">
            <span className="trend-down">⚠️ {activeAlertsCount > 0 ? 'Acción requerida' : 'Sin alertas pendientes'}</span>
          </div>
        </div>
        <div className="metric-card warning">
          <div className="metric-title">Avisos SAT Obligatorios</div>
          <div className="metric-value">{satAvisosCount}</div>
          <div className="metric-footer">Exceden 3,210 UMA ($376,565.10)</div>
        </div>
      </div>

      {/* Widgets inferiores */}
      <div className="widgets-layout" style={{ marginBlockStart: '2rem' }}>
        {/* Donantes con Alertas de Cumplimiento */}
        <div className="card-widget">
          <div className="widget-header">
            <h2>Donantes con Incidencias PLD</h2>
            <Link href="/donors" className="action-btn" style={{ textDecoration: 'none' }}>Ver padrón</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Donante / RFC</th>
                  <th>Riesgo</th>
                  <th>Acumulado 6M</th>
                  <th>Estatus Alerta</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {riskDonors.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      ✅ Ningún donante presenta alertas de cumplimiento activas.
                    </td>
                  </tr>
                ) : (
                  riskDonors.map(donor => (
                    <tr key={donor.id}>
                      <td>
                        <strong>{donor.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{donor.rfc}</div>
                      </td>
                      <td>
                        <span className={`badge ${donor.risk === 'Alto' ? 'danger' : donor.risk === 'Medio' ? 'warning' : 'success'}`}>
                          {donor.risk}
                        </span>
                      </td>
                      <td>{formatCurrency(donor.accumulation)}</td>
                      <td>
                        <span className={`badge ${
                          donor.overall_status === 'blocked' ? 'danger' :
                          donor.overall_status === 'danger' ? 'danger' :
                          donor.overall_status === 'warning' ? 'warning' : 'success'
                        }`}>
                          {donor.overall_status === 'blocked' ? '🚫 BLOQUEADO' :
                           donor.overall_status === 'danger' ? '⚠️ AVISO SAT' :
                           donor.overall_status === 'warning' ? '📂 INCOMPLETO' : 'OK'}
                        </span>
                      </td>
                      <td>
                        <Link href={`/donors/${donor.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', textDecoration: 'none' }}>
                          Inspeccionar
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Historial Reciente de Alertas */}
        <div className="card-widget">
          <div className="widget-header">
            <h2>Historial de Alertas Recientes</h2>
          </div>
          <div className="alert-list">
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                🎉 Todo en orden. No hay alertas PLD en el historial.
              </div>
            ) : (
              alerts.slice(0, 5).map(alert => {
                const isBlacklistMatch = alert.category === 'blacklist_match';
                const isPending = alert.status !== 'resolved';

                return (
                  <div key={alert.id} className={`alert-item ${
                    alert.alert_type === 'blocked' ? 'danger' : 
                    alert.alert_type === 'danger' ? 'danger' : 'warning'
                  }`} style={{ opacity: alert.status === 'resolved' ? 0.6 : 1, borderLeft: isBlacklistMatch && isPending ? '4px solid var(--color-danger)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{alert.title}</strong>
                        {isBlacklistMatch && isPending && <BlacklistCountdown createdAt={alert.created_at} />}
                      </div>
                      <span className="alert-time" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(alert.created_at).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', marginBlockStart: '0.25rem', color: 'var(--text-muted)' }}>{alert.description}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockStart: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                        Donante: <strong>{alert.donors?.name || 'Cargando...'}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {isBlacklistMatch && isPending && user?.role === 'Oficial de Cumplimiento' && (
                          <button 
                            className="btn" 
                            onClick={() => handleOpenEmergencyModal(alert)}
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-danger)' }}
                          >
                            ⚠️ Atender Aviso 24h
                          </button>
                        )}
                        <span className={`badge ${alert.status === 'resolved' ? 'success' : 'warning'}`} style={{ fontSize: '0.7rem' }}>
                          {alert.status === 'resolved' ? 'Dictaminada' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal para Procesar Aviso de Emergencia de 24 Horas */}
      {activeEmergencyAlert && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'grid', placeContent: 'center', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '560px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--color-danger)' }}>Aviso de Emergencia 24h (UIF / SAT)</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Alerta ID: {activeEmergencyAlert.id}</p>
              </div>
              <button onClick={() => { setActiveEmergencyAlert(null); setEmergencyReportData(null); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            {emergencyLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Cargando expediente de bloqueo del donante...
              </div>
            ) : !emergencyReportData ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-danger)' }}>
                Error al cargar los datos del expediente.
              </div>
            ) : (
              <form onSubmit={handleResolveEmergencyAlert} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockEnd: '0.25rem' }}>
                    <strong>Donante Identificado:</strong> 
                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{emergencyReportData.donante_bloqueado.nombre_o_razon_social}</span>
                  </div>
                  <div><strong>RFC del Donante:</strong> {emergencyReportData.donante_bloqueado.rfc}</div>
                  <div><strong>Fecha de Detección:</strong> {new Date(emergencyReportData.fecha_deteccion).toLocaleString('es-MX')}</div>
                  <div style={{ marginBlockStart: '0.25rem' }}><strong>Motivo de Alerta:</strong> {emergencyReportData.causa_bloqueo}</div>
                </div>

                <div>
                  <h3 style={{ fontSize: '0.9rem', marginBlockEnd: '0.5rem', color: 'var(--color-primary)' }}>1. Descargar Archivos de Aviso Regulatorio</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={downloadEmergencyXML} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                      📥 Descargar XML (SAT 24h)
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={downloadEmergencyJSON} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                      📥 Descargar Ficha JSON
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingBlockStart: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', marginBlockEnd: '0.75rem', color: 'var(--color-primary)' }}>2. Registrar Resolución Normativa</h3>
                  
                  <div className="form-group" style={{ marginBlockEnd: '1rem' }}>
                    <label className="form-label">Folio de Acuse Oficial del SAT</label>
                    <input 
                      type="text" 
                      value={acuseFolio}
                      onChange={(e) => setAcuseFolio(e.target.value)}
                      className="form-control" 
                      placeholder="Ej. ACUSE-PLD-2026-987654" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notas de Dictamen y Cierre de Alerta</label>
                    <textarea 
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="form-control" 
                      rows={2}
                      placeholder="Describa brevemente la confirmación de la carga del aviso o las observaciones de la investigación..."
                      required
                    ></textarea>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1rem', marginBlockStart: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setActiveEmergencyAlert(null); setEmergencyReportData(null); }}>Cerrar</button>
                  <button type="submit" className="btn" style={{ backgroundColor: 'var(--color-danger)' }} disabled={submittingResolution}>
                    {submittingResolution ? 'Registrando...' : '✓ Confirmar Presentación de Aviso'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
