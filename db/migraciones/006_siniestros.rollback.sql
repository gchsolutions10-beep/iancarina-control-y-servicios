-- Reversión de 006_siniestros.sql. Borra TODOS los siniestros: solo para bases sin datos reales.
DELETE FROM cys.documentos WHERE id_siniestro IS NOT NULL;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_siniestro;
DROP INDEX IF EXISTS cys.documentos_siniestro_idx;
ALTER TABLE cys.documentos DROP COLUMN IF EXISTS id_siniestro;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad, id_poliza) = 1);
ALTER TABLE cys.imputaciones DISABLE TRIGGER USER;
ALTER TABLE cys.obligacion_movimientos DISABLE TRIGGER USER;
ALTER TABLE cys.pagos DISABLE TRIGGER USER;
DELETE FROM cys.imputaciones WHERE id_obligacion IN (SELECT id FROM cys.obligaciones WHERE id_siniestro IS NOT NULL);
DELETE FROM cys.obligacion_movimientos WHERE id_obligacion IN (SELECT id FROM cys.obligaciones WHERE id_siniestro IS NOT NULL);
DELETE FROM cys.obligaciones WHERE id_siniestro IS NOT NULL;
ALTER TABLE cys.imputaciones ENABLE TRIGGER USER;
ALTER TABLE cys.obligacion_movimientos ENABLE TRIGGER USER;
ALTER TABLE cys.pagos ENABLE TRIGGER USER;
ALTER TABLE cys.obligaciones DROP CONSTRAINT IF EXISTS obligaciones_reembolso;
ALTER TABLE cys.obligaciones DROP CONSTRAINT IF EXISTS obligaciones_siniestro;
DROP INDEX IF EXISTS cys.obligaciones_siniestro_idx;
ALTER TABLE cys.obligaciones DROP COLUMN IF EXISTS id_siniestro;
DROP VIEW IF EXISTS cys.vw_siniestro_importes;
DROP TABLE IF EXISTS cys.limites, cys.siniestro_importes, cys.siniestro_actuaciones, cys.siniestro_etapas, cys.siniestro_transporte,
    cys.siniestro_afectados, cys.siniestros, cys.tipos_siniestro, cys.flujo_etapas, cys.flujos CASCADE;
DELETE FROM cys.app_ajustes WHERE clave IN ('siniestros.dias_sin_movimiento', 'siniestros.aviso_limite_pct');
DELETE FROM cys.app_migraciones WHERE nombre = '006_siniestros.sql';
