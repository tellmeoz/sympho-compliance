'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

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

export default function Dashboard() {
  const { csrfToken } = useAuth();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
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
    }

    fetchDashboardData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
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
              alerts.slice(0, 5).map(alert => (
                <div key={alert.id} className={`alert-item ${
                  alert.alert_type === 'blocked' ? 'danger' : 
                  alert.alert_type === 'danger' ? 'danger' : 'warning'
                }`} style={{ opacity: alert.status === 'resolved' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{alert.title}</strong>
                    <span className="alert-time" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(alert.created_at).toLocaleDateString('es-MX')}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', marginBlockStart: '0.25rem', color: 'var(--text-muted)' }}>{alert.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockStart: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                      Donante: <strong>{alert.donors?.name || 'Cargando...'}</strong>
                    </span>
                    <span className={`badge ${alert.status === 'resolved' ? 'success' : 'warning'}`} style={{ fontSize: '0.7rem' }}>
                      {alert.status === 'resolved' ? 'Dictaminada' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
