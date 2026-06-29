'use client';

import React, { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastProvider';

interface Donor {
  id: string;
  name: string;
  rfc: string;
  type: 'Persona Física' | 'Persona Moral';
  curp: string;
  dob_or_constitution: string;
  economic_activity: string;
  funds_origin: string;
  address_street: string;
  address_number_ext: string;
  address_number_int?: string;
  address_colony: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  representative_name?: string;
  representative_rfc?: string;
  representative_curp?: string;
  beneficiary_controller_info?: string;
  risk: 'Bajo' | 'Medio' | 'Alto';
  screening_status: 'ok' | 'blocked' | 'investigating';
  kyc_status: 'complete' | 'incomplete' | 'pending_review';
  threshold_status: 'ok' | 'identification_exceeded' | 'aviso_exceeded';
  overall_status: 'ok' | 'warning' | 'danger' | 'blocked';
  notes: string;
  accumulation: number;
}

interface Donation {
  id: string;
  amount: number;
  date: string;
  method: string;
  campaign: string;
  status: string;
}

interface Alert {
  id: string;
  alert_type: string;
  category: string;
  title: string;
  description: string;
  status: 'active' | 'investigating' | 'resolved';
  notes?: string;
  created_at: string;
}

interface Document {
  id: string;
  document_type: 'ine' | 'acta' | 'rfc' | 'comprobante';
  file_name: string;
  review_status: 'ok' | 'missing' | 'pending_review' | 'rejected';
  rejection_reason?: string;
  signedUrl?: string;
}

export default function DonorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, csrfToken } = useAuth();
  const { showToast } = useToast();
  
  const [donor, setDonor] = useState<Donor | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados de formularios locales
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  // Estados para el visor Lightbox
  const [activeViewerDoc, setActiveViewerDoc] = useState<Document | null>(null);
  const [rejectionNotesInput, setRejectionNotesInput] = useState('');
  const [reviewingInViewer, setReviewingInViewer] = useState(false);

  const fetchDonorDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/donors/${id}`);
      if (!res.ok) throw new Error('Error al cargar la información del donante');
      const data = await res.json();
      
      setDonor(data.donor);
      setDonations(data.donations || []);
      setAlerts(data.alerts || []);
      setDocuments(data.documents || []);
      setNotesText(data.donor.notes || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDonorDetail();
  }, [fetchDonorDetail]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  };

  // UMA 2026 y límites regulatorios
  const UMA_VALUE = 117.31;
  const LIMIT_IDENTIFICATION = UMA_VALUE * 1605; // $188,282.55
  const LIMIT_AVISO = UMA_VALUE * 3210; // $376,565.10

  // Guardar notas internas del donante
  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      // Actualizar las notas del donante a través del endpoint PATCH
      const res = await fetch(`/api/donors/${id}/update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ notes: notesText })
      });
      
      if (!res.ok) throw new Error('Error al actualizar las notas');
      showToast('Comentarios guardados exitosamente.', 'success');
      fetchDonorDetail();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    } finally {
      setSavingNotes(false);
    }
  };

  // Subir archivos KYC
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingDocType(type);
    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('donor_id', id);
    formData.append('document_type', type);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir archivo');
      
      showToast('Documento cargado exitosamente. Se puso en revisión.', 'success');
      fetchDonorDetail();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    } finally {
      setUploadingDocType(null);
    }
  };

  // Dictaminar Documento (Aprobar / Rechazar)
  const handleReviewDocument = async (docId: string, status: 'ok' | 'rejected', reason?: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          review_status: status,
          rejection_reason: reason || ''
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar dictamen');
      
      showToast(status === 'ok' ? 'Documento aprobado y validado.' : 'Documento rechazado.', 'success');
      fetchDonorDetail();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  };

  // Resolver Alerta de Cumplimiento
  const handleResolveAlert = async (alertId: string) => {
    if (!resolutionNotes.trim()) {
      showToast('Debe ingresar las notas de dictamen de investigación.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ notes: resolutionNotes })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al resolver la alerta');
      
      showToast('Alerta dictaminada y archivada exitosamente.', 'success');
      setResolvingAlertId(null);
      setResolutionNotes('');
      fetchDonorDetail();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeContent: 'center', minHeight: '50vh' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando expediente del donante...</p>
      </div>
    );
  }

  if (!donor) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-danger)' }}>⚠️ Donante no encontrado o sin privilegios de acceso.</p>
        <Link href="/donors" className="btn" style={{ marginBlockStart: '1rem', inlineSize: 'fit-content' }}>Volver al directorio</Link>
      </div>
    );
  }

  // Calcular porcentaje de barra de progreso
  const accumulation = donor.accumulation;
  const progressPercent = Math.min((accumulation / LIMIT_AVISO) * 100, 100);

  // Mapear documentos cargados
  const docMap = new Map(documents.map(d => [d.document_type, d]));

  // Documentos requeridos por ley
  const requiredDocs = donor.type === 'Persona Física' 
    ? [
        { type: 'ine' as const, label: 'Identificación Oficial Vigente (INE/Pasaporte)' },
        { type: 'rfc' as const, label: 'Constancia de Situación Fiscal (RFC)' },
        { type: 'comprobante' as const, label: 'Comprobante de Domicilio Fiscal (< 3 meses)' }
      ]
    : [
        { type: 'acta' as const, label: 'Acta Constitutiva debidamente inscrita' },
        { type: 'rfc' as const, label: 'Cédula de Identificación Fiscal (RFC)' },
        { type: 'comprobante' as const, label: 'Comprobante de Domicilio de la Persona Moral' },
        { type: 'ine' as const, label: 'Identificación del Representante Legal' }
      ];

  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'investigating');

  return (
    <section className="view-panel active">
      <div style={{ marginBlockEnd: '1.5rem' }}>
        <Link href="/donors" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          ← Volver al Directorio
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlockEnd: '1.5rem', color: 'var(--color-danger)' }}>
          ⚠️ {error}
        </div>
      )}

      <div className="donor-detail-grid">
        {/* Información del Donante */}
        <div className="card-widget">
          <div className="donor-meta-card">
            <div className="donor-title-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2>{donor.name}</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>RFC: {donor.rfc}</span>
              </div>
              <span className={`badge ${
                donor.overall_status === 'blocked' ? 'danger' :
                donor.overall_status === 'danger' ? 'danger' :
                donor.overall_status === 'warning' ? 'warning' : 'success'
              }`}>
                {donor.overall_status === 'blocked' ? '🚫 Bloqueado' :
                 donor.overall_status === 'danger' ? '⚠️ Alerta de Aviso SAT' :
                 donor.overall_status === 'warning' ? '📂 Incompleto' : '✅ Cumplimiento OK'}
              </span>
            </div>

            <div className="meta-info-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBlock: '1.5rem' }}>
              <div className="meta-info-item">
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tipo de Donante</span>
                <strong className="meta-info-value">{donor.type}</strong>
              </div>
              <div className="meta-info-item">
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nivel de Riesgo PLD</span>
                <strong className="meta-info-value">{donor.risk}</strong>
              </div>
              <div className="meta-info-item">
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fecha de {donor.type === 'Persona Física' ? 'Nacimiento' : 'Constitución'}</span>
                <strong className="meta-info-value">{new Date(donor.dob_or_constitution).toLocaleDateString('es-MX')}</strong>
              </div>
              <div className="meta-info-item">
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actividad Económica</span>
                <strong className="meta-info-value" style={{ fontSize: '0.9rem' }}>{donor.economic_activity}</strong>
              </div>
              <div className="meta-info-item" style={{ gridColumn: 'span 2' }}>
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Domicilio Fiscal Declarado</span>
                <strong className="meta-info-value" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {`${donor.address_street} No. ${donor.address_number_ext}${donor.address_number_int ? ` Int. ${donor.address_number_int}` : ''}, Col. ${donor.address_colony}, C.P. ${donor.address_zip}, ${donor.address_city}, ${donor.address_state}`}
                </strong>
              </div>
              {donor.type === 'Persona Moral' && (
                <div className="meta-info-item" style={{ gridColumn: 'span 2', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Representación Legal</span>
                  <div style={{ fontSize: '0.85rem' }}>Nombre: <strong>{donor.representative_name}</strong></div>
                  <div style={{ fontSize: '0.85rem' }}>RFC: <strong>{donor.representative_rfc}</strong> {donor.representative_curp && <>| CURP: <strong>{donor.representative_curp}</strong></>}</div>
                </div>
              )}
              <div className="meta-info-item" style={{ gridColumn: 'span 2' }}>
                <span className="meta-info-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Procedencia de Fondos</span>
                <p style={{ fontSize: '0.85rem', color: '#fff', fontStyle: 'italic', marginBlockStart: '0.25rem' }}>&quot;{donor.funds_origin}&quot;</p>
              </div>
            </div>

            {/* Checklist Documental (KYC) */}
            <div style={{ marginBlockStart: '2rem' }}>
              <h3 style={{ fontSize: '1rem', marginBlockEnd: '1rem', color: 'var(--color-primary)' }}>Expediente de Identificación Requerido</h3>
              <div className="checklist-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {requiredDocs.map(doc => {
                  const dbDoc = docMap.get(doc.type);
                  const status = dbDoc?.review_status || 'missing';

                  return (
                    <div key={doc.type} className={`checklist-item ${status === 'ok' ? 'checked' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{doc.label}</div>
                        {dbDoc && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Archivo: <span style={{ color: '#fff' }}>{dbDoc.file_name}</span>
                            {dbDoc.rejection_reason && <div style={{ color: 'var(--color-danger)' }}>Motivo rechazo: {dbDoc.rejection_reason}</div>}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {status === 'ok' && (
                          <>
                            <span className="badge success">Aprobado</span>
                            {dbDoc?.signedUrl && (
                              <button onClick={() => setActiveViewerDoc(dbDoc)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                👁️ Ver
                              </button>
                            )}
                          </>
                        )}
                        {status === 'pending_review' && (
                          <>
                            <span className="badge warning">En revisión</span>
                            {dbDoc?.signedUrl && (
                              <button onClick={() => setActiveViewerDoc(dbDoc)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                👁️ Ver / Dictaminar
                              </button>
                            )}
                          </>
                        )}
                        {(status === 'missing' || status === 'rejected') && (
                          <>
                            <span className="badge danger">{status === 'rejected' ? 'Rechazado' : 'Faltante'}</span>
                            <label className="btn" style={{ cursor: 'pointer', padding: '0.35rem 0.6rem', fontSize: '0.75rem', margin: 0 }}>
                              {uploadingDocType === doc.type ? 'Cargando...' : '📁 Subir'}
                              <input 
                                type="file" 
                                onChange={(e) => handleFileUpload(e, doc.type)} 
                                accept="application/pdf,image/jpeg,image/png"
                                style={{ display: 'none' }} 
                                disabled={uploadingDocType !== null}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Acumulación Histórica e Hitos */}
        <div className="card-widget">
          <div className="widget-header">
            <h2>Acumulación de Operaciones (Últimos 6 Meses)</h2>
          </div>

          <div className="accumulation-progress-box" style={{ marginBlock: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
            <div className="progress-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Progreso de Donativos</span>
              <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(accumulation)}</strong>
            </div>
            
            <div className="progress-bar-container" style={{ width: '100%', height: '12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${progressPercent}%`, 
                  height: '100%', 
                  background: donor.overall_status === 'danger' ? 'var(--color-danger)' : 'linear-gradient(to right, var(--color-primary), var(--color-success))',
                  borderRadius: '9999px',
                  transition: 'width 0.5s ease'
                }}
              ></div>
            </div>

            <div className="progress-thresholds" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              <span className={accumulation >= LIMIT_IDENTIFICATION ? 'trend-down' : ''} style={{ color: accumulation >= LIMIT_IDENTIFICATION ? 'var(--color-warning)' : '' }}>
                Identificación: {formatCurrency(LIMIT_IDENTIFICATION)}
              </span>
              <span className={accumulation >= LIMIT_AVISO ? 'trend-down' : ''} style={{ color: accumulation >= LIMIT_AVISO ? 'var(--color-danger)' : '' }}>
                Aviso Obligatorio: {formatCurrency(LIMIT_AVISO)}
              </span>
            </div>
          </div>

          {/* Alertas PLD de este Donante */}
          {activeAlerts.length > 0 && (
            <div style={{ marginBlockStart: '1.5rem', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'var(--color-danger-glow)' }}>
              <h3 style={{ fontSize: '0.95rem', color: 'var(--color-danger)', marginBlockEnd: '0.75rem' }}>Alertas de Cumplimiento por Dictaminar</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {activeAlerts.map(alert => (
                  <div key={alert.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alert.title}</div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{alert.description}</p>
                    
                    {resolvingAlertId === alert.id ? (
                      <div style={{ marginBlockStart: '0.5rem' }}>
                        <textarea 
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          className="form-control"
                          rows={2}
                          placeholder="Escriba el dictamen de investigación legal sobre el origen de fondos..."
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        ></textarea>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBlockStart: '0.5rem' }}>
                          <button onClick={() => handleResolveAlert(alert.id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-success)', color: '#000' }}>
                            Dictaminar Favorable (Resolver)
                          </button>
                          <button onClick={() => setResolvingAlertId(null)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      user?.role === 'Oficial de Cumplimiento' && (
                        <button onClick={() => { setResolvingAlertId(alert.id); setResolutionNotes(''); }} className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginBlockStart: '0.5rem' }}>
                          ⚖️ Dictaminar e Investigar Alerta
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comentarios y notas */}
          <div style={{ marginBlockStart: '1.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBlockEnd: '0.75rem', color: 'var(--text-muted)' }}>Notas de Cumplimiento e Investigación</h3>
            <textarea 
              value={notesText} 
              onChange={(e) => setNotesText(e.target.value)} 
              className="form-control" 
              rows={3} 
              style={{ width: '100%', resize: 'vertical' }} 
              placeholder="Escriba notas sobre el origen de los recursos o auditoría del donante..."
            ></textarea>
            <button 
              className="btn btn-secondary" 
              style={{ marginBlockStart: '0.75rem', width: '100%' }} 
              onClick={handleSaveNotes}
              disabled={savingNotes}
            >
              {savingNotes ? 'Guardando...' : 'Guardar Notas'}
            </button>
          </div>

          {/* Transacciones recientes */}
          <div style={{ marginBlockStart: '2rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBlockEnd: '0.75rem', color: 'var(--text-muted)' }}>Historial Reciente de Donaciones</h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Vía</th>
                    <th>Campaña</th>
                    <th>Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                        No se han registrado donativos para este donante.
                      </td>
                    </tr>
                  ) : (
                    donations.map(tx => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.date).toLocaleDateString('es-MX')}</td>
                        <td>{formatCurrency(tx.amount)}</td>
                        <td>{tx.method}</td>
                        <td>{tx.campaign}</td>
                        <td>
                          <span className={`badge ${tx.status === 'Validada' ? 'success' : 'warning'}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Document Viewer Overlay */}
      {activeViewerDoc && (
        <div className="lightbox-overlay" onClick={() => { setActiveViewerDoc(null); setRejectionNotesInput(''); }}>
          <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-preview-area">
              {activeViewerDoc.file_name.toLowerCase().endsWith('.pdf') ? (
                <iframe src={activeViewerDoc.signedUrl} className="lightbox-doc-frame" title="Visualizador PDF" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={activeViewerDoc.signedUrl} className="lightbox-img-preview" alt="Vista previa de documento" />
              )}
            </div>
            <div className="lightbox-sidebar">
              <div className="lightbox-header">
                <div className="lightbox-title">
                  <h3>
                    {activeViewerDoc.document_type === 'ine' && 'Identificación Oficial (INE)'}
                    {activeViewerDoc.document_type === 'rfc' && 'Cédula RFC / Constancia'}
                    {activeViewerDoc.document_type === 'comprobante' && 'Comprobante de Domicilio'}
                    {activeViewerDoc.document_type === 'acta' && 'Acta Constitutiva'}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Archivo: {activeViewerDoc.file_name}
                  </p>
                </div>
                <button className="lightbox-close-btn" onClick={() => { setActiveViewerDoc(null); setRejectionNotesInput(''); }}>×</button>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                <div>
                  <strong>Estado Actual: </strong>
                  <span className={`badge ${
                    activeViewerDoc.review_status === 'ok' ? 'success' :
                    activeViewerDoc.review_status === 'pending_review' ? 'warning' : 'danger'
                  }`}>
                    {activeViewerDoc.review_status === 'ok' ? 'Aprobado' :
                     activeViewerDoc.review_status === 'pending_review' ? 'Pendiente de Revisión' : 'Rechazado'}
                  </span>
                </div>
                
                {activeViewerDoc.rejection_reason && (
                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)' }}>
                    <strong>Motivo del Rechazo: </strong>
                    {activeViewerDoc.rejection_reason}
                  </div>
                )}
                
                {activeViewerDoc.review_status === 'pending_review' && user?.role === 'Oficial de Cumplimiento' && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Comentarios o Motivo de Rechazo</label>
                      <textarea
                        value={rejectionNotesInput}
                        onChange={(e) => setRejectionNotesInput(e.target.value)}
                        className="form-control"
                        placeholder="Escriba aquí los motivos si decide rechazar el documento..."
                        rows={3}
                        style={{ fontSize: '0.8rem' }}
                      />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ backgroundColor: 'var(--color-success)', color: 'var(--bg-main)' }}
                        onClick={async () => {
                          setReviewingInViewer(true);
                          await handleReviewDocument(activeViewerDoc.id, 'ok');
                          setReviewingInViewer(false);
                          setActiveViewerDoc(null);
                        }}
                        disabled={reviewingInViewer}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ backgroundColor: 'var(--color-danger)' }}
                        onClick={async () => {
                          if (!rejectionNotesInput.trim()) {
                            showToast('Debe ingresar un motivo de rechazo.', 'warning');
                            return;
                          }
                          setReviewingInViewer(true);
                          await handleReviewDocument(activeViewerDoc.id, 'rejected', rejectionNotesInput.trim());
                          setReviewingInViewer(false);
                          setActiveViewerDoc(null);
                          setRejectionNotesInput('');
                        }}
                        disabled={reviewingInViewer}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
