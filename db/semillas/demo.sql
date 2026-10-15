-- =============================================================================
-- Datos de DEMOSTRACIÓN (solo Vercel + Neon). Cada bloque carga solo si su tabla está vacía.
-- Todo dato sintético lleva «DEMO» en el nombre. Nunca se carga en la base del cliente.
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cys.app_empresas) THEN
        INSERT INTO cys.app_empresas (codigo, nombre, orden) VALUES
            ('demo-iancarina', 'Mary Iancarina, C.A. (DEMO)', 1),
            ('demo-filial',    'Filial de prueba (DEMO)',     2);
    END IF;
END $$;
