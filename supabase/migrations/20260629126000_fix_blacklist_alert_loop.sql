-- 1. Redefinir check_donor_blacklist_after para prevenir bucles de recreación en actualizaciones generales
CREATE OR REPLACE FUNCTION public.check_donor_blacklist_after()
RETURNS TRIGGER AS $$
DECLARE
    block_reason TEXT;
BEGIN
    -- Ejecutar validación solo si es un registro nuevo (INSERT) 
    -- o si en una actualización (UPDATE) cambiaron el estatus de bloqueo, el nombre o el RFC.
    IF (TG_OP = 'INSERT' AND NEW.screening_status = 'blocked')
       OR (TG_OP = 'UPDATE' AND NEW.screening_status = 'blocked' AND (
            OLD.screening_status IS DISTINCT FROM NEW.screening_status
            OR OLD.name IS DISTINCT FROM NEW.name
            OR OLD.rfc IS DISTINCT FROM NEW.rfc
          ))
    THEN
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

-- 2. Limpiar automáticamente las alertas duplicadas que se recrearon a causa del bucle tras el registro del acuse
DELETE FROM public.alerts a
WHERE a.category = 'blacklist_match'
  AND a.status = 'active'
  AND EXISTS (
      SELECT 1 FROM public.alerts r
      WHERE r.donor_id = a.donor_id
        AND r.category = 'blacklist_match'
        AND r.status = 'resolved'
  );
