# Requerimientos de Prevención de Lavado de Dinero (PLD) para Asociaciones Civiles (Donatarias Autorizadas) en México

Este documento detalla los requerimientos funcionales y técnicos mínimos y avanzados para un sistema de **Prevención de Lavado de Dinero y Financiamiento al Terrorismo (PLD/FT)** en México, diseñado específicamente para **Asociaciones Civiles (A.C.) y Donatarias Autorizadas**. 

En México, la recepción de donativos por parte de entidades sin fines de lucro está clasificada como una **Actividad Vulnerable** bajo el **Artículo 17, Fracción XIII** de la *Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita (LFPIORPI)* (Ley Antilavado).

---

## 1. Marco Normativo y Umbrales Legales (Valores 2026)

Las obligaciones de la Asociación Civil se activan en función del valor de la **Unidad de Medida y Actualización (UMA)** vigente. Para el año **2026**, el valor diario de la UMA es de **$117.31 MXN**.

| Concepto | Límite en UMA | Equivalente en Pesos (2026) | Obligación de la Asociación Civil |
| :--- | :---: | :---: | :--- |
| **Umbral de Identificación** | 1,605 UMA | **$188,282.55 MXN** | Identificar al donante, recabar documentación e integrar su Expediente Único de Identificación. |
| **Umbral de Reporte / Aviso** | 3,210 UMA | **$376,565.10 MXN** | Presentar un Aviso formal ante la UIF / SAT a través del portal de Actividades Vulnerables (SPPLD). |

### Regla de la Acumulación (6 Meses)
Si un donante realiza múltiples donaciones individuales que son inferiores a los límites, pero la suma de estas donaciones dentro de un periodo de **6 meses** supera los umbrales de identificación o aviso, la A.C. está legalmente obligada a cumplir con la regulación como si se tratara de una sola operación.

---

## 2. Mapa Completo de Funcionalidades del Sistema PLD

A continuación se listan las funcionalidades del sistema agrupadas en módulos. Las marcadas con **[DEMO]** están representadas interactivamente en las vistas del prototipo.

### Módulo I: Conozca a su Donante (KYC / CDD)
Permite la debida diligencia e identificación de los aportantes.
1. **Perfil de Donante (Físico / Moral):** **[DEMO]**
   * *Personas Físicas:* Nombre completo, fecha de nacimiento, RFC con homoclave, CURP, actividad económica/profesión, domicilio completo, correo y teléfono.
   * *Personas Morales:* Razón social, RFC, datos del Representante Legal (identificación oficial y poderes) y estructura de propiedad (Beneficiario Controlador).
2. **Declaración bajo Protesta (Origen de Fondos):** Formulario electrónico para que el donante declare la licitud del dinero.
3. **Semáforo de Cumplimiento de Expedientes:** **[DEMO]** Indicador visual que muestra el estatus del expediente (Completo, Incompleto, Requerido Urgente por umbral de acumulación).
4. **Validación RENAPO/SAT:** Integración vía API para verificar que el RFC esté activo y que el CURP exista.
5. **Carga y Almacenamiento Seguro:** Gestor documental para almacenar INE, Comprobante de domicilio, Cédula Fiscal y Acta Constitutiva (resguardo obligatorio por 5 años).

### Módulo II: Motor de Monitoreo e Historial de Donativos
Controla los flujos de dinero entrante y calcula los riesgos por volumen y acumulación.
1. **Registro e Historial de Transacciones:** **[DEMO]** Base de datos de donativos con monto, fecha, divisa, campaña de destino y método de pago (transferencia, efectivo, tarjeta, cheque).
2. **Cálculo de Acumulación Semestral:** **[DEMO]** Motor lógico que suma los donativos del mismo donante en una ventana móvil de 6 meses y emite alertas de forma reactiva.
3. **Alertas Automáticas de Umbral:** **[DEMO]**
   * *Alerta KYC:* Se activa cuando el acumulado supera $188,282.55 MXN.
   * *Alerta de Aviso:* Se activa cuando el acumulado supera $376,565.10 MXN.
4. **Alerta de Negativa de Identificación:** Activación inmediata de un flujo de aviso de 24 horas si un donante realiza una aportación mayor al umbral y se niega a proveer sus documentos de KYC.

### Módulo III: Listas de Vigilancia y Cribado (Screening)
Evita que la asociación reciba fondos de procedencia ilícita o personas sancionadas.
1. **Cotejo en Lista de Personas Bloqueadas (LPB - UIF):** **[DEMO]** Filtro mandatorio que bloquea cualquier transacción con individuos o empresas designadas por la Unidad de Inteligencia Financiera.
2. **Cotejo de PEPs (Personas Políticamente Expuestas):** **[DEMO]** Identificación de funcionarios públicos de los tres niveles de gobierno y sus familiares cercanos.
3. **Cotejo SAT Artículo 69-B (EFOS/EDOS):** Alerta en caso de recibir donaciones de empresas catalogadas por el SAT como "factureras" o fantasma.
4. **Listas Internacionales:** Búsqueda en listas OFAC (Departamento del Tesoro de EE. UU.) y ONU.

### Módulo IV: Gestión de Avisos ante el SAT / UIF
Facilita la preparación y entrega mensual de los reportes regulatorios.
1. **Generador de Layout XML para el SAT:** Sistema de mapeo de datos que exporta el reporte mensual de donativos (Actividad Vulnerable 13) en el formato técnico XML compatible con el Portal de Prevención de Lavado de Dinero (SPPLD).
2. **Consola de Envíos Pendientes:** Bandeja que agrupa las transacciones del mes que superaron el umbral de aviso y están listas para envío.
3. **Buzón de Acuses de Recibo:** Registro histórico de los archivos enviados y almacenamiento de los acuses de aceptación o rechazo emitidos por el SAT.

### Módulo V: Gobierno Corporativo y Auditoría
Garantiza el cumplimiento institucional.
1. **Bitácora del Oficial de Cumplimiento:** Registro inmutable de auditoría (audit trail) de todas las decisiones de investigación tomadas sobre alertas de donantes o transacciones sospechosas.
2. **Manual de Cumplimiento PLD:** Repositorio para la carga, actualización y firma digital de conformidad de las políticas de prevención de la A.C.
3. **Gestión de Capacitaciones:** Módulo de seguimiento de los cursos anuales obligatorios de PLD tomados por el personal administrativo y del patronato.
4. **Preparación de Auditoría Anual:** Flujo de recopilación automática de muestras de expedientes de donantes para el informe del auditor externo de PLD.

---

## 3. Arquitectura del Prototipo Demostrativo

El prototipo demostrativo está implementado en una SPA (Single Page Application) responsiva usando tecnologías nativas de la web (HTML5, CSS3, Javascript ES6) bajo un diseño premium de alta fidelidad, simulando la experiencia de un software SaaS empresarial de cumplimiento.

### Vistas Demostrativas Diseñadas:
1. **Dashboard Principal:** Resumen ejecutivo de donativos recibidos, donantes activos, semáforo global de expedientes, alertas activas (LPB/PEPs) y estado de los reportes mensuales.
2. **Expediente Único del Donante:** Detalle de un donante ficticio, historial de sus donaciones individuales, gráfica/barra de progreso de acumulación de los 6 meses y visualización del semáforo de documentos KYC requeridos por ley.
3. **Monitoreo de Operaciones y Alertas:** Listado interactivo de transacciones donde es posible simular un nuevo donativo y presenciar cómo el motor lógico actualiza la acumulación y dispara alertas visuales en tiempo real si se rebasan los umbrales legales.
