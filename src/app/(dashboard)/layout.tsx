import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="authenticated-grid">
      <Sidebar />
      <main className="content-area">
        {/* Encabezado Común de Cumplimiento */}
        <header className="content-header">
          <div className="header-title">
            <h1>Consola de Cumplimiento PLD</h1>
            <p>Asociación Civil / Donatarias Autorizadas</p>
          </div>
          <div className="legal-badge">
            <span>🛡️</span> UMA 2026: $117.31 MXN
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
