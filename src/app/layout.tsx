import type { Metadata } from 'next';
import { AuthProvider } from '@/components/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sympho Compliance PLD - Consola de Cumplimiento para Asociaciones Civiles',
  description: 'Sistema completo e interactivo para la prevención de lavado de dinero y financiamiento al terrorismo en México.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
