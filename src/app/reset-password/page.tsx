'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // 1. Obtener parámetros directos de la URL (token y email)
    const qToken = searchParams.get('token');
    const qEmail = searchParams.get('email');
    
    if (qToken && qEmail) {
      setToken(qToken);
      setEmail(qEmail);
      return;
    }
    
    // 2. Si no están en la URL (flujo fallback de Supabase redirect)
    // Supabase redirige con hash params. Intentamos parsear por si acaso.
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      if (params.has('access_token')) {
        // Nota: Si es el redirect directo, Supabase ya inició sesión implícitamente en el cliente.
        // Pero como usamos tokens HTTP cookie, el flujo con token/email directo de Resend es el estándar principal.
        setError('Formato de enlace antiguo. Por favor, vuelva a solicitar la recuperación de contraseña.');
      }
    } else {
      setError('El enlace de recuperación es inválido o ha expirado. Por favor, solicite uno nuevo.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token || !email) {
      setError('Enlace de recuperación no válido. Solicite un nuevo correo.');
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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password,
          token,
          email
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al cambiar la contraseña');
      }

      setSuccess('Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión con tus nuevas credenciales.');
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nueva Contraseña</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>Ingrese y confirme su nueva contraseña de acceso</p>
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
            <label className="form-label">Nueva Contraseña</label>
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
              placeholder="Repita la nueva contraseña" 
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
              {loading ? 'Guardando Contraseña...' : 'Restablecer Contraseña'}
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

export default function ResetPasswordPage() {
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
        <div style={{ color: 'var(--text-muted)' }}>Cargando verificador de recuperación...</div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
