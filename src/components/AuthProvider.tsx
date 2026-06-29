'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'Oficial de Cumplimiento' | 'Operador';
  orgName: string;
  orgId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  csrfToken: string;
  login: (userData: User, csrf: string) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getCookie(name: string): string {
  if (typeof window === 'undefined') return '';
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || '';
  return '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const router = useRouter();

  const refreshSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // Extraer token CSRF de la cookie csrf_token
        const token = getCookie('csrf_token');
        setCsrfToken(token);
      } else {
        setUser(null);
        setCsrfToken('');
      }
    } catch (err) {
      setUser(null);
      setCsrfToken('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = (userData: User, csrf: string) => {
    setUser(userData);
    setCsrfToken(csrf);
    router.replace('/');
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken
        }
      });
    } catch (err) {
      // Ignorar errores al desloguear
    } finally {
      setUser(null);
      setCsrfToken('');
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, csrfToken, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
