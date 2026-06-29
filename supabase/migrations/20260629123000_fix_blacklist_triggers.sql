-- 1. Redefinir función de reevaluación al agregar (con corrección y soporte para triggers)
CREATE OR REPLACE FUNCTION public.reevaluate_blacklist_on_add(
    p_name TEXT,
    p_rfc TEXT,
    p_org_id UUID
) RETURNS VOID AS $$
DECLARE
    r_donor RECORD;
BEGIN
    -- Buscar todos los donantes que coincidan con la entrada agregada a la lista negra
    FOR r_donor IN 
        SELECT id FROM public.donors
        WHERE organization_id = p_org_id
          AND (
            (p_rfc IS NOT NULL AND p_rfc <> '' AND rfc = p_rfc)
            OR
            (UPPER(public.immutable_unaccent(TRIM(name))) = UPPER(public.immutable_unaccent(TRIM(p_name))))
          )
    LOOP
        -- Actualizar estatus del donante a bloqueado
        UPDATE public.donors
        SET screening_status = 'blocked',
            updated_at = NOW()
        WHERE id = r_donor.id;
        
        -- Ejecutar la evaluación de cumplimiento para actualizar overall_status y crear alertas
        PERFORM public.evaluate_donor_compliance(r_donor.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Redefinir función de reevaluación al remover (Corrigiendo el error de la columna alerts.updated_at)
CREATE OR REPLACE FUNCTION public.reevaluate_blacklist_on_remove(
    p_name TEXT,
    p_rfc TEXT,
    p_org_id UUID
) RETURNS VOID AS $$
DECLARE
    r_donor RECORD;
BEGIN
    -- Buscar todos los donantes que estaban bloqueados y coinciden con la entrada de la lista negra removida
    FOR r_donor IN 
        SELECT id FROM public.donors
        WHERE organization_id = p_org_id
          AND screening_status = 'blocked'
          AND (
            (p_rfc IS NOT NULL AND p_rfc <> '' AND rfc = p_rfc)
            OR
            (UPPER(public.immutable_unaccent(TRIM(name))) = UPPER(public.immutable_unaccent(TRIM(p_name))))
          )
    LOOP
        -- Restablecer el screening_status a 'ok'
        UPDATE public.donors
        SET screening_status = 'ok',
            updated_at = NOW()
        WHERE id = r_donor.id;
        
        -- Resolver automáticamente cualquier alerta activa de blacklist_match (removiendo updated_at)
        UPDATE public.alerts
        SET status = 'resolved',
            notes = 'Removido de la lista de bloqueados local (Desbloqueo administrativo)'
        WHERE donor_id = r_donor.id
          AND category = 'blacklist_match'
          AND status = 'active';
          
        -- Re-evaluar cumplimiento global del donante
        PERFORM public.evaluate_donor_compliance(r_donor.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear triggers automáticos para la tabla blocked_list
CREATE OR REPLACE FUNCTION public.tr_blocked_list_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.reevaluate_blacklist_on_add(NEW.name, NEW.rfc, NEW.organization_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_blocked_list_insert ON public.blocked_list;
CREATE TRIGGER trigger_blocked_list_insert
AFTER INSERT ON public.blocked_list
FOR EACH ROW
EXECUTE FUNCTION public.tr_blocked_list_insert();

CREATE OR REPLACE FUNCTION public.tr_blocked_list_delete()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.reevaluate_blacklist_on_remove(OLD.name, OLD.rfc, OLD.organization_id);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_blocked_list_delete ON public.blocked_list;
CREATE TRIGGER trigger_blocked_list_delete
AFTER DELETE ON public.blocked_list
FOR EACH ROW
EXECUTE FUNCTION public.tr_blocked_list_delete();
