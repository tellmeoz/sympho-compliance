'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function BootstrapPage() {
  const { login } = useAuth();
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgRfc, setOrgRfc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSystem, setCheckingSystem] = useState(true);

  // Validar si el sistema ya está bootstrappeado (si es así, mandar a login)
  useEffect(() => {
    async function checkBootstrap() {
      try {
        const res = await fetch('/api/auth/bootstrap-check');
        if (res.ok) {
          const data = await res.json();
          if (!data.needsBootstrap) {
            router.replace('/login');
            return;
          }
        }
      } catch (err) {
        console.error('Error al revisar el estado del sistema:', err);
      } finally {
        setCheckingSystem(false);
      }
    }

    checkBootstrap();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      email,
      password,
      org_name: orgName,
      org_rfc: orgRfc
    };

    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error en la inicialización del sistema');
      }

      alert('¡Sistema inicializado con éxito!');
      login(data.user, data.csrfToken);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSystem) {
    return (
      <div style={{ display: 'grid', placeContent: 'center', minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Validando estado de aprovisionamiento...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'grid', 
      placeContent: 'center', 
      minHeight: '100vh', 
      backgroundColor: 'var(--bg-main)', 
      backgroundImage: 'radial-gradient(circle at top, rgba(16,185,129,0.1) 0%, transparent 70%)',
      padding: '2rem 1rem' 
    }}>
      <div className="card-widget" style={{ 
        width: '500px', 
        maxWidth: '100%', 
        border: '1px solid var(--border-color)', 
        borderRadius: 'var(--radius-lg)', 
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        padding: '2.5rem'
      }}>
        
        <div style={{ textAlign: 'center', marginBlockEnd: '2rem' }}>
          <div className="brand-icon" style={{ margin: '0 auto 1rem', width: '48px', height: '48px', fontSize: '1.5rem', background: 'linear-gradient(135deg, var(--color-success), var(--color-primary))' }}>S</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Inicializar Sympho Compliance</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>Aprovisionamiento del Primer Tenant y Oficial de Cumplimiento</p>
        </div>

        {error && (
          <div style={{ 
            padding: '0.75rem 1rem', 
            backgroundColor: 'var(--color-danger-glow)', 
            border: '1px solid var(--color-danger)', 
            borderRadius: 'var(--radius-sm)', 
            marginBlockEnd: '1.5rem', 
            color: 'var(--color-danger)',
            fontSize: '0.85rem' 
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--color-success)' }}>1. Datos de la Asociación Civil</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Razón Social de la A.C.</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej. Fundación de Ayuda para Niños, A.C." 
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">RFC de la A.C.</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="RFC de 12 caracteres" 
              value={orgRfc}
              onChange={(e) => setOrgRfc(e.target.value)}
              required 
            />
          </div>

          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBlockStart: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--color-success)' }}>2. Cuenta del Oficial de Cumplimiento</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Correo Electrónico Corporativo</label>
            <input 
              type="email" 
              className="form-control" 
              placeholder="oficial@organizacion.org" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña de Seguridad</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Mínimo 6 caracteres" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <div style={{ marginBlockStart: '1rem' }}>
            <button 
              type="submit" 
              className="btn" 
              disabled={loading}
              style={{ width: '100%', padding: '0.85rem', background: 'linear-gradient(135deg, var(--color-success), var(--color-primary))', color: '#000', fontWeight: 600 }}
            >
              {loading ? 'Inicializando Base de Datos e Inquilino...' : 'Aprovisionar Entorno PLD'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
