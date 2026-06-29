-- Habilitar extensión UUID y unaccent
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Wrapper inmutable para unaccent (Requerido para índices funcionales en PostgreSQL)
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE;

-- 1. Tabla de Organizaciones (Multi-tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    rfc VARCHAR(13) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Parámetros Regulatorios con vigencia temporal
CREATE TABLE regulatory_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uma_value DECIMAL(10, 2) NOT NULL,
    identification_uma_multiplier DECIMAL(10, 2) NOT NULL DEFAULT 1605,
    aviso_uma_multiplier DECIMAL(10, 2) NOT NULL DEFAULT 3210,
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_dates CHECK (effective_from <= effective_to)
);

-- Semilla de valores regulatorios (2026)
INSERT INTO regulatory_parameters (uma_value, effective_from, effective_to) 
VALUES (117.31, '2026-02-01', '2027-01-31');

-- 3. Tabla de Perfiles de Usuario (Relacionado con auth.users de Supabase)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Oficial de Cumplimiento', 'Operador')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de Donantes (Modelo KYC Completo)
CREATE TABLE donors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Nombre o Razón Social
    rfc VARCHAR(13) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Persona Física', 'Persona Moral')),
    curp VARCHAR(18), -- Persona Física y Rep. Legal
    dob_or_constitution DATE NOT NULL, -- Fecha de Nacimiento o Constitución
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Dirección Fiscal completa
    address_street VARCHAR(255) NOT NULL,
    address_number_ext VARCHAR(50) NOT NULL,
    address_number_int VARCHAR(50),
    address_colony VARCHAR(100) NOT NULL,
    address_city VARCHAR(100) NOT NULL,
    address_state VARCHAR(100) NOT NULL,
    address_zip VARCHAR(10) NOT NULL,
    
    economic_activity VARCHAR(255) NOT NULL, -- Actividad profesional o empresarial
    funds_origin TEXT NOT NULL, -- Procedencia declarada de los fondos
    
    -- Datos del Representante Legal (Para Personas Morales)
    representative_name VARCHAR(255),
    representative_rfc VARCHAR(13),
    representative_curp VARCHAR(18),
    
    -- Datos del Beneficiario Controlador (Requerimiento PLD)
    beneficiary_controller_info TEXT, 
    risk VARCHAR(50) NOT NULL DEFAULT 'Bajo' CHECK (risk IN ('Bajo', 'Medio', 'Alto')),
    
    -- Dimensiones Desacopladas de Estatus
    screening_status VARCHAR(50) NOT NULL DEFAULT 'ok' CHECK (screening_status IN ('ok', 'blocked', 'investigating')),
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'incomplete' CHECK (kyc_status IN ('complete', 'incomplete', 'pending_review')),
    threshold_status VARCHAR(50) NOT NULL DEFAULT 'ok' CHECK (threshold_status IN ('ok', 'identification_exceeded', 'aviso_exceeded')),
    overall_status VARCHAR(50) NOT NULL DEFAULT 'ok' CHECK (overall_status IN ('ok', 'warning', 'danger', 'blocked')),
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(organization_id, rfc),
    CONSTRAINT uq_donors_org_id UNIQUE (organization_id, id)
);

-- Indexar RFC y organización para búsquedas rápidas
CREATE INDEX idx_donors_org_rfc ON donors(organization_id, rfc);

-- Índice de Expresión funcional para screening (Para Fase 2 pg_trgm + GIN)
CREATE INDEX idx_donors_normalized_name ON donors(organization_id, UPPER(public.immutable_unaccent(TRIM(name))));

-- 5. Tabla de Documentos KYC (Con FK compuesta para garantizar consistencia multi-tenant en motor)
CREATE TABLE donor_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    donor_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('ine', 'acta', 'rfc', 'comprobante')),
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'kyc-documents',
    storage_path TEXT NOT NULL, -- Ruta física: {org_id}/{donor_id}/{type}_{uuid}.pdf
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_status VARCHAR(50) NOT NULL DEFAULT 'missing' CHECK (review_status IN ('ok', 'missing', 'pending_review', 'rejected')),
    rejection_reason TEXT,
    expires_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(donor_id, document_type),
    
    -- Blindaje Multi-tenant: Evita que el documento pertenezca a otra AC diferente a la del donante
    CONSTRAINT fk_donor_documents_org_donor FOREIGN KEY (organization_id, donor_id) 
        REFERENCES donors(organization_id, id) ON DELETE CASCADE
);

-- 6. Tabla de Donaciones (FK compuesta para asegurar tenant)
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    donor_id UUID NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    method VARCHAR(50) NOT NULL CHECK (method IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro')),
    campaign VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Validada' CHECK (status IN ('Validada', 'Retenida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_donations_org_donor FOREIGN KEY (organization_id, donor_id) 
        REFERENCES donors(organization_id, id) ON DELETE CASCADE,
    -- Requerido para llaves compuestas con alerts
    CONSTRAINT uq_donations_org_id UNIQUE (organization_id, id)
);

-- 7. Tabla de Alertas PLD (FK compuesta doble para garantizar total aislamiento tenant)
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    donor_id UUID NOT NULL,
    transaction_id UUID,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('blocked', 'warning', 'danger')),
    category VARCHAR(100) NOT NULL CHECK (category IN (
        'threshold_identification', 
        'threshold_aviso', 
        'blacklist_match', 
        'document_missing', 
        'document_expiration'
    )),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_alerts_org_donor FOREIGN KEY (organization_id, donor_id) 
        REFERENCES donors(organization_id, id) ON DELETE CASCADE,
    -- ON DELETE RESTRICT: Evita borrar transacciones que tengan alertas activas de auditoría regulada
    CONSTRAINT fk_alerts_donation_tenant FOREIGN KEY (organization_id, transaction_id) 
        REFERENCES donations(organization_id, id) ON DELETE RESTRICT
);

-- 8. Tabla de Personas Bloqueadas (Lista Negra Local con organization_id)
CREATE TABLE blocked_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    rfc VARCHAR(13),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Tabla de Logs de Auditoría
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- Ej: 'DONOR_CREATE', 'DOCUMENT_UPLOAD', 'ALERT_RESOLVE', 'REPORT_VIEW'
    entity_type VARCHAR(50) NOT NULL, -- Ej: 'donors', 'donor_documents', 'alerts'
    entity_id UUID,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activar RLS en todas las tablas del tenant (incluyendo logs y blocked list para defense-in-depth completo)
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE donor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_parameters ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (Aislamiento tenant por JWT)
CREATE POLICY "Aislamiento tenant en Donantes" ON donors FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Donaciones" ON donations FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Documentos" ON donor_documents FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Alertas" ON alerts FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Blocked List" ON blocked_list FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Audit Logs" ON audit_logs FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Profiles" ON profiles FOR ALL TO authenticated USING (organization_id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Aislamiento tenant en Organizations" ON organizations FOR ALL TO authenticated USING (id = ((auth.jwt() -> 'app_metadata') ->> 'org_id')::uuid);
CREATE POLICY "Permitir lectura de parametros a usuarios autenticados" ON regulatory_parameters FOR SELECT TO authenticated USING (true);

-- Índices optimizados
CREATE INDEX idx_donors_org ON donors(organization_id);
CREATE INDEX idx_donations_donor_date ON donations(donor_id, date);
CREATE INDEX idx_donor_docs_donor ON donor_documents(donor_id);
CREATE INDEX idx_alerts_donor_status ON alerts(donor_id, status);
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
