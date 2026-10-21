-- =============================================================================
-- 007 · Consolidar personas duplicadas (Etapa 2b, docs/MODELO-DATOS.md §5.1)
--
-- Una fusión reapunta a la ficha que queda (destino) todas las filas que referencian a la duplicada
-- (origen), guarda cada fila movida en cys.fusiones_personas y deja el origen «fusionada» con
-- `fusionada_en`. Nada se borra y la fusión se revierte desde su registro.
--
-- Los disparadores que protegen períodos confirmados, pagos y reglas permiten ÚNICAMENTE ese cambio
-- de llave, y solo dentro de cys.fusionar_partes / cys.revertir_fusion (variable local cys.fusion).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas que referencian a una parte (una sola lista para fusionar, revertir y contar)
-- ---------------------------------------------------------------------------
-- `llave`: columna que identifica cada fila (para guardar y revertir exactamente las filas movidas).
CREATE OR REPLACE FUNCTION cys.columnas_parte() RETURNS TABLE (tabla text, columna text, llave text) LANGUAGE sql IMMUTABLE AS $$
    VALUES ('titularidades', 'id_parte', 'id'), ('documentos', 'id_parte', 'id'), ('polizas', 'id_aseguradora', 'id'),
           ('periodo_partes', 'id_parte', 'id'), ('inclusiones', 'id_persona', 'id'), ('beneficiarios', 'id_parte', 'id'),
           ('reglas_calculo', 'id_aseguradora', 'id'), ('obligaciones', 'id_contraparte', 'id'), ('pagos', 'id_contraparte', 'id'),
           ('siniestro_afectados', 'id_persona', 'id'), ('siniestro_transporte', 'id_transportista', 'id_siniestro')
$$;

-- ¿El cambio es solo el reapunte de una fusión? (dentro de cys.fusionar_partes / cys.revertir_fusion)
CREATE OR REPLACE FUNCTION cys.solo_reapunte_fusion(anterior jsonb, nuevo jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('cys.fusion', true), '') = 'on'
       AND anterior - ARRAY['id_parte', 'id_persona', 'id_aseguradora', 'id_contraparte', 'id_transportista']
         = nuevo    - ARRAY['id_parte', 'id_persona', 'id_aseguradora', 'id_contraparte', 'id_transportista']
$$;

-- ---------------------------------------------------------------------------
-- 2. Registro de fusiones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.fusiones_personas (
    id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa           varchar(30)  NOT NULL,
    id_origen         bigint       NOT NULL,
    id_destino        bigint       NOT NULL,
    motivo            text         NOT NULL CHECK (length(trim(motivo)) >= 5),
    -- [{"tabla": "...", "columna": "...", "llave": "id", "ids": [..]}]: cada fila que se reapuntó
    filas             jsonb        NOT NULL,
    -- Datos del destino antes de completarlo con los del origen (para revertir)
    destino_antes     jsonb        NOT NULL,
    origen_estado     varchar(10)  NOT NULL,
    creado_en         timestamptz  NOT NULL DEFAULT now(),
    creado_por        integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    revertida_en      timestamptz,
    revertida_por     integer      REFERENCES cys.app_usuarios (id_usuario),
    motivo_reversion  text,
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_origen) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_destino) REFERENCES cys.partes (empresa, id),
    CHECK (id_origen <> id_destino),
    CHECK ((revertida_en IS NULL) = (revertida_por IS NULL) AND (revertida_en IS NULL) = (motivo_reversion IS NULL))
);
CREATE INDEX IF NOT EXISTS fusiones_personas_origen ON cys.fusiones_personas (empresa, id_origen);
CREATE INDEX IF NOT EXISTS fusiones_personas_destino ON cys.fusiones_personas (empresa, id_destino);

-- El registro no se edita ni se borra; solo se marca la reversión una vez.
CREATE OR REPLACE FUNCTION cys.proteger_fusion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'El registro de fusiones no se borra' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.revertida_en IS NOT NULL
       OR to_jsonb(NEW) - ARRAY['revertida_en', 'revertida_por', 'motivo_reversion'] <> to_jsonb(OLD) - ARRAY['revertida_en', 'revertida_por', 'motivo_reversion'] THEN
        RAISE EXCEPTION 'Una fusión registrada no se modifica (solo se revierte una vez)' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fusiones_personas_proteger ON cys.fusiones_personas;
CREATE TRIGGER fusiones_personas_proteger BEFORE UPDATE OR DELETE ON cys.fusiones_personas FOR EACH ROW EXECUTE FUNCTION cys.proteger_fusion();

-- Pares que un usuario revisó y marcó «no son la misma persona»: no vuelven a salir como posibles
-- duplicados. Se guardan con el menor id primero.
CREATE TABLE IF NOT EXISTS cys.personas_distintas (
    empresa     varchar(30)  NOT NULL,
    id_a        bigint       NOT NULL,
    id_b        bigint       NOT NULL,
    creado_en   timestamptz  NOT NULL DEFAULT now(),
    creado_por  integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    PRIMARY KEY (empresa, id_a, id_b),
    FOREIGN KEY (empresa, id_a) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_b) REFERENCES cys.partes (empresa, id),
    CHECK (id_a < id_b)
);

-- ---------------------------------------------------------------------------
-- 3. Los disparadores de protección aceptan el reapunte de una fusión
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cys.proteger_con_fechas() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    estado_periodo text;
BEGIN
    IF TG_OP = 'UPDATE' AND cys.solo_reapunte_fusion(to_jsonb(OLD), to_jsonb(NEW)) THEN
        RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION cys.proteger_inclusion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    per cys.poliza_periodos%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND cys.solo_reapunte_fusion(to_jsonb(OLD), to_jsonb(NEW)) THEN
        RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION cys.proteger_pago() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los pagos no se borran: se anulan' USING ERRCODE = 'P0001';
    END IF;
    IF cys.solo_reapunte_fusion(to_jsonb(OLD), to_jsonb(NEW)) THEN
        RETURN NEW;
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

CREATE OR REPLACE FUNCTION cys.proteger_regla() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las reglas no se borran: se retiran' USING ERRCODE = 'P0001';
    END IF;
    IF cys.solo_reapunte_fusion(to_jsonb(OLD), to_jsonb(NEW)) THEN
        RETURN NEW;
    END IF;
    IF row_to_json(NEW)::jsonb - 'estado' - 'vigente_hasta' <> row_to_json(OLD)::jsonb - 'estado' - 'vigente_hasta' THEN
        RAISE EXCEPTION 'Una regla no se modifica: se crea una versión nueva' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Fusionar
-- ---------------------------------------------------------------------------
-- Campos del destino que se completan con los del origen cuando el destino no los tiene.
CREATE OR REPLACE FUNCTION cys.fusionar_partes(p_empresa varchar, p_origen bigint, p_destino bigint, p_motivo text, p_usuario integer)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    o cys.partes%ROWTYPE;
    d cys.partes%ROWTYPE;
    c record;
    ids jsonb;
    filas jsonb := '[]'::jsonb;
    antes jsonb := '{}'::jsonb;
    campo text;
    id_fusion bigint;
BEGIN
    IF p_origen = p_destino THEN
        RAISE EXCEPTION 'Elija dos fichas distintas' USING ERRCODE = '23514';
    END IF;
    -- Mismo orden de bloqueo siempre (evita esperas cruzadas entre dos fusiones simultáneas).
    PERFORM 1 FROM cys.partes WHERE empresa = p_empresa AND id IN (p_origen, p_destino) ORDER BY id FOR UPDATE;
    SELECT * INTO o FROM cys.partes WHERE empresa = p_empresa AND id = p_origen;
    SELECT * INTO d FROM cys.partes WHERE empresa = p_empresa AND id = p_destino;
    IF o.id IS NULL OR d.id IS NULL THEN
        RAISE EXCEPTION 'Las dos fichas deben existir y ser de la misma empresa' USING ERRCODE = '23514';
    END IF;
    IF o.estado = 'fusionada' OR d.estado = 'fusionada' THEN
        RAISE EXCEPTION 'Una de las fichas ya está fusionada' USING ERRCODE = '23514';
    END IF;
    IF o.tipo <> d.tipo THEN
        RAISE EXCEPTION 'Solo se fusionan fichas del mismo tipo (persona con persona, empresa con empresa)' USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('cys.fusion', 'on', true);
    FOR c IN SELECT * FROM cys.columnas_parte() LOOP
        EXECUTE format('WITH m AS (UPDATE cys.%I SET %I = $1 WHERE empresa = $2 AND %I = $3 RETURNING %I AS llave) SELECT coalesce(jsonb_agg(llave ORDER BY llave), ''[]'') FROM m',
                       c.tabla, c.columna, c.columna, c.llave)
            INTO ids USING p_destino, p_empresa, p_origen;
        IF jsonb_array_length(ids) > 0 THEN
            filas := filas || jsonb_build_object('tabla', c.tabla, 'columna', c.columna, 'llave', c.llave, 'ids', ids);
        END IF;
    END LOOP;
    PERFORM set_config('cys.fusion', 'off', true);

    -- Completar el destino: datos vacíos y funciones (aseguradora, taller…) del origen.
    FOREACH campo IN ARRAY ARRAY['fecha_nacimiento', 'telefono', 'correo', 'direccion', 'id_foto'] LOOP
        IF to_jsonb(d) -> campo = 'null'::jsonb AND to_jsonb(o) -> campo <> 'null'::jsonb THEN
            antes := antes || jsonb_build_object(campo, NULL);
        END IF;
    END LOOP;
    antes := antes || jsonb_build_object('funciones_agregadas',
        to_jsonb(ARRAY(SELECT unnest(o.funciones) EXCEPT SELECT unnest(d.funciones))));
    UPDATE cys.partes SET
        fecha_nacimiento = coalesce(fecha_nacimiento, o.fecha_nacimiento),
        telefono         = coalesce(telefono, o.telefono),
        correo           = coalesce(correo, o.correo),
        direccion        = coalesce(direccion, o.direccion),
        id_foto          = coalesce(id_foto, o.id_foto),
        funciones        = ARRAY(SELECT DISTINCT x FROM unnest(funciones || o.funciones) x ORDER BY x),
        actualizado_en   = now(),
        actualizado_por  = p_usuario
    WHERE empresa = p_empresa AND id = p_destino;

    UPDATE cys.partes SET estado = 'fusionada', fusionada_en = p_destino, actualizado_en = now(), actualizado_por = p_usuario
    WHERE empresa = p_empresa AND id = p_origen;

    INSERT INTO cys.fusiones_personas (empresa, id_origen, id_destino, motivo, filas, destino_antes, origen_estado, creado_por)
    VALUES (p_empresa, p_origen, p_destino, trim(p_motivo), filas, antes, o.estado, p_usuario)
    RETURNING id INTO id_fusion;
    RETURN id_fusion;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Revertir: las filas movidas vuelven al origen (las creadas después en el destino se quedan)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cys.revertir_fusion(p_empresa varchar, p_id bigint, p_motivo text, p_usuario integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    f cys.fusiones_personas%ROWTYPE;
    o cys.partes%ROWTYPE;
    d cys.partes%ROWTYPE;
    e jsonb;
    campo text;
BEGIN
    SELECT * INTO f FROM cys.fusiones_personas WHERE empresa = p_empresa AND id = p_id FOR UPDATE;
    IF f.id IS NULL THEN
        RAISE EXCEPTION 'La fusión no existe' USING ERRCODE = '23514';
    END IF;
    IF f.revertida_en IS NOT NULL THEN
        RAISE EXCEPTION 'Esta fusión ya se revirtió' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM cys.partes WHERE empresa = p_empresa AND id IN (f.id_origen, f.id_destino) ORDER BY id FOR UPDATE;
    SELECT * INTO o FROM cys.partes WHERE empresa = p_empresa AND id = f.id_origen;
    SELECT * INTO d FROM cys.partes WHERE empresa = p_empresa AND id = f.id_destino;
    IF o.estado <> 'fusionada' OR o.fusionada_en <> f.id_destino THEN
        RAISE EXCEPTION 'La ficha original ya no está fusionada en esta: no se puede revertir' USING ERRCODE = '23514';
    END IF;
    IF d.estado = 'fusionada' THEN
        RAISE EXCEPTION 'La ficha que quedó se fusionó después en otra: revierta primero esa fusión' USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('cys.fusion', 'on', true);
    FOR e IN SELECT * FROM jsonb_array_elements(f.filas) LOOP
        EXECUTE format('UPDATE cys.%I SET %I = $1 WHERE empresa = $2 AND %I = $3 AND %I IN (SELECT jsonb_array_elements_text($4)::bigint)',
                       e ->> 'tabla', e ->> 'columna', e ->> 'columna', e ->> 'llave')
            USING f.id_origen, p_empresa, f.id_destino, e -> 'ids';
    END LOOP;
    PERFORM set_config('cys.fusion', 'off', true);

    -- Quitar del destino lo que se completó desde el origen (si nadie lo cambió después).
    FOR campo IN SELECT jsonb_object_keys(f.destino_antes) LOOP
        CONTINUE WHEN campo = 'funciones_agregadas';
        EXECUTE format('UPDATE cys.partes SET %I = NULL WHERE empresa = $1 AND id = $2 AND %I IS NOT DISTINCT FROM (SELECT %I FROM cys.partes WHERE empresa = $1 AND id = $3)',
                       campo, campo, campo)
            USING p_empresa, f.id_destino, f.id_origen;
    END LOOP;
    UPDATE cys.partes SET
        funciones = ARRAY(SELECT unnest(funciones) EXCEPT SELECT jsonb_array_elements_text(f.destino_antes -> 'funciones_agregadas') ORDER BY 1),
        actualizado_en = now(), actualizado_por = p_usuario
    WHERE empresa = p_empresa AND id = f.id_destino;

    UPDATE cys.partes SET estado = f.origen_estado, fusionada_en = NULL, actualizado_en = now(), actualizado_por = p_usuario
    WHERE empresa = p_empresa AND id = f.id_origen;

    UPDATE cys.fusiones_personas SET revertida_en = now(), revertida_por = p_usuario, motivo_reversion = trim(p_motivo)
    WHERE id = f.id;
END $$;
