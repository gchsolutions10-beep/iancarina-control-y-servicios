-- =============================================================================
-- 005_tm_toneladas.sql — TM del vehículo = capacidad en toneladas métricas (confirmado por el
-- cliente: hay camiones de 18 t, de 30 t…). Pasa de texto libre a número con 2 decimales.
-- Los valores que no sean un número se conservan en observaciones. Idempotente.
-- Reversión: 005_tm_toneladas.rollback.sql
-- =============================================================================
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'cys' AND table_name = 'vehiculos' AND column_name = 'tm') = 'character varying' THEN
        UPDATE cys.vehiculos
           SET observaciones = concat_ws(E'\n', observaciones, 'TM anterior: ' || tm)
         WHERE tm IS NOT NULL AND replace(trim(tm), ',', '.') !~ '^\d{1,4}(\.\d{1,2})?$';
        ALTER TABLE cys.vehiculos ALTER COLUMN tm TYPE numeric(6,2)
            USING CASE WHEN replace(trim(tm), ',', '.') ~ '^\d{1,4}(\.\d{1,2})?$' THEN replace(trim(tm), ',', '.')::numeric END;
        ALTER TABLE cys.vehiculos ADD CONSTRAINT vehiculos_tm CHECK (tm IS NULL OR (tm > 0 AND tm <= 200));
    END IF;
END $$;
COMMENT ON COLUMN cys.vehiculos.tm IS 'Capacidad de carga en toneladas métricas (TM)';
