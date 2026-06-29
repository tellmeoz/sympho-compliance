'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSystem, setCheckingSystem] = useState(true);

  // Verificar si el sistema ya está configurado (bootstrap)
  useEffect(() => {
    async function checkBootstrap() {
      try {
        const res = await fetch('/api/auth/bootstrap-check');
        if (res.ok) {
          const data = await res.json();
          if (data.needsBootstrap) {
            router.replace('/bootstrap');
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

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      // Guardar sesión e ir al dashboard
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
        <p style={{ color: 'var(--text-muted)' }}>Cargando sistema de cumplimiento...</p>
      </div>
    );
  }

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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sympho PLD</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>Sistema de Control y Cumplimiento de Donativos</p>
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

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              {loading ? 'Validando Credenciales...' : 'Iniciar Sesión'}
            </button>
          </div>

        </form>

        <div style={{ textAlign: 'center', marginBlockStart: '2rem', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
          Normativa Mexicana: LFPIORPI Art. 17-XIII
        </div>
      </div>
    </div>
  );
}
