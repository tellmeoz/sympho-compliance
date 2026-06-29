# Sympho Compliance PLD (Prevención de Lavado de Dinero)

Sympho Compliance PLD es un sistema de cumplimiento normativo diseñado específicamente para Donatarias Autorizadas en México. El sistema automatiza las obligaciones de Prevención de Lavado de Dinero (PLD) bajo la Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita (LFPIORPI).

El software implementa un modelo multi-inquilino (multi-tenant) seguro con aislamiento de datos a nivel base de datos utilizando Row Level Security (RLS) de PostgreSQL y claims personalizados integrados en los tokens JWT.

---

## 🛠️ Arquitectura Técnica y Tecnologías

1.  **Frontend & API (Backend Serverless):** Next.js 16 (App Router, React Server Components).
2.  **Base de Datos & Servicios en la Nube:** Supabase (PostgreSQL, Storage Privado, Autenticación y Manejo de Sesiones).
3.  **Seguridad y Sesiones:** Sesiones cifradas basadas en cookies seguras (`HttpOnly`, `SameSite=Strict`, `Secure`), Double-Submit CSRF Protection con tokens aleatorios, y políticas RLS nativas en Supabase.
4.  **Cumplimiento Normativo PLD:** Lógica en base de datos mediante triggers y funciones en PL/pgSQL para evaluar de manera atómica acumulaciones semestrales, decaimiento de alertas por tiempo y validación inmediata contra listas negras.

---

## 🔒 Capas de Seguridad y Cumplimiento

### Aislamiento Multi-inquilino (Multi-Tenant RLS)
Cada tabla del sistema que contiene datos confidenciales del tenant implementa **Row Level Security (RLS)**.
*   Las queries del cliente de Supabase se ejecutan utilizando el JWT del usuario autenticado.
*   El trigger `sync_user_app_metadata` inyecta automáticamente el ID de la organización y el rol del usuario en la metadata del usuario de Supabase (`raw_app_meta_data`).
*   Las políticas RLS leen estos claims directamente del JWT mediante `auth.jwt() -> 'app_metadata'` para restringir el acceso a datos.
*   Las tablas críticas del sistema (`donors`, `donations`, `alerts`, `documents`, `blocked_list`, `audit_logs`) están protegidas de forma homogénea.

### Bitácora de Auditoría Normativa (Inmutable)
Todas las operaciones sensibles (creación, edición y borrado) registran automáticamente una entrada en la tabla `audit_logs` del tenant.
*   Un trigger a nivel base de datos bloquea cualquier intento de actualizar (`UPDATE`) o eliminar (`DELETE`) registros dentro de la tabla `audit_logs`, garantizando la inmutabilidad de la bitácora requerida por las directrices de auditoría PLD de la CNBV.
*   La consola del Oficial cuenta con una pantalla de **Auditoría** que analiza e inspecciona las diferencias de estados (diffs de base de datos) anteriores y nuevos.

### Motor de Acumulación Semestral de Umbrales
*   **Umbral de Identificación ($188,282.55 MXN / 1,605 UMA):** Si el acumulado móvil del donante en un periodo semestral excede este umbral, el sistema alerta que el expediente KYC del donante debe estar 100% completo y dictaminado.
*   **Umbral de Aviso Obligatorio ($376,565.10 MXN / 3,210 UMA):** Si excede este umbral, se levanta una alerta de peligro instando a emitir el dictamen y preparar el reporte oficial para el portal del SAT (dentro de los primeros 17 días del mes inmediato posterior).
*   **Time-Decay Scheduler (Cron):** Un endpoint asegurado con firma de token corre a diario mediante Vercel Cron Jobs para depreciar y expirar automáticamente alertas y saldos acumulados cuya antigüedad rebase los 6 meses de vigencia legal.

### Lista de Personas Bloqueadas (Lista Negra Local)
El sistema intercepta en tiempo real registros y actualizaciones de donantes contrastándolos con la lista de bloqueados local.
*   **Detección Fonética e Insensible a Acentos:** Normalización de nombres para evitar que evasiones simples burlen la validación.
*   **Reevaluación Atómica:** Al agregar un nuevo bloqueo, el backend dispara una función que reevalúa y congela el estatus de todos los donantes existentes que coincidan por RFC o nombre.
*   **Desbloqueo Seguro:** Al remover a una persona de la lista negra, el sistema desbloquea automáticamente a los donantes afectados, resuelve sus alertas de coincidencia y recalcula su estatus global sin comprometer otros umbrales.

---

## 👥 Matriz de Roles y Permisos

| Permiso / Módulo | Oficial de Cumplimiento | Operador |
| :--- | :---: | :---: |
| Ver Dashboard / Resumen de Alertas | Sí | Sí |
| Registrar Donantes y Operaciones | Sí | Sí |
| Subir Documentos KYC (Expediente) | Sí | Sí |
| Dictaminar Expediente (Aprobar / Rechazar) | **Sí** | No |
| Resolver Alertas de Umbrales SAT | **Sí** | No |
| Ver Bitácora de Auditoría Visual (Logs) | **Sí** | No |
| Administrar Lista de Personas Bloqueadas | **Sí** | No |

---

## 🚀 Despliegue en Producción (Vercel)

El proyecto está configurado para desplegarse de manera directa en **Vercel** enlazado con la base de datos de **Supabase**.

### 1. Variables de Entorno en Vercel
Configura las siguientes variables en la sección de variables de entorno de tu proyecto en Vercel:

*   `NEXT_PUBLIC_SUPABASE_URL`: URL de tu proyecto de Supabase.
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anon Key pública de Supabase.
*   `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key privada (exclusiva para tareas del backend/cron/bootstrap).
*   `NEXT_PUBLIC_APP_URL`: La URL del dominio asignado por Vercel (ej. `https://sympho-compliance.vercel.app`).
*   `JWT_SECRET`: Una cadena de seguridad de 32 caracteres para encriptar las sesiones de usuario.
*   `CRON_SECRET`: Firma de seguridad para el Cron Job de decaimiento.

### 2. Cron Jobs en Vercel
El archivo `vercel.json` autoprograma la ejecución diaria de la tarea de decaimiento temporal apuntando al endpoint:
`/api/cron/compliance-decay`
