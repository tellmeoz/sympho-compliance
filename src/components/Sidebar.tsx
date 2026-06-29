'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isLinkActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">S</div>
        <div className="brand-name">Sympho PLD</div>
      </div>
      
      <nav className="nav-menu">
        <Link href="/" className={`nav-item ${isLinkActive('/') ? 'active' : ''}`}>
          <span className="nav-icon">📊</span> Dashboard
        </Link>
        <Link href="/donors" className={`nav-item ${isLinkActive('/donors') ? 'active' : ''}`}>
          <span className="nav-icon">👥</span> Donantes y KYC
        </Link>
        <Link href="/transactions" className={`nav-item ${isLinkActive('/transactions') ? 'active' : ''}`}>
          <span className="nav-icon">💸</span> Transacciones
        </Link>
        {user && user.role === 'Oficial de Cumplimiento' && (
          <Link href="/audit-logs" className={`nav-item ${isLinkActive('/audit-logs') ? 'active' : ''}`}>
            <span className="nav-icon">📜</span> Auditoría
          </Link>
        )}
      </nav>
      
      {user && (
        <div style={{ marginBlockStart: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255, 255, 255, 0.01)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sesión Activa</div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBlockStart: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginBlockStart: '0.1rem' }}>{user.role}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem', borderTop: '1px solid var(--border-color)', paddingBlockStart: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.orgName}</div>
          <button 
            onClick={logout} 
            className="btn btn-secondary" 
            style={{ marginBlockStart: '0.75rem', width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
          >
            🚪 Cerrar Sesión
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        <p>Normativa Mexicana</p>
        <strong>LFPIORPI (Art. 17-XIII)</strong>
      </div>
    </aside>
  );
}
