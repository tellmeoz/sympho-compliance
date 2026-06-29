-- 1. Redefinir la función check_donor_blacklist_after para usar public.immutable_unaccent y seguridad SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.check_donor_blacklist_after()
RETURNS TRIGGER AS $$
DECLARE
    block_reason TEXT;
BEGIN
    -- Si el donante está bloqueado, buscar el motivo e insertar la alerta de coincidencia
    IF NEW.screening_status = 'blocked' THEN
        SELECT reason INTO block_reason 
        FROM public.blocked_list 
        WHERE organization_id = NEW.organization_id 
          AND (
            rfc = NEW.rfc 
            OR UPPER(public.immutable_unaccent(TRIM(name))) = UPPER(public.immutable_unaccent(TRIM(NEW.name)))
          )
        LIMIT 1;

        -- Crear la alerta si no existe activa
        IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE donor_id = NEW.id AND category = 'blacklist_match' AND status = 'active') THEN
            INSERT INTO public.alerts (organization_id, donor_id, alert_type, category, title, description)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Redefinir el trigger para que escuche también cambios en la columna 'screening_status'
DROP TRIGGER IF EXISTS tr_check_donor_blacklist_after ON public.donors;
CREATE TRIGGER tr_check_donor_blacklist_after
AFTER INSERT OR UPDATE ON public.donors
FOR EACH ROW EXECUTE FUNCTION public.check_donor_blacklist_after();

-- 3. Crear de forma retroactiva las alertas de lista negra para donantes actualmente bloqueados sin alertas activas
INSERT INTO public.alerts (organization_id, donor_id, alert_type, category, title, description)
SELECT 
    d.organization_id,
    d.id,
    'blocked',
    'blacklist_match',
    'Coincidencia en Lista de Personas Bloqueadas',
    'El donante coincide con un registro restringido en la lista negra. Razón: ' || COALESCE((
        SELECT reason FROM public.blocked_list b 
        WHERE b.organization_id = d.organization_id 
          AND (b.rfc = d.rfc OR UPPER(public.immutable_unaccent(TRIM(b.name))) = UPPER(public.immutable_unaccent(TRIM(d.name))))
        LIMIT 1
    ), 'No especificada')
FROM public.donors d
WHERE d.screening_status = 'blocked'
  AND NOT EXISTS (
      SELECT 1 FROM public.alerts a 
      WHERE a.donor_id = d.id 
        AND a.category = 'blacklist_match' 
        AND a.status = 'active'
  );
