-- =============================================================================
-- 003_sin_relaciones_empresa.sql
-- El cliente no controla socios ni acciones en este sistema (los socios solo interesan como
-- asegurados): se retira la tabla de relaciones persona–empresa creada en la 002.
-- Solo había datos de demostración. Idempotente. Reversión: 003_sin_relaciones_empresa.rollback.sql
-- =============================================================================

ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos DROP COLUMN IF EXISTS id_relacion;
ALTER TABLE cys.documentos
    ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad) = 1);

DROP TABLE IF EXISTS cys.relaciones_empresa;
DELETE FROM cys.catalogo_valores WHERE lista = 'tipo_relacion';
