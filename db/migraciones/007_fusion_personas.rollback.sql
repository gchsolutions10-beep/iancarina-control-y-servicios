-- Reversión de 007_fusion_personas.sql. Antes de aplicarla, revierta las fusiones vigentes desde la
-- web (si no, las fichas fusionadas quedan «fusionada» sin registro para deshacerlas).
DROP FUNCTION IF EXISTS cys.revertir_fusion(varchar, bigint, text, integer);
DROP FUNCTION IF EXISTS cys.fusionar_partes(varchar, bigint, bigint, text, integer);
DROP TABLE IF EXISTS cys.fusiones_personas;
DROP TABLE IF EXISTS cys.personas_distintas;
DROP FUNCTION IF EXISTS cys.proteger_fusion();

-- Disparadores de protección como en 004 (sin la excepción de la fusión).
CREATE OR REPLACE FUNCTION cys.proteger_pago() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los pagos no se borran: se anulan' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado = 'anulado' OR (NEW.empresa, NEW.sentido, NEW.fecha, NEW.monto, NEW.moneda, NEW.id_contraparte)
        IS DISTINCT FROM (OLD.empresa, OLD.sentido, OLD.fecha, OLD.monto, OLD.moneda, OLD.id_contraparte) THEN
        RAISE EXCEPTION 'Un pago registrado no se modifica: se anula y se registra de nuevo' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.estado = 'anulado' AND EXISTS (
        SELECT 1 FROM cys.imputaciones i WHERE i.id_pago = NEW.id AND i.revierte_a IS NULL
           AND NOT EXISTS (SELECT 1 FROM cys.imputaciones r WHERE r.revierte_a = i.id)) THEN
        RAISE EXCEPTION 'Antes de anular el pago se revierten sus imputaciones' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cys.proteger_inclusion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    per cys.poliza_periodos%ROWTYPE;
BEGIN
    SELECT * INTO per FROM cys.poliza_periodos WHERE id = coalesce(NEW.id_periodo, OLD.id_periodo);
    IF per.estado = 'anulado' THEN
        RAISE EXCEPTION 'El período está anulado' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF per.estado = 'confirmado' THEN
            RAISE EXCEPTION 'El período está confirmado: la baja se hace por endoso' USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.desde < per.vigencia_desde OR NEW.hasta > per.vigencia_hasta THEN
        RAISE EXCEPTION 'Las fechas del asegurado deben estar dentro de la vigencia (% a %)', per.vigencia_desde, per.vigencia_hasta USING ERRCODE = '23514';
    END IF;
    IF per.estado = 'confirmado' THEN
        IF TG_OP = 'INSERT' AND NEW.id_endoso_alta IS NULL THEN
            RAISE EXCEPTION 'El período está confirmado: las altas se hacen por endoso' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'UPDATE' AND (
            OLD.id_endoso_baja IS NOT NULL OR NEW.id_endoso_baja IS NULL
            OR (NEW.id_periodo, NEW.id_persona, NEW.id_vehiculo, NEW.id_propiedad, NEW.certificado, NEW.ceco, NEW.clase_tarifa, NEW.desde,
                NEW.valor_bien, NEW.aditamentos, NEW.suma_asegurada, NEW.id_calculo_suma, NEW.id_endoso_alta)
               IS DISTINCT FROM
               (OLD.id_periodo, OLD.id_persona, OLD.id_vehiculo, OLD.id_propiedad, OLD.certificado, OLD.ceco, OLD.clase_tarifa, OLD.desde,
                OLD.valor_bien, OLD.aditamentos, OLD.suma_asegurada, OLD.id_calculo_suma, OLD.id_endoso_alta)) THEN
            RAISE EXCEPTION 'El período está confirmado: los cambios se hacen por endoso' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cys.proteger_con_fechas() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    estado_periodo text;
BEGIN
    IF TG_TABLE_NAME = 'beneficiarios' THEN
        SELECT p.estado INTO estado_periodo FROM cys.inclusiones i JOIN cys.poliza_periodos p ON p.id = i.id_periodo
         WHERE i.id = coalesce(NEW.id_inclusion, OLD.id_inclusion);
    ELSE
        estado_periodo := cys.estado_periodo(coalesce(NEW.id_periodo, OLD.id_periodo));
    END IF;
    IF estado_periodo = 'anulado' THEN
        RAISE EXCEPTION 'El período está anulado' USING ERRCODE = 'P0001';
    END IF;
    IF estado_periodo = 'confirmado' THEN
        IF TG_OP = 'DELETE' OR (TG_OP = 'INSERT' AND NEW.id_endoso IS NULL)
           OR (TG_OP = 'UPDATE' AND (OLD.hasta IS NOT NULL OR NEW.hasta IS NULL
               OR row_to_json(NEW)::jsonb - 'hasta' <> row_to_json(OLD)::jsonb - 'hasta')) THEN
            RAISE EXCEPTION 'El período está confirmado: los cambios se hacen por endoso' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION cys.proteger_regla() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las reglas no se borran: se retiran' USING ERRCODE = 'P0001';
    END IF;
    IF row_to_json(NEW)::jsonb - 'estado' - 'vigente_hasta' <> row_to_json(OLD)::jsonb - 'estado' - 'vigente_hasta' THEN
        RAISE EXCEPTION 'Una regla no se modifica: se crea una versión nueva' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS cys.solo_reapunte_fusion(jsonb, jsonb);
DROP FUNCTION IF EXISTS cys.columnas_parte();
DELETE FROM cys.app_migraciones WHERE nombre = '007_fusion_personas.sql';
