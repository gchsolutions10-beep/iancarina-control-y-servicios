-- Reversión de 004_polizas.sql. Borra TODAS las pólizas, cálculos y finanzas: solo para bases sin datos reales.
DELETE FROM cys.documentos WHERE id_poliza IS NOT NULL;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_poliza;
DROP INDEX IF EXISTS cys.documentos_poliza_idx;
ALTER TABLE cys.documentos DROP COLUMN IF EXISTS id_poliza;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad) = 1);

DROP VIEW IF EXISTS cys.vw_saldos_obligaciones;
DROP TABLE IF EXISTS cys.imputaciones, cys.pagos, cys.obligacion_movimientos, cys.obligaciones,
    cys.endoso_lineas, cys.inclusion_coberturas, cys.beneficiarios, cys.inclusiones, cys.calculos,
    cys.reglas_calculo, cys.periodo_tarifas, cys.periodo_partes, cys.endosos, cys.poliza_periodos,
    cys.polizas, cys.coberturas, cys.ramos CASCADE;
DROP FUNCTION IF EXISTS cys.validar_imputacion(), cys.solo_agregar(), cys.proteger_pago(), cys.estado_periodo(bigint),
    cys.proteger_periodo(), cys.proteger_inclusion(), cys.proteger_inclusion_cobertura(), cys.proteger_tarifa(),
    cys.proteger_con_fechas(), cys.proteger_regla();
DELETE FROM cys.app_ajustes WHERE clave IN ('renovaciones.dias_anticipacion', 'primas.dias_por_vencer');
DELETE FROM cys.app_migraciones WHERE nombre = '004_polizas.sql';
DELETE FROM cys.catalogo_valores WHERE lista = 'tipo_documento' AND nombre IN ('Póliza / cuadro de póliza', 'Endoso', 'Recibo de prima');
