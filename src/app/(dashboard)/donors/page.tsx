'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ToastProvider';

interface Donor {
  id: string;
  name: string;
  rfc: string;
  type: string;
  risk: string;
  accumulation: number;
  overall_status: 'ok' | 'warning' | 'danger' | 'blocked';
  kyc_status: string;
}

export default function DonorsPage() {
  const { csrfToken } = useAuth();
  const { showToast } = useToast();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para el Modal de Agregar Donante
  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<'Persona Física' | 'Persona Moral'>('Persona Física');
  const [formData, setFormData] = useState({
    name: '',
    rfc: '',
    curp: '',
    dob_or_constitution: '',
    email: '',
    phone: '',
    address_street: '',
    address_number_ext: '',
    address_number_int: '',
    address_colony: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    economic_activity: '',
    funds_origin: '',
    representative_name: '',
    representative_rfc: '',
    representative_curp: '',
    beneficiary_controller_info: '',
    risk: 'Bajo',
    notes: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchDonors = async () => {
    try {
      const res = await fetch('/api/donors');
      if (!res.ok) throw new Error('Error al recuperar la lista de donantes');
      const data = await res.json();
      setDonors(data.donors || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDonors();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  };

  // Filtrado de donantes en tiempo real
  const filteredDonors = donors.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.rfc.toLowerCase().includes(search.toLowerCase()) ||
    d.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Limpiar error al escribir
    if (formErrors[name]) {
      setFormErrors(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});
    
    // Preparar payload de validación
    const payload = {
      ...formData,
      type: formType,
      // Convertir campos opcionales vacíos a nulos
      curp: formData.curp || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address_number_int: formData.address_number_int || undefined,
      representative_name: formType === 'Persona Moral' ? formData.representative_name : undefined,
      representative_rfc: formType === 'Persona Moral' ? formData.representative_rfc : undefined,
      representative_curp: formType === 'Persona Moral' ? formData.representative_curp : undefined,
      beneficiary_controller_info: formData.beneficiary_controller_info || undefined,
      notes: formData.notes || undefined
    };

    try {
      const res = await fetch('/api/donors', {
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
          // Extraer errores Zod mapeando paths a mensajes
          const errors: Record<string, string> = {};
          Object.entries(result.details).forEach(([key, val]: any) => {
            if (val && typeof val === 'object' && '_errors' in val) {
              errors[key] = (val as any)._errors?.[0] || 'Campo inválido';
            }
          });
          setFormErrors(errors);
        } else {
          const errorMsg = result.details ? `${result.error}: ${result.details}` : result.error;
          showToast(`Error: ${errorMsg}`, 'danger');
        }
        return;
      }

      // Reiniciar formulario y cerrar modal
      setFormData({
        name: '',
        rfc: '',
        curp: '',
        dob_or_constitution: '',
        email: '',
        phone: '',
        address_street: '',
        address_number_ext: '',
        address_number_int: '',
        address_colony: '',
        address_city: '',
        address_state: '',
        address_zip: '',
        economic_activity: '',
        funds_origin: '',
        representative_name: '',
        representative_rfc: '',
        representative_curp: '',
        beneficiary_controller_info: '',
        risk: 'Bajo',
        notes: ''
      });
      showToast('Donante registrado exitosamente.', 'success');
      setModalOpen(false);
      fetchDonors(); // Refrescar listado
    } catch (err: any) {
      showToast(`Error al enviar datos: ${err.message}`, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="view-panel active">
      <div className="card-widget">
        <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Directorio de Donantes e Identificación (KYC)</h2>
          <button className="btn" onClick={() => setModalOpen(true)}>＋ Agregar Donante</button>
        </div>
        
        <div className="search-bar-container" style={{ marginBlock: '1.5rem' }}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar por Nombre, RFC o ID de Donante..."
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
                <th>Donante / RFC</th>
                <th>Tipo</th>
                <th>Riesgo Legal</th>
                <th>Acumulado (6 Meses)</th>
                <th>Estado de Expediente</th>
                <th>Expediente</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    Cargando padrón de donantes...
                  </td>
                </tr>
              ) : filteredDonors.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    🔍 No se encontraron donantes que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredDonors.map(donor => (
                  <tr key={donor.id}>
                    <td>
                      <strong>{donor.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{donor.rfc}</div>
                    </td>
                    <td>{donor.type}</td>
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
                        {donor.overall_status === 'blocked' ? '🚫 Bloqueado por LPB' :
                         donor.overall_status === 'danger' ? '⚠️ Alerta de Aviso SAT' :
                         donor.overall_status === 'warning' ? '📂 Expediente Incompleto' : '✅ Expediente Completo'}
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

      {/* Modal para Agregar Donante (Frontera KYC) */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'grid', placeContent: 'center', overflowY: 'auto', padding: '2rem' }}>
          <div className="card-widget" style={{ width: '800px', maxWidth: '95vw', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div className="widget-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Registrar Donante (Identificación KYC Regulatoria)</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                
                <div className="form-group">
                  <label className="form-label">Tipo de Persona</label>
                  <select 
                    value={formType} 
                    onChange={(e) => setFormType(e.target.value as any)} 
                    className="form-control"
                  >
                    <option value="Persona Física">Persona Física</option>
                    <option value="Persona Moral">Persona Moral (Institución/Empresa)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Riesgo Inicial Evaluado</label>
                  <select name="risk" value={formData.risk} onChange={handleInputChange} className="form-control">
                    <option value="Bajo">Bajo Riesgo</option>
                    <option value="Medio">Medio Riesgo</option>
                    <option value="Alto">Alto Riesgo (PEP o similar)</option>
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nombre Completo o Razón Social</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="form-control" placeholder="Ej. Alejandro Mendoza o Comercializadora S.A." required />
                  {formErrors.name && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">RFC (con homoclave)</label>
                  <input type="text" name="rfc" value={formData.rfc} onChange={handleInputChange} className="form-control" placeholder="12 o 13 caracteres" required />
                  {formErrors.rfc && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.rfc}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{formType === 'Persona Física' ? 'CURP' : 'CURP del Rep. Legal (Opcional)'}</label>
                  <input type="text" name="curp" value={formData.curp} onChange={handleInputChange} className="form-control" placeholder="18 caracteres" required={formType === 'Persona Física'} />
                  {formErrors.curp && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.curp}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{formType === 'Persona Física' ? 'Fecha de Nacimiento' : 'Fecha de Constitución'}</label>
                  <input type="date" name="dob_or_constitution" value={formData.dob_or_constitution} onChange={handleInputChange} className="form-control" required />
                  {formErrors.dob_or_constitution && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.dob_or_constitution}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Actividad Económica / Profesión</label>
                  <input type="text" name="economic_activity" value={formData.economic_activity} onChange={handleInputChange} className="form-control" placeholder="Ej. Empleado, Abogado, Comercio" required />
                  {formErrors.economic_activity && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.economic_activity}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Correo Electrónico</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="form-control" placeholder="nombre@correo.com" />
                  {formErrors.email && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.email}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Teléfono de Contacto</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="form-control" placeholder="10 dígitos" />
                  {formErrors.phone && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.phone}</span>}
                </div>

                <div style={{ gridColumn: 'span 2', marginBlock: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>Domicilio Fiscal (SAT)</h3>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Calle / Avenida</label>
                  <input type="text" name="address_street" value={formData.address_street} onChange={handleInputChange} className="form-control" required />
                  {formErrors.address_street && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_street}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Número Exterior</label>
                  <input type="text" name="address_number_ext" value={formData.address_number_ext} onChange={handleInputChange} className="form-control" required />
                  {formErrors.address_number_ext && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_number_ext}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Número Interior (Opcional)</label>
                  <input type="text" name="address_number_int" value={formData.address_number_int} onChange={handleInputChange} className="form-control" />
                </div>

                <div className="form-group">
                  <label className="form-label">Colonia / Fraccionamiento</label>
                  <input type="text" name="address_colony" value={formData.address_colony} onChange={handleInputChange} className="form-control" required />
                  {formErrors.address_colony && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_colony}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Delegación o Municipio</label>
                  <input type="text" name="address_city" value={formData.address_city} onChange={handleInputChange} className="form-control" required />
                  {formErrors.address_city && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_city}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <input type="text" name="address_state" value={formData.address_state} onChange={handleInputChange} className="form-control" required />
                  {formErrors.address_state && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_state}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Código Postal</label>
                  <input type="text" name="address_zip" value={formData.address_zip} onChange={handleInputChange} className="form-control" placeholder="5 dígitos" required />
                  {formErrors.address_zip && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.address_zip}</span>}
                </div>

                <div style={{ gridColumn: 'span 2', marginBlock: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>Declaración de Origen de Fondos</h3>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Procedencia de los Recursos (Bajo Protesta)</label>
                  <textarea name="funds_origin" value={formData.funds_origin} onChange={handleInputChange} className="form-control" rows={2} placeholder="Ej. Declaración bajo protesta de decir verdad que los recursos provienen de su actividad lícita como..." required></textarea>
                  {formErrors.funds_origin && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.funds_origin}</span>}
                </div>

                {formType === 'Persona Moral' && (
                  <>
                    <div style={{ gridColumn: 'span 2', marginBlock: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                      <h3 style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>Datos del Representante Legal</h3>
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">Nombre del Representante Legal</label>
                      <input type="text" name="representative_name" value={formData.representative_name} onChange={handleInputChange} className="form-control" placeholder="Nombre completo" required />
                      {formErrors.representative_name && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.representative_name}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">RFC del Representante</label>
                      <input type="text" name="representative_rfc" value={formData.representative_rfc} onChange={handleInputChange} className="form-control" placeholder="13 caracteres" required />
                      {formErrors.representative_rfc && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.representative_rfc}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">CURP del Representante</label>
                      <input type="text" name="representative_curp" value={formData.representative_curp} onChange={handleInputChange} className="form-control" placeholder="18 caracteres" />
                      {formErrors.representative_curp && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{formErrors.representative_curp}</span>}
                    </div>
                  </>
                )}

                <div style={{ gridColumn: 'span 2', marginBlock: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>Beneficiario Controlador e Información Interna</h3>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Identificación del Beneficiario Controlador (Requerimiento SAT)</label>
                  <textarea name="beneficiary_controller_info" value={formData.beneficiary_controller_info} onChange={handleInputChange} className="form-control" rows={2} placeholder="Escriba los datos del beneficiario controlador (ej. accionista mayoritario de la Persona Moral o el propio donante si es Persona Física)..."></textarea>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Notas Internas</label>
                  <textarea name="notes" value={formData.notes} onChange={handleInputChange} className="form-control" rows={2} placeholder="Escriba comentarios adicionales sobre este donante..."></textarea>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingBlockStart: '1rem', marginBlockStart: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? 'Registrando...' : 'Registrar Donante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
