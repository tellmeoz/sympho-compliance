-- A. Sincronizador de app_metadata para inyección de claims
CREATE OR REPLACE FUNCTION public.sync_user_app_metadata()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object('org_id', NEW.organization_id::text, 'role', NEW.role)
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_sync_user_app_metadata
AFTER INSERT OR UPDATE OF organization_id, role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_app_metadata();

-- B. Inmutabilidad de Logs de Auditoría (Excepción Explícita)
CREATE OR REPLACE FUNCTION block_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los logs de auditoría son inmutables de manera permanente y no pueden ser modificados ni borrados.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_block_audit_log_modification
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION block_audit_log_modification();

-- C. Trigger de Screening de Listas de Bloqueo (BEFORE + AFTER)

-- Trigger BEFORE: Valida coincidencia, limpia acentos/espacios y establece estatus
CREATE OR REPLACE FUNCTION check_donor_blacklist_before()
RETURNS TRIGGER AS $$
DECLARE
    is_blocked BOOLEAN;
BEGIN
    -- Comprobar si coincide RFC o el nombre (sin acentos, espacios extras, case-insensitive)
    SELECT TRUE INTO is_blocked 
    FROM blocked_list 
    WHERE organization_id = NEW.organization_id 
      AND (
        rfc = NEW.rfc 
        OR UPPER(unaccent(TRIM(name))) = UPPER(unaccent(TRIM(NEW.name)))
      )
    LIMIT 1;

    IF is_blocked THEN
        NEW.screening_status := 'blocked';
        NEW.overall_status := 'blocked';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_donor_blacklist_before
BEFORE INSERT OR UPDATE OF name, rfc ON donors
FOR EACH ROW EXECUTE FUNCTION check_donor_blacklist_before();

-- Trigger AFTER: Inserta alerta si se confirma el bloqueo
CREATE OR REPLACE FUNCTION check_donor_blacklist_after()
RETURNS TRIGGER AS $$
DECLARE
    block_reason TEXT;
BEGIN
    -- Desbloqueo administrativo/manual por el Oficial de Cumplimiento
    IF NEW.screening_status = 'blocked' THEN
        SELECT reason INTO block_reason 
        FROM blocked_list 
        WHERE organization_id = NEW.organization_id 
          AND (
            rfc = NEW.rfc 
            OR UPPER(unaccent(TRIM(name))) = UPPER(unaccent(TRIM(NEW.name)))
          )
        LIMIT 1;

        -- Crear la alerta con la FK segura
        IF NOT EXISTS (SELECT 1 FROM alerts WHERE donor_id = NEW.id AND category = 'blacklist_match' AND status = 'active') THEN
            INSERT INTO alerts (organization_id, donor_id, alert_type, category, title, description)
            VALUES (
                NEW.organization_id,
                NEW.id, 
                'blocked', 
                'blacklist_match',
                'Coincidencia en Lista de Personas Bloqueadas', 
                'El donante coincide con un registro restringido en la lista negra. Razón: ' || COALESCE(block_reason, 'No especificada')
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_donor_blacklist_after
AFTER INSERT OR UPDATE OF name, rfc ON donors
FOR EACH ROW EXECUTE FUNCTION check_donor_blacklist_after();

-- D. Recálculo de Límites y Evaluación de KYC por Tipo de Persona

CREATE OR REPLACE VIEW v_donor_current_accumulation AS
SELECT 
    d.id AS donor_id,
    d.organization_id,
    COALESCE(SUM(tx.amount), 0) AS accumulated_amount_6m
FROM donors d
LEFT JOIN donations tx ON d.id = tx.donor_id 
    AND tx.date >= CURRENT_DATE - INTERVAL '6 months'
    AND tx.status = 'Validada'
GROUP BY d.id, d.organization_id;

CREATE OR REPLACE FUNCTION evaluate_donor_compliance(p_donor_id UUID)
RETURNS VOID AS $$
DECLARE
    v_accumulated DECIMAL(12,2);
    v_uma DECIMAL(10,2);
    v_multiplier_ident DECIMAL(10,2);
    v_multiplier_aviso DECIMAL(10,2);
    v_limit_ident DECIMAL(12,2);
    v_limit_aviso DECIMAL(12,2);
    v_screening_status VARCHAR(50);
    v_kyc_status VARCHAR(50);
    v_threshold_status VARCHAR(50);
    v_overall_status VARCHAR(50);
    v_type VARCHAR(50);
    v_org_id UUID;
    
    -- Conteo de documentos cargados
    has_ine BOOLEAN := FALSE;
    has_rfc BOOLEAN := FALSE;
    has_comprobante BOOLEAN := FALSE;
    has_acta BOOLEAN := FALSE;
    
    -- Estatus de revisión
    has_pending BOOLEAN := FALSE;
    has_rejected BOOLEAN := FALSE;
BEGIN
    -- 1. Recuperar datos y estatus actuales
    SELECT organization_id, type, screening_status, kyc_status, threshold_status
    INTO v_org_id, v_type, v_screening_status, v_kyc_status, v_threshold_status
    FROM donors 
    WHERE id = p_donor_id;

    -- 2. Calcular acumulado actual en la ventana de 6 meses
    SELECT accumulated_amount_6m INTO v_accumulated 
    FROM v_donor_current_accumulation 
    WHERE donor_id = p_donor_id;

    -- 3. Cargar parámetros UMA vigentes (En caso de duplicados/solapamientos incidentales, tomar el más reciente)
    SELECT uma_value, identification_uma_multiplier, aviso_uma_multiplier
    INTO v_uma, v_multiplier_ident, v_multiplier_aviso
    FROM regulatory_parameters
    WHERE CURRENT_DATE >= effective_from AND CURRENT_DATE <= effective_to
    ORDER BY effective_from DESC LIMIT 1;
    
    IF NOT FOUND THEN
        SELECT uma_value, identification_uma_multiplier, aviso_uma_multiplier
        INTO v_uma, v_multiplier_ident, v_multiplier_aviso
        FROM regulatory_parameters
        ORDER BY effective_from DESC LIMIT 1;
    END IF;

    v_limit_ident := v_uma * v_multiplier_ident;
    v_limit_aviso := v_uma * v_multiplier_aviso;

    -- 4. Evaluar Estado KYC según Tipo de Donante (Física vs. Moral)
    SELECT 
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND document_type = 'ine' AND review_status = 'ok'),
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND document_type = 'rfc' AND review_status = 'ok'),
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND document_type = 'comprobante' AND review_status = 'ok'),
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND document_type = 'acta' AND review_status = 'ok'),
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND review_status = 'pending_review'),
        EXISTS(SELECT 1 FROM donor_documents WHERE donor_id = p_donor_id AND review_status = 'rejected')
    INTO has_ine, has_rfc, has_comprobante, has_acta, has_pending, has_rejected;

    IF v_type = 'Persona Física' THEN
        IF has_ine AND has_rfc AND has_comprobante THEN
            v_kyc_status := 'complete';
        ELSIF has_pending AND NOT has_rejected THEN
            v_kyc_status := 'pending_review';
        ELSE
            v_kyc_status := 'incomplete';
        END IF;
    ELSE
        -- Persona Moral requiere: Acta Constitutiva, Cédula RFC, Comprobante y la Identificación del Rep. Legal (ine)
        IF has_acta AND has_rfc AND has_comprobante AND has_ine THEN
            v_kyc_status := 'complete';
        ELSIF has_pending AND NOT has_rejected THEN
            v_kyc_status := 'pending_review';
        ELSE
            v_kyc_status := 'incomplete';
        END IF;
    END IF;

    -- 5. Evaluar Umbral de Acumulación y Alertas basadas en el estatus KYC real recalculado
    IF v_accumulated >= v_limit_aviso THEN
        v_threshold_status := 'aviso_exceeded';
        
        -- Generar alerta específica de aviso si no existe
        IF NOT EXISTS (SELECT 1 FROM alerts WHERE donor_id = p_donor_id AND category = 'threshold_aviso' AND status = 'active') THEN
            INSERT INTO alerts (organization_id, donor_id, alert_type, category, title, description)
            VALUES (
                v_org_id, 
                p_donor_id, 
                'danger', 
                'threshold_aviso', 
                'Umbral de Aviso Excedido', 
                'El acumulado semestral llegó a $' || v_accumulated || ' MXN. Límite de Aviso: $' || v_limit_aviso
            );
        END IF;
        
    ELSIF v_accumulated >= v_limit_ident THEN
        v_threshold_status := 'identification_exceeded';
        
        -- Si el expediente NO está 'complete', disparar alerta. Cubre casos con 0 documentos cargados.
        IF v_kyc_status != 'complete' THEN
            IF NOT EXISTS (SELECT 1 FROM alerts WHERE donor_id = p_donor_id AND category = 'threshold_identification' AND status = 'active') THEN
                INSERT INTO alerts (organization_id, donor_id, alert_type, category, title, description)
                VALUES (
                    v_org_id, 
                    p_donor_id, 
                    'warning', 
                    'threshold_identification', 
                    'Expediente Incompleto por Umbral', 
                    'El acumulado del donante ($' || v_accumulated || ' MXN) superó el Umbral de Identificación ($' || v_limit_ident || '), requiere subir documentación requerida.'
                );
            END IF;
        END IF;
    ELSE
        v_threshold_status := 'ok';
        
        -- Resolver alertas obsoletas
        UPDATE alerts 
        SET status = 'resolved', notes = 'Resuelta automáticamente por decaimiento del acumulado.' 
        WHERE donor_id = p_donor_id AND status = 'active' AND category IN ('threshold_identification', 'threshold_aviso');
    END IF;

    -- 6. Calcular Estatus Global (overall_status)
    IF v_screening_status = 'blocked' THEN
        v_overall_status := 'blocked';
    ELSIF v_threshold_status = 'aviso_exceeded' THEN
        v_overall_status := 'danger';
    -- Si supera identificación y no está completo (incluye 'incomplete' y 'pending_review'), marcar como warning
    ELSIF v_threshold_status = 'identification_exceeded' AND v_kyc_status != 'complete' THEN
        v_overall_status := 'warning';
    ELSE
        v_overall_status := 'ok';
    END IF;

    -- 7. Guardar cambios
    UPDATE donors 
    SET threshold_status = v_threshold_status,
        kyc_status = v_kyc_status,
        overall_status = v_overall_status,
        updated_at = NOW() 
    WHERE id = p_donor_id;
END;
$$ LANGUAGE plpgsql;

-- E. Trigger de Donaciones Completo (Insert / Update / Delete)

CREATE OR REPLACE FUNCTION trigger_evaluate_compliance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM evaluate_donor_compliance(OLD.donor_id);
        RETURN OLD;
    ELSE
        PERFORM evaluate_donor_compliance(NEW.donor_id);
        IF TG_OP = 'UPDATE' AND OLD.donor_id != NEW.donor_id THEN
            PERFORM evaluate_donor_compliance(OLD.donor_id);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_evaluate_compliance_donation
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW EXECUTE FUNCTION trigger_evaluate_compliance();

-- F. Creación Atómica del Perfil de Usuario (Evitar Huérfanos en Bootstrap)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, organization_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Usuario Nuevo'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'Operador'),
        (NEW.raw_user_meta_data->>'organization_id')::uuid
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- G. Políticas de Almacenamiento Privado (Supabase Storage)

INSERT INTO storage.buckets (id, name, public) 
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Prohibir acceso publico al bucket" ON storage.objects FOR ALL TO public USING (false);
CREATE POLICY "Acceso administrativo completo" ON storage.objects FOR ALL TO service_role USING (true) WITH CHECK (true);
