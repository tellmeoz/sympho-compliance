'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface ReportMetadata {
  organization: {
    rfc: string;
    name: string;
    activity: string;
  };
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  uma_value_2026: number;
  aviso_threshold_mxn: number;
  total_donations_count: number;
  total_reportable_amount: number;
}

interface ReportableDonation {
  id: string;
  amount: number;
  date: string;
  method: string;
  campaign: string;
  donor_id: string;
  donor_accumulation_6m: number;
  donors: {
    id: string;
    name: string;
    rfc: string;
    type: 'Persona Física' | 'Persona Moral';
    curp: string | null;
    dob_or_constitution: string;
    economic_activity: string;
    funds_origin: string;
    address_street: string;
    address_number_ext: string;
    address_number_int: string | null;
    address_colony: string;
    address_city: string;
    address_state: string;
    address_zip: string;
    email: string | null;
    phone: string | null;
    representative_name: string | null;
    representative_rfc: string | null;
    representative_curp: string | null;
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  
  // Período de búsqueda (Por defecto el mes actual)
  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());
  
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [donations, setDonations] = useState<ReportableDonation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];

  const handleFetchReport = async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/reports/sat?month=${month}&year=${year}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('No autorizado: Se requieren permisos de Oficial de Cumplimiento');
        }
        throw new Error('Error al generar el reporte del SAT');
      }
      const data = await res.json();
      setMetadata(data.metadata || null);
      setDonations(data.donations || []);
    } catch (err: any) {
      setError(err.message);
      setMetadata(null);
      setDonations([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  };

  // Generar y descargar reporte oficial JSON
  const downloadJSON = () => {
    if (!metadata || donations.length === 0) return;

    const reportJSON = {
      tipo_reporte: "MENSUAL_PLD_SHCP",
      fecha_generacion: new Date().toISOString(),
      sujeto_obligado: {
        rfc: metadata.organization.rfc,
        razon_social: metadata.organization.name,
        actividad_vulneraria: "Recepción de Donativos (LFPIORPI Art. 17 Fracc. XIII)"
      },
      periodo_reportado: `${metadata.period.year}-${String(metadata.period.month).padStart(2, '0')}`,
      resumen: {
        total_avisos: metadata.total_donations_count,
        monto_total_reportado: metadata.total_reportable_amount
      },
      avisos: donations.map(don => ({
        id_operacion: don.id,
        fecha_operacion: don.date,
        monto: don.amount,
        forma_pago: don.method,
        campana: don.campaign,
        acumulado_semestral: don.donor_accumulation_6m,
        donante: {
          tipo_persona: don.donors.type,
          nombre_o_razon_social: don.donors.name,
          rfc: don.donors.rfc,
          curp: don.donors.curp || undefined,
          fecha_nacimiento_o_constitucion: don.donors.dob_or_constitution,
          actividad_economica: don.donors.economic_activity,
          procedencia_fondos: don.donors.funds_origin,
          telefono: don.donors.phone || undefined,
          email: don.donors.email || undefined,
          domicilio_fiscal: {
            calle: don.donors.address_street,
            numero_exterior: don.donors.address_number_ext,
            numero_interior: don.donors.address_number_int || undefined,
            colonia: don.donors.address_colony,
            ciudad_o_municipio: don.donors.address_city,
            estado: don.donors.address_state,
            codigo_postal: don.donors.address_zip
          },
          representante_legal: don.donors.type === 'Persona Moral' ? {
            nombre: don.donors.representative_name,
            rfc: don.donors.representative_rfc,
            curp: don.donors.representative_curp
          } : undefined
        }
      }))
    };

    const blob = new Blob([JSON.stringify(reportJSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SAT_PLD_DONATIVOS_${metadata.period.year}_${String(metadata.period.month).padStart(2, '0')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Generar y descargar reporte oficial XML
  const downloadXML = () => {
    if (!metadata || donations.length === 0) return;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<ReporteMensualPLD xmlns="http://www.sppld.sat.gob.mx/formatos/donatarias" version="1.0">\n`;
    xml += `  <SujetoObligado rfc="${metadata.organization.rfc}" razonSocial="${escapeXml(metadata.organization.name)}" />\n`;
    xml += `  <Periodo año="${metadata.period.year}" mes="${String(metadata.period.month).padStart(2, '0')}" />\n`;
    xml += `  <Resumen totalAvisos="${metadata.total_donations_count}" montoTotal="${metadata.total_reportable_amount.toFixed(2)}" />\n`;
    xml += `  <Avisos>\n`;

    donations.forEach(don => {
      xml += `    <Aviso idOperacion="${don.id}" fecha="${don.date}" monto="${don.amount.toFixed(2)}" formaPago="${don.method}">\n`;
      xml += `      <Donante tipo="${don.donors.type}" nombre="${escapeXml(don.donors.name)}" rfc="${don.donors.rfc}" curp="${don.donors.curp || ''}">\n`;
      xml += `        <Domicilio calle="${escapeXml(don.donors.address_street)}" ext="${don.donors.address_number_ext}" int="${don.donors.address_number_int || ''}" colonia="${escapeXml(don.donors.address_colony)}" municipio="${escapeXml(don.donors.address_city)}" estado="${escapeXml(don.donors.address_state)}" cp="${don.donors.address_zip}" />\n`;
      if (don.donors.type === 'Persona Moral') {
        xml += `        <RepresentanteLegal nombre="${escapeXml(don.donors.representative_name || '')}" rfc="${don.donors.representative_rfc || ''}" curp="${don.donors.representative_curp || ''}" />\n`;
      }
      xml += `      </Donante>\n`;
      xml += `    </Aviso>\n`;
    });

    xml += `  </Avisos>\n`;
    xml += `</ReporteMensualPLD>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SAT_PLD_DONATIVOS_${metadata.period.year}_${String(metadata.period.month).padStart(2, '0')}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const escapeXml = (unsafe: string) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
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

  if (user?.role !== 'Oficial de Cumplimiento') {
    return (
      <section className="view-panel active">
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>
          ⚠️ Acceso Restringido: Esta sección contiene la descarga de reportes oficiales del SAT y solo está disponible para el Oficial de Cumplimiento de la organización.
        </div>
      </section>
    );
  }

  return (
    <section className="view-panel active">
      <div className="card-widget">
        <div className="widget-header">
          <h2>Centro de Reportes SAT (Declaración Mensual PLD)</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>
            Identifica y exporta los donativos recibidos de donantes que superan el Umbral de Aviso Obligatorio de 3,210 UMA ($376,565.10 MXN).
          </p>
        </div>

        {/* Panel de Selección de Periodo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBlock: '1.5rem', alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label">Mes de Operación</label>
            <select 
              className="form-control" 
              value={month} 
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ backgroundColor: 'var(--bg-main)' }}
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Año</label>
            <select 
              className="form-control" 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ backgroundColor: 'var(--bg-main)' }}
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <button className="btn" onClick={handleFetchReport} style={{ height: '45px' }} disabled={loading}>
            {loading ? 'Generando...' : '🔍 Buscar Operaciones'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-danger-glow)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', marginBlockEnd: '1.5rem', color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Resumen y Botones de Descarga */}
        {metadata && donations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.01)', marginBlockEnd: '2rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBlockEnd: '0.75rem', color: 'var(--color-primary)' }}>Resumen de Declaración Mensual</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div><strong>Organización:</strong> {metadata.organization.name}</div>
                <div><strong>Periodo:</strong> {months.find(m => m.value === metadata.period.month)?.label} {metadata.period.year}</div>
                <div><strong>Umbral de Aviso (3,210 UMA):</strong> {formatCurrency(metadata.aviso_threshold_mxn)}</div>
                <div><strong>Monto Reportable Acumulado:</strong> <strong style={{ color: 'var(--color-danger)' }}>{formatCurrency(metadata.total_reportable_amount)}</strong></div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Total de avisos a presentar:</strong> <span className="badge danger" style={{ fontSize: '0.8rem', paddingInline: '0.5rem' }}>{metadata.total_donations_count} operaciones</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
              <button className="btn" onClick={downloadJSON} style={{ width: '100%' }}>
                📥 Descargar Reporte (JSON)
              </button>
              <button className="btn btn-secondary" onClick={downloadXML} style={{ width: '100%', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                📥 Descargar Borrador XML
              </button>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', display: 'block', marginBlockStart: '0.25rem' }}>
                * El XML sirve como borrador interno y pre-validación.
              </span>
            </div>
          </div>
        )}

        {/* Tabla de operaciones reportables */}
        {searched && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Donante / RFC</th>
                  <th>Tipo</th>
                  <th>Monto de Operación</th>
                  <th>Acumulado Semestral</th>
                  <th>Método</th>
                  <th>Campaña</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                      Procesando reporte de cumplimiento...
                    </td>
                  </tr>
                ) : donations.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                      🟢 No se encontraron operaciones que requieran la presentación de Aviso en este período.
                    </td>
                  </tr>
                ) : (
                  donations.map(don => (
                    <tr key={don.id}>
                      <td style={{ fontSize: '0.85rem' }}>
                        {new Date(don.date).toLocaleDateString('es-MX')}
                      </td>
                      <td>
                        <strong>{don.donors.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RFC: {don.donors.rfc}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {don.donors.type}
                      </td>
                      <td>
                        <strong>{formatCurrency(don.amount)}</strong>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                          {formatCurrency(don.donor_accumulation_6m)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {don.method}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {don.campaign}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guía informativa sobre carga al SAT */}
      {metadata && donations.length > 0 && (
        <div className="card-widget" style={{ marginBlockStart: '2rem', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', marginBlockEnd: '0.75rem' }}>
            💡 Guía de Presentación de Avisos ante el Portal de Prevención de Lavado de Dinero (SAT / SHCP)
          </h3>
          <ol style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingInlineStart: '1.25rem' }}>
            <li>Descarga el archivo estructurado **XML** o **JSON** oficial utilizando los botones superiores.</li>
            <li>Inicia sesión con tu e.firma en el **Sistema de Portal en Línea (SPPLD)** de la SHCP.</li>
            <li>Ve a la sección de **Presentación de Avisos** ➔ Carga masiva de archivos.</li>
            <li>Selecciona el archivo descargado y cárgalo para su validación de esquema contra la plantilla del SAT.</li>
            <li>Descarga tu acuse de recepción oficial y regístralo en tus expedientes internos para auditorías futuras de la CNBV.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
