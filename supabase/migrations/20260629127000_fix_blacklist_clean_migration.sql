-- 1. Reparar cualquier alerta activa eliminada erróneamente por la migración anterior
-- Inserta una alerta activa por cada coincidencia de lista negra que no tenga ni una alerta activa ni una resuelta para esa razón específica
INSERT INTO public.alerts (organization_id, donor_id, alert_type, category, title, description)
SELECT 
    d.organization_id,
    d.id,
    'blocked',
    'blacklist_match',
    'Coincidencia en Lista de Personas Bloqueadas',
    'El donante coincide con un registro restringido en la lista negra. Razón: ' || COALESCE(b.reason, 'No especificada')
FROM public.donors d
JOIN public.blocked_list b ON b.organization_id = d.organization_id 
  AND (
    (b.rfc IS NOT NULL AND b.rfc <> '' AND d.rfc = b.rfc)
    OR 
    UPPER(public.immutable_unaccent(TRIM(b.name))) = UPPER(public.immutable_unaccent(TRIM(d.name)))
  )
WHERE d.screening_status = 'blocked'
  AND NOT EXISTS (
      SELECT 1 FROM public.alerts a 
      WHERE a.donor_id = d.id 
        AND a.category = 'blacklist_match' 
        AND a.status = 'active'
        AND a.description = 'El donante coincide con un registro restringido en la lista negra. Razón: ' || COALESCE(b.reason, 'No especificada')
  )
  AND NOT EXISTS (
      SELECT 1 FROM public.alerts r
      WHERE r.donor_id = d.id 
        AND r.category = 'blacklist_match' 
        AND r.status = 'resolved'
        AND r.description LIKE '%%' || COALESCE(b.reason, 'No especificada') || '%%'
  );
