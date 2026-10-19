-- =============================================================================
-- 006_siniestros.sql — Etapa 4: flujos y etapas configurables, tipos de siniestro, expedientes con
-- uno o varios afectados, transporte contratado, etapas, actuaciones, importes con historial,
-- límites de riesgos diversos y cuentas por cobrar de reembolso.
--
-- * Expediente SIN-AAAA-NNNN por empresa y año (pregunta 23, confirmado por GCH el 2026-10-19).
-- * «Reconocido» no es «cobrado»: lo cobrado sale de las imputaciones a la obligación por cobrar del
--   siniestro. Cerrar el expediente no cierra la cuenta por cobrar (R12).
-- * Los transportistas externos no quedan cubiertos por las pólizas propias salvo vínculo explícito (R15).
-- Idempotente. Reversión: 006_siniestros.rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Flujos, etapas y tipos de siniestro (Configuración; comunes a todas las empresas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.flujos (
    id           serial       PRIMARY KEY,
    nombre       varchar(120) NOT NULL UNIQUE,
    descripcion  text,
    activo       boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cys.flujo_etapas (
    id                      serial       PRIMARY KEY,
    id_flujo                integer      NOT NULL REFERENCES cys.flujos (id),
    orden                   integer      NOT NULL CHECK (orden > 0),
    nombre                  varchar(120) NOT NULL,
    -- Tipos de documento que se esperan en esta etapa (nombres de catalogo_valores 'tipo_documento').
    documentos_requeridos   text[]       NOT NULL DEFAULT '{}',
    activo                  boolean      NOT NULL DEFAULT true,
    UNIQUE (id_flujo, nombre)
);
CREATE UNIQUE INDEX IF NOT EXISTS flujo_etapas_orden ON cys.flujo_etapas (id_flujo, orden) WHERE activo;

CREATE TABLE IF NOT EXISTS cys.tipos_siniestro (
    id        serial       PRIMARY KEY,
    nombre    varchar(120) NOT NULL UNIQUE,
    -- Qué se afecta: define qué fichas se eligen (transporte = mercancía con transportista).
    sujeto    varchar(12)  NOT NULL CHECK (sujeto IN ('vehiculo', 'persona', 'propiedad', 'transporte')),
    id_flujo  integer      NOT NULL REFERENCES cys.flujos (id),
    activo    boolean      NOT NULL DEFAULT true
);

INSERT INTO cys.catalogo_valores (lista, nombre, orden) VALUES
    ('tipo_documento', 'Notificación del siniestro', 10), ('tipo_documento', 'Orden de reparación', 11),
    ('tipo_documento', 'Presupuesto', 12), ('tipo_documento', 'Factura', 13), ('tipo_documento', 'Acta de entrega', 14),
    ('tipo_documento', 'Informe médico', 15), ('tipo_documento', 'Denuncia / informe policial', 16),
    ('tipo_documento', 'Finiquito / recibo de indemnización', 17), ('tipo_documento', 'Guía de despacho', 18)
ON CONFLICT (lista, nombre) DO NOTHING;

INSERT INTO cys.flujos (nombre, descripcion) VALUES
    ('Vehículos propios', 'Flujo del requerimiento: notificación → orden de reparación → entrada a taller → entrega → reembolso.'),
    ('General (provisional)', 'Para personas, propiedades y transporte hasta que el cliente defina sus etapas (pregunta 30). Se ajusta en Configuración.')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO cys.flujo_etapas (id_flujo, orden, nombre, documentos_requeridos)
SELECT f.id, v.orden, v.nombre, v.docs
FROM cys.flujos f
JOIN (VALUES
    ('Vehículos propios', 1, 'Notificación', ARRAY['Notificación del siniestro']),
    ('Vehículos propios', 2, 'Orden de reparación', ARRAY['Presupuesto', 'Orden de reparación']),
    ('Vehículos propios', 3, 'Entrada a taller', ARRAY[]::text[]),
    ('Vehículos propios', 4, 'Entrega', ARRAY['Acta de entrega']),
    ('Vehículos propios', 5, 'Reembolso', ARRAY['Factura', 'Finiquito / recibo de indemnización']),
    ('General (provisional)', 1, 'Notificación', ARRAY['Notificación del siniestro']),
    ('General (provisional)', 2, 'Documentación', ARRAY[]::text[]),
    ('General (provisional)', 3, 'Evaluación de la aseguradora', ARRAY[]::text[]),
    ('General (provisional)', 4, 'Indemnización / reembolso', ARRAY['Finiquito / recibo de indemnización'])
) AS v (flujo, orden, nombre, docs) ON v.flujo = f.nombre
ON CONFLICT (id_flujo, nombre) DO NOTHING;

INSERT INTO cys.tipos_siniestro (nombre, sujeto, id_flujo)
SELECT v.nombre, v.sujeto, f.id
FROM (VALUES
    ('Choque o daño del vehículo', 'vehiculo', 'Vehículos propios'),
    ('Robo o hurto del vehículo', 'vehiculo', 'Vehículos propios'),
    ('Accidente de persona', 'persona', 'General (provisional)'),
    ('Daño a la propiedad', 'propiedad', 'General (provisional)'),
    ('Pérdida de mercancía en transporte contratado', 'transporte', 'General (provisional)')
) AS v (nombre, sujeto, flujo)
JOIN cys.flujos f ON f.nombre = v.flujo
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Expedientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.siniestros (
    id                   bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa              varchar(30)   NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    numero_expediente    varchar(20)   NOT NULL,
    numero_aseguradora   varchar(40),
    id_tipo              integer       NOT NULL REFERENCES cys.tipos_siniestro (id),
    id_flujo             integer       NOT NULL REFERENCES cys.flujos (id),
    fecha_evento         date          NOT NULL,
    fecha_notificacion   date          NOT NULL,
    lugar                varchar(200),
    descripcion          text          NOT NULL,
    tipo_perdida         varchar(8)    CHECK (tipo_perdida IN ('parcial', 'total')),
    moneda               char(3)       NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
    -- Póliza (período) con la que se reclama; NULL si no hay cobertura o es de un tercero.
    id_periodo           bigint,
    -- Siniestros de personas: solo los ven quienes tienen «Ver datos personales».
    confidencial         boolean       NOT NULL DEFAULT false,
    estado               varchar(8)    NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'anulado')),
    cerrado_en           date,
    motivo_cierre        text,
    id_responsable       integer       REFERENCES cys.app_usuarios (id_usuario),
    creado_en            timestamptz   NOT NULL DEFAULT now(),
    creado_por           integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en       timestamptz   NOT NULL DEFAULT now(),
    actualizado_por      integer       REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    UNIQUE (empresa, numero_expediente),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id),
    CHECK (fecha_notificacion >= fecha_evento),
    CONSTRAINT siniestros_cierre CHECK ((estado = 'abierto') = (cerrado_en IS NULL))
);
CREATE INDEX IF NOT EXISTS siniestros_estado ON cys.siniestros (empresa, estado, fecha_evento);

-- Afectados: un vehículo, una persona o una propiedad (ninguno si es mercancía de un transportista).
CREATE TABLE IF NOT EXISTS cys.siniestro_afectados (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_siniestro    bigint        NOT NULL,
    id_persona      bigint,
    id_vehiculo     bigint,
    id_propiedad    bigint,
    id_inclusion    bigint,          -- asegurado de la póliza que responde (vínculo explícito)
    id_cobertura    integer       REFERENCES cys.coberturas (id),
    danos           text,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id),
    FOREIGN KEY (empresa, id_persona) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_vehiculo) REFERENCES cys.vehiculos (empresa, id),
    FOREIGN KEY (empresa, id_propiedad) REFERENCES cys.propiedades (empresa, id),
    FOREIGN KEY (empresa, id_inclusion) REFERENCES cys.inclusiones (empresa, id),
    CONSTRAINT afectados_un_sujeto CHECK (num_nonnulls(id_persona, id_vehiculo, id_propiedad) <= 1),
    CHECK (id_cobertura IS NULL OR id_inclusion IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS afectados_siniestro ON cys.siniestro_afectados (id_siniestro);
CREATE INDEX IF NOT EXISTS afectados_vehiculo ON cys.siniestro_afectados (empresa, id_vehiculo) WHERE id_vehiculo IS NOT NULL;
CREATE INDEX IF NOT EXISTS afectados_persona ON cys.siniestro_afectados (empresa, id_persona) WHERE id_persona IS NOT NULL;
CREATE INDEX IF NOT EXISTS afectados_propiedad ON cys.siniestro_afectados (empresa, id_propiedad) WHERE id_propiedad IS NOT NULL;

CREATE TABLE IF NOT EXISTS cys.siniestro_transporte (
    id_siniestro      bigint        PRIMARY KEY,
    empresa           varchar(30)   NOT NULL,
    id_transportista  bigint        NOT NULL,
    placa_texto       varchar(15),
    id_vehiculo       bigint,          -- solo si el vehículo es propio
    mercancia         text          NOT NULL,
    guia              varchar(60),
    valor_mercancia   numeric(18,2) CHECK (valor_mercancia IS NULL OR valor_mercancia >= 0),
    perdida           numeric(18,2) CHECK (perdida IS NULL OR perdida >= 0),
    FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id),
    FOREIGN KEY (empresa, id_transportista) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_vehiculo) REFERENCES cys.vehiculos (empresa, id)
);

CREATE TABLE IF NOT EXISTS cys.siniestro_etapas (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_siniestro    bigint        NOT NULL,
    id_etapa        integer       NOT NULL REFERENCES cys.flujo_etapas (id),
    fecha_inicio    date          NOT NULL,
    fecha_fin       date,
    observaciones   text,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
-- Una sola etapa abierta por expediente.
CREATE UNIQUE INDEX IF NOT EXISTS siniestro_etapa_abierta ON cys.siniestro_etapas (id_siniestro) WHERE fecha_fin IS NULL;

CREATE TABLE IF NOT EXISTS cys.siniestro_actuaciones (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_siniestro    bigint        NOT NULL,
    fecha           date          NOT NULL,
    descripcion     text          NOT NULL,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id)
);

-- Importes con historial: el vigente de cada tipo es el último registrado; nada se edita.
CREATE TABLE IF NOT EXISTS cys.siniestro_importes (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_siniestro    bigint        NOT NULL,
    tipo            varchar(15)   NOT NULL CHECK (tipo IN ('presupuestado', 'autorizado', 'reconocido')),
    monto           numeric(18,2) NOT NULL CHECK (monto >= 0),
    fecha           date          NOT NULL,
    referencia      varchar(80),
    motivo          text,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id)
);
CREATE INDEX IF NOT EXISTS siniestro_importes_siniestro ON cys.siniestro_importes (id_siniestro, tipo, id DESC);
DROP TRIGGER IF EXISTS siniestro_importes_inmutable ON cys.siniestro_importes;
CREATE TRIGGER siniestro_importes_inmutable BEFORE UPDATE OR DELETE ON cys.siniestro_importes FOR EACH ROW EXECUTE FUNCTION cys.solo_agregar();
DROP TRIGGER IF EXISTS siniestro_actuaciones_inmutable ON cys.siniestro_actuaciones;
CREATE TRIGGER siniestro_actuaciones_inmutable BEFORE UPDATE OR DELETE ON cys.siniestro_actuaciones FOR EACH ROW EXECUTE FUNCTION cys.solo_agregar();

-- Importe vigente de cada tipo por expediente (fuente única para pantallas, límites y reportes).
CREATE OR REPLACE VIEW cys.vw_siniestro_importes AS
SELECT DISTINCT ON (id_siniestro, tipo) id_siniestro, empresa, tipo, monto, fecha
FROM cys.siniestro_importes
ORDER BY id_siniestro, tipo, id DESC;

-- ---------------------------------------------------------------------------
-- 3. Límites de riesgos diversos (por período de póliza)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.limites (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_periodo      bigint        NOT NULL,
    id_cobertura    integer       REFERENCES cys.coberturas (id),   -- NULL: todas las coberturas del período
    tipo            varchar(15)   NOT NULL CHECK (tipo IN ('agregado_anual', 'por_bien')),
    monto           numeric(18,2) NOT NULL CHECK (monto > 0),
    -- Qué importe consume el límite (propuesta base: reconocido; pregunta 8).
    consume         varchar(12)   NOT NULL DEFAULT 'reconocido' CHECK (consume IN ('autorizado', 'reconocido')),
    descripcion     text,
    activo          boolean       NOT NULL DEFAULT true,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id)
);
CREATE INDEX IF NOT EXISTS limites_periodo ON cys.limites (id_periodo) WHERE activo;

-- ---------------------------------------------------------------------------
-- 4. Cuenta por cobrar del reembolso y documentos del expediente
-- ---------------------------------------------------------------------------
ALTER TABLE cys.obligaciones ADD COLUMN IF NOT EXISTS id_siniestro bigint;
ALTER TABLE cys.obligaciones DROP CONSTRAINT IF EXISTS obligaciones_siniestro;
ALTER TABLE cys.obligaciones ADD CONSTRAINT obligaciones_siniestro FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id);
ALTER TABLE cys.obligaciones DROP CONSTRAINT IF EXISTS obligaciones_reembolso;
ALTER TABLE cys.obligaciones ADD CONSTRAINT obligaciones_reembolso CHECK (concepto <> 'reembolso_siniestro' OR id_siniestro IS NOT NULL);
CREATE INDEX IF NOT EXISTS obligaciones_siniestro_idx ON cys.obligaciones (id_siniestro) WHERE id_siniestro IS NOT NULL;

ALTER TABLE cys.documentos ADD COLUMN IF NOT EXISTS id_siniestro bigint;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_siniestro;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_siniestro FOREIGN KEY (empresa, id_siniestro) REFERENCES cys.siniestros (empresa, id);
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos
    ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad, id_poliza, id_siniestro) = 1);
CREATE INDEX IF NOT EXISTS documentos_siniestro_idx ON cys.documentos (empresa, id_siniestro) WHERE id_siniestro IS NOT NULL;

INSERT INTO cys.app_ajustes (clave, valor, descripcion) VALUES
    ('siniestros.dias_sin_movimiento', '15', 'Días sin actuaciones, etapas ni importes para marcar un expediente «Sin movimiento»'),
    ('siniestros.aviso_limite_pct', '80', 'Porcentaje de consumo de un límite a partir del cual se avisa (al 100 % se bloquea)')
ON CONFLICT (clave) DO NOTHING;
