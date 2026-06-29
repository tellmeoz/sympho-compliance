'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al solicitar la recuperación');
      }

      setSuccess('Se ha enviado un enlace para restablecer tu contraseña a tu correo electrónico. Por favor, revisa tu bandeja de entrada.');
      setEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'grid', 
      placeContent: 'center', 
      minHeight: '100vh', 
      backgroundColor: 'var(--bg-main)', 
      backgroundImage: 'radial-gradient(circle at top, rgba(6,182,212,0.1) 0%, transparent 70%)',
      padding: '1rem' 
    }}>
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Recuperar Contraseña</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>Ingrese su correo para recibir un enlace de restablecimiento</p>
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

        {!success && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <input 
                type="email" 
                className="form-control" 
                placeholder="nombre@organizacion.org" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                {loading ? 'Enviando Enlace...' : 'Enviar Enlace de Recuperación'}
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
    </div>
  );
}
