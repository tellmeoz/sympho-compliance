'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const qToken = searchParams.get('token');
    const qEmail = searchParams.get('email');
    const qName = searchParams.get('name');
    
    if (qToken && qEmail) {
      setToken(qToken);
      setEmail(qEmail);
      if (qName) {
        setName(qName);
      }
    } else {
      setError('El enlace de invitación es inválido, incompleto o ha expirado.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token || !email) {
      setError('Datos de invitación incompletos. Solicite una nueva invitación.');
      return;
    }

    if (name.trim().length < 3) {
      setError('El nombre completo debe tener al menos 3 caracteres.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/confirm-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          token,
          password,
          name: name.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al aceptar la invitación');
      }

      setSuccess('¡Cuenta activada y configurada exitosamente! Ya puedes iniciar sesión en Sympho PLD.');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-widget" style={{ 
      width: '420px', 
      maxWidth: '100%', 
      border: '1px solid var(--border-color)', 
      borderRadius: 'var(--radius-lg)', 
      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      padding: '2.5rem'
    }}>
      
      <div style={{ textAlign: 'center', marginBlockEnd: '2.5rem' }}>
        <div className="brand-icon" style={{ margin: '0 auto 1rem', width: '48px', height: '48px', fontSize: '1.5rem' }}>S</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Activar Cuenta</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>Complete sus datos para activar su acceso de colaborador</p>
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

      {success && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          backgroundColor: 'var(--color-success-glow)', 
          border: '1px solid var(--color-success)', 
          borderRadius: 'var(--radius-sm)', 
          marginBlockEnd: '1.5rem', 
          color: 'var(--color-success)',
          fontSize: '0.85rem' 
        }}>
          ✅ {success}
        </div>
      )}

      {token && email && !success && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div className="form-group">
            <label className="form-label">Correo Electrónico</label>
            <input 
              type="email" 
              className="form-control" 
              value={email}
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nombre Completo</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Juan Pérez" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Establecer Contraseña</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Mínimo 6 caracteres" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar Contraseña</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Repita la contraseña" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required 
            />
          </div>

          <div style={{ marginBlockStart: '0.5rem' }}>
            <button 
              type="submit" 
              className="btn" 
              disabled={loading}
              style={{ width: '100%', padding: '0.85rem' }}
            >
              {loading ? 'Activando Cuenta...' : 'Activar Cuenta e Iniciar'}
            </button>
          </div>
        </form>
      )}

      <div style={{ textAlign: 'center', marginBlockStart: '2rem', fontSize: '0.85rem' }}>
        <Link href="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
          Volver al Inicio de Sesión
        </Link>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div style={{ 
      display: 'grid', 
      placeContent: 'center', 
      minHeight: '100vh', 
      backgroundColor: 'var(--bg-main)', 
      backgroundImage: 'radial-gradient(circle at top, rgba(6,182,212,0.1) 0%, transparent 70%)',
      padding: '1rem' 
    }}>
      <Suspense fallback={
        <div style={{ color: 'var(--text-muted)' }}>Cargando activador de cuenta...</div>
      }>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
