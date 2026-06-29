-- Redefinir la función de reevaluación al remover para prevenir desbloqueos incorrectos cuando existen coincidencias múltiples activas
CREATE OR REPLACE FUNCTION public.reevaluate_blacklist_on_remove(
    p_name TEXT,
    p_rfc TEXT,
    p_org_id UUID
) RETURNS VOID AS $$
DECLARE
    r_donor RECORD;
    v_other_match_exists BOOLEAN;
BEGIN
    -- Buscar todos los donantes que estaban bloqueados y coinciden con la entrada de la lista negra removida
    FOR r_donor IN 
        SELECT id, name, rfc FROM public.donors
        WHERE organization_id = p_org_id
          AND screening_status = 'blocked'
          AND (
            (p_rfc IS NOT NULL AND p_rfc <> '' AND rfc = p_rfc)
            OR
            (UPPER(public.immutable_unaccent(TRIM(name))) = UPPER(public.immutable_unaccent(TRIM(p_name))))
          )
    LOOP
        -- Verificar si este donante específico aún coincide con cualquier OTRO registro activo de la lista negra
        -- (Dado que este trigger corre AFTER DELETE, la entrada actual ya no existe en la tabla)
        SELECT EXISTS (
            SELECT 1 FROM public.blocked_list bl
            WHERE bl.organization_id = p_org_id
              AND (
                (bl.rfc IS NOT NULL AND bl.rfc <> '' AND r_donor.rfc = bl.rfc)
                OR
                (UPPER(public.immutable_unaccent(TRIM(r_donor.name))) = UPPER(public.immutable_unaccent(TRIM(bl.name))))
              )
        ) INTO v_other_match_exists;

        IF v_other_match_exists THEN
            -- Si todavía existe otra coincidencia activa, el donante se mantiene bloqueado
            RAISE NOTICE 'Donante % (ID: %) se mantiene bloqueado debido a otra coincidencia activa en blocked_list.', r_donor.name, r_donor.id;
        ELSE
            -- Si ya no hay ninguna coincidencia activa, proceder con el desbloqueo
            UPDATE public.donors
            SET screening_status = 'ok',
                updated_at = NOW()
            WHERE id = r_donor.id;
            
            -- Resolver automáticamente cualquier alerta activa de blacklist_match
            UPDATE public.alerts
            SET status = 'resolved',
                notes = 'Removido de la lista de bloqueados local (Desbloqueo administrativo)'
            WHERE donor_id = r_donor.id
              AND category = 'blacklist_match'
              AND status = 'active';
              
            -- Re-evaluar cumplimiento global del donante
            PERFORM public.evaluate_donor_compliance(r_donor.id);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
