'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface Donor {
  id: string;
  name: string;
  rfc: string;
}

interface Donation {
  id: string;
  amount: number;
  date: string;
  method: string;
  campaign: string;
  status: string;
  donors?: {
    name: string;
    rfc: string;
  };
}

export default function TransactionsPage() {
  const { csrfToken } = useAuth();
  
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos de formulario
  const [formDonorId, setFormDonorId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('Transferencia');
  const [formCampaign, setFormCampaign] = useState('Construcción de Clínicas');
  const [alertNotification, setAlertNotification] = useState<{
    type: 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);

  const fetchData = async () => {
    try {
      const [donorsRes, donationsRes] = await Promise.all([
        fetch('/api/donors'),
        fetch('/api/donations')
      ]);

      if (!donorsRes.ok || !donationsRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const donorsData = await donorsRes.json();
      const donationsData = await donationsRes.json();

      const activeDonors = (donorsData.donors || []).filter((d: any) => d.overall_status !== 'blocked');
      setDonors(activeDonors);
      setDonations(donationsData.donations || []);
      
      if (activeDonors.length > 0 && !formDonorId) {
        setFormDonorId(activeDonors[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAlertNotification(null);

    const payload = {
      donor_id: formDonorId,
      amount: Number(formAmount),
      date: new Date().toISOString().split('T')[0], // Fecha de hoy
      method: formMethod,
      campaign: formCampaign
    };

    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        throw new Error(errorMsg || 'Error al procesar donación');
      }

      // Validar si el trigger cambió el estatus del donante a alerta
      const status = data.donorStatus;
      const donorName = donors.find(d => d.id === formDonorId)?.name || 'Donante';
      
      if (status) {
        if (status.overall_status === 'danger') {
          setAlertNotification({
            type: 'danger',
            message: `⚠️ ALERTA CRÍTICA: La donación ha sido registrada. ${donorName} ha excedido el Umbral de Aviso Obligatorio del SAT ($376,565.10 MXN). Se requiere emitir dictamen y enviar aviso dentro de las primeras 24h del mes entrante.`
          });
        } else if (status.overall_status === 'warning') {
          setAlertNotification({
            type: 'warning',
            message: `⚠️ NOTIFICACIÓN: La donación ha sido registrada. ${donorName} superó el Umbral de Identificación ($188,282.55 MXN). El expediente requiere la carga inmediata de los documentos KYC obligatorios.`
          });
        } else {
          setAlertNotification({
            type: 'success',
            message: `✅ Donación de ${formatCurrency(payload.amount)} registrada exitosamente para ${donorName}. Operación en cumplimiento.`
          });
        }
      }

      // Reiniciar campo de monto
      setFormAmount('');
      fetchData(); // Recargar tablas

    } catch (err: any) {
      alert(`Error al registrar donativo: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="view-panel active">
      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlockEnd: '1.5rem', color: 'var(--color-danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {alertNotification && (
        <div style={{ 
          padding: '1.25rem', 
          backgroundColor: alertNotification.type === 'danger' ? 'var(--color-danger-glow)' : alertNotification.type === 'warning' ? 'var(--color-warning-glow)' : 'var(--color-success-glow)', 
          border: `1px solid ${alertNotification.type === 'danger' ? 'var(--color-danger)' : alertNotification.type === 'warning' ? 'var(--color-warning)' : 'var(--color-success)'}`, 
          borderRadius: 'var(--radius-md)', 
          marginBlockEnd: '1.5rem', 
          color: alertNotification.type === 'danger' ? 'var(--color-danger)' : alertNotification.type === 'warning' ? 'var(--color-warning)' : 'var(--color-success)',
          fontWeight: 500,
          lineHeight: 1.4
        }}>
          {alertNotification.message}
        </div>
      )}

      <div className="donor-detail-grid">
        {/* Registrar Donación (Simulador) */}
        <div className="card-widget">
          <div className="widget-header">
            <h2>Simulador de Registro de Donativos</h2>
          </div>
          
          <form onSubmit={handleFormSubmit} className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBlockStart: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Seleccionar Donante Activo</label>
              {donors.length === 0 ? (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBlockStart: '0.25rem' }}>
                  No hay donantes activos registrados en el sistema. <Link href="/donors" style={{ color: 'var(--color-primary)' }}>Registrar uno primero</Link>.
                </div>
              ) : (
                <select 
                  className="form-control" 
                  value={formDonorId} 
                  onChange={(e) => setFormDonorId(e.target.value)}
                  required
                >
                  {donors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.rfc})</option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="form-group">
              <label className="form-label">Monto del Donativo ($ MXN)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="Ej. 150000" 
                min="1" 
                step="0.01" 
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Método de Pago</label>
              <select 
                className="form-control" 
                value={formMethod} 
                onChange={(e) => setFormMethod(e.target.value)}
                required
              >
                <option value="Transferencia">Transferencia Electrónica</option>
                <option value="Cheque">Cheque Nominativo</option>
                <option value="Tarjeta">Tarjeta de Crédito / Débito</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Campaña / Destino del Recurso</label>
              <select 
                className="form-control" 
                value={formCampaign} 
                onChange={(e) => setFormCampaign(e.target.value)}
                required
              >
                <option value="Construcción de Clínicas">Construcción de Clínicas de Rehabilitación</option>
                <option value="Educación y Becas">Programa de Becas y Educación Inclusiva</option>
                <option value="Equipamiento Médico">Equipamiento y Tecnología Médica</option>
                <option value="Apoyo Directo">Fondo de Apoyo Directo Familiar</option>
              </select>
            </div>

            <div style={{ marginBlockStart: '1rem' }}>
              <button 
                type="submit" 
                className="btn" 
                disabled={submitting || donors.length === 0}
                style={{ width: '100%' }}
              >
                {submitting ? 'Procesando Donación y Límites...' : 'Registrar Donativo en Bitácora'}
              </button>
            </div>
          </form>
        </div>

        {/* Registro de Transacciones */}
        <div className="card-widget">
          <div className="widget-header">
            <h2>Bitácora General de Operaciones</h2>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Donante</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Campaña</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Cargando historial de operaciones...
                    </td>
                  </tr>
                ) : donations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      Sin donativos registrados en la organización.
                    </td>
                  </tr>
                ) : (
                  donations.map(tx => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.date).toLocaleDateString('es-MX')}</td>
                      <td>
                        <strong>{tx.donors?.name || 'Cargando...'}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.donors?.rfc}</div>
                      </td>
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
    </section>
  );
}
