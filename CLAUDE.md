# Sympho Compliance PLD - Guía de Desarrollo

Este proyecto es una aplicación web en Next.js (TypeScript, App Router) conectada a Supabase para el control y cumplimiento normativo de prevención de lavado de dinero (PLD) para Asociaciones Civiles y Donatarias en México.

## Comandos Útiles

- **Iniciar Servidor de Desarrollo:** `npm run dev`
- **Compilar para Producción:** `npm run build`
- **Iniciar Servidor de Producción:** `npm start`
- **Ejecutar Linter:** `npm run lint`
- **Estructura del Proyecto:**
  - `supabase/migrations/`: Archivos SQL de migración de base de datos, triggers, RLS y vistas.
  - `src/lib/`: Módulos de clientes Supabase, utilidades JWT, validación Zod y helpers de API.
  - `src/app/api/`: Endpoints de backend serverless protegidos contra CSRF y con RLS habilitado.
  - `src/app/(dashboard)/`: Rutas protegidas de la consola (Dashboard, Directorio KYC y Transacciones).
  - `src/app/login/` y `src/app/bootstrap/`: Páginas de acceso y configuración inicial (bootstrap).

## Variables de Entorno Requeridas (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-de-supabase
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-de-supabase (Privado del servidor)
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=un-secreto-seguro-de-32-caracteres-minimo-para-cookies
CRON_SECRET=secreto-para-el-job-cron-de-time-decay
```
