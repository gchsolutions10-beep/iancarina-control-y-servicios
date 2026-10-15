-- =============================================================================
-- 004_polizas.sql — Etapa 3: ramos y coberturas, pólizas con sus períodos de vigencia, partes del
-- período (tomador, pagador…), asegurados (inclusiones) con coberturas y beneficiarios, tarifas,
-- endosos (altas, bajas, cambios), motor de cálculo (reglas versionadas y cálculos guardados) y el
-- núcleo financiero de primas: obligaciones, movimientos, pagos e imputaciones.
--
-- * Póliza ≠ período: cada vigencia es una fila de poliza_periodos; la renovación crea otra.
-- * Fechas de cobertura como en el mercado: rango semiabierto [desde, hasta). La vigencia
--   2026-01-01 → 2027-01-01 tiene 365 días; una baja el día F deja la cobertura en [desde, F).
-- * Un período confirmado no se edita: todo cambio entra por un endoso (disparadores al final).
-- * Importes numeric(18,2), tasas numeric(18,8), siempre con su moneda. Nada se convierte.
-- Idempotente. Reversión: 004_polizas.rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ramos y coberturas (Configuración; comunes a todas las empresas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.ramos (
    id      serial       PRIMARY KEY,
    nombre  varchar(120) NOT NULL UNIQUE,
    -- Qué se asegura en este ramo: define qué fichas se pueden incluir.
    sujeto  varchar(10)  NOT NULL CHECK (sujeto IN ('vehiculo', 'persona', 'propiedad')),
    activo  boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cys.coberturas (
    id                 serial       PRIMARY KEY,
    id_ramo            integer      NOT NULL REFERENCES cys.ramos (id),
    nombre             varchar(120) NOT NULL,
    id_padre           integer      REFERENCES cys.coberturas (id),
    -- true: su prima ya está dentro de la del padre y no se suma otra vez en el total (R11).
    incluida_en_padre  boolean      NOT NULL DEFAULT false,
    orden              integer      NOT NULL DEFAULT 0,
    activo             boolean      NOT NULL DEFAULT true,
    UNIQUE (id_ramo, nombre),
    CHECK (NOT incluida_en_padre OR id_padre IS NOT NULL)
);

-- Ramo de vehículos con las coberturas que nombra el requerimiento (no contractuales: sin importes).
INSERT INTO cys.ramos (nombre, sujeto) VALUES ('Automóvil (flota)', 'vehiculo') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO cys.coberturas (id_ramo, nombre, orden)
SELECT r.id, v.nombre, v.orden
FROM cys.ramos r
CROSS JOIN (VALUES
    ('Casco (pérdida total / cobertura amplia)', 1),
    ('RCV', 2),
    ('Exceso de límite', 3),
    ('Defensa penal', 4),
    ('APOV', 5),
    ('Asistencia vial', 6)
) AS v (nombre, orden)
WHERE r.nombre = 'Automóvil (flota)'
ON CONFLICT (id_ramo, nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Pólizas y períodos de vigencia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.polizas (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa          varchar(30)  NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    id_aseguradora   bigint       NOT NULL,
    numero           varchar(40)  NOT NULL,
    id_ramo          integer      NOT NULL REFERENCES cys.ramos (id),
    descripcion      text,
    estado           varchar(10)  NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada')),
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  integer      REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_aseguradora) REFERENCES cys.partes (empresa, id)
);
-- Número único por aseguradora dentro de la empresa (pregunta 23, por confirmar).
CREATE UNIQUE INDEX IF NOT EXISTS polizas_numero_unico ON cys.polizas (empresa, id_aseguradora, cys.normalizar_codigo(numero));

CREATE TABLE IF NOT EXISTS cys.poliza_periodos (
    id                   bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa              varchar(30)  NOT NULL,
    id_poliza            bigint       NOT NULL,
    numero_periodo       smallint     NOT NULL CHECK (numero_periodo > 0),
    vigencia_desde       date         NOT NULL,
    vigencia_hasta       date         NOT NULL,
    moneda               char(3)      NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
    id_periodo_anterior  bigint,
    -- borrador: en preparación o en renovación · confirmado: emitido (solo cambia por endoso) · anulado: descartado
    estado               varchar(10)  NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmado', 'anulado')),
    confirmado_por       integer      REFERENCES cys.app_usuarios (id_usuario),
    confirmado_en        timestamptz,
    observaciones        text,
    creado_en            timestamptz  NOT NULL DEFAULT now(),
    creado_por           integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    UNIQUE (id_poliza, numero_periodo),
    FOREIGN KEY (empresa, id_poliza) REFERENCES cys.polizas (empresa, id),
    FOREIGN KEY (empresa, id_periodo_anterior) REFERENCES cys.poliza_periodos (empresa, id),
    CHECK (vigencia_hasta > vigencia_desde),
    CONSTRAINT periodos_confirmacion CHECK ((estado = 'borrador') OR (estado = 'anulado') OR (confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)),
    CONSTRAINT periodos_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_poliza WITH =, daterange(vigencia_desde, vigencia_hasta, '[)') WITH &&) WHERE (estado <> 'anulado')
);
-- Una sola renovación viva por período.
CREATE UNIQUE INDEX IF NOT EXISTS periodos_una_renovacion ON cys.poliza_periodos (id_periodo_anterior) WHERE id_periodo_anterior IS NOT NULL AND estado <> 'anulado';
CREATE INDEX IF NOT EXISTS periodos_vencimiento ON cys.poliza_periodos (empresa, vigencia_hasta) WHERE estado = 'confirmado';

-- ---------------------------------------------------------------------------
-- 3. Endosos: único camino para cambiar un período confirmado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.endosos (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa             varchar(30)   NOT NULL,
    id_periodo          bigint        NOT NULL,
    numero              integer       NOT NULL CHECK (numero > 0),
    tipo                varchar(15)   NOT NULL CHECK (tipo IN ('alta', 'baja', 'cambio_parte', 'beneficiarios')),
    fecha_efectiva      date          NOT NULL,
    numero_aseguradora  varchar(40),
    -- Prima del endoso con signo: + cobra (alta), − devuelve (baja). NULL si no mueve prima.
    prima               numeric(18,2),
    retroactivo         boolean       NOT NULL DEFAULT false,
    descripcion         text          NOT NULL,
    motivo              text,
    estado              varchar(10)   NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'anulado')),
    creado_en           timestamptz   NOT NULL DEFAULT now(),
    creado_por          integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    UNIQUE (id_periodo, numero),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id)
);

-- ---------------------------------------------------------------------------
-- 4. Partes del período: tomador, contratante, pagador y corredor (con fechas efectivas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.periodo_partes (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa     varchar(30)  NOT NULL,
    id_periodo  bigint       NOT NULL,
    rol         varchar(12)  NOT NULL CHECK (rol IN ('tomador', 'contratante', 'pagador', 'corredor')),
    id_parte    bigint       NOT NULL,
    desde       date         NOT NULL,
    hasta       date,                       -- NULL = hasta el fin del período
    id_endoso   bigint,
    creado_en   timestamptz  NOT NULL DEFAULT now(),
    creado_por  integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id),
    FOREIGN KEY (empresa, id_parte) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_endoso) REFERENCES cys.endosos (empresa, id),
    CHECK (hasta IS NULL OR hasta > desde),
    CONSTRAINT periodo_partes_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_periodo WITH =, rol WITH =, daterange(desde, hasta, '[)') WITH &&)
);

-- ---------------------------------------------------------------------------
-- 5. Tarifas del período: tasa (% anual) o prima fija anual por cobertura y, si aplica, por clase
--    (tipo de vehículo). La renovación las copia del año anterior para revisarlas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.periodo_tarifas (
    id            bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa       varchar(30)   NOT NULL,
    id_periodo    bigint        NOT NULL,
    id_cobertura  integer       NOT NULL REFERENCES cys.coberturas (id),
    clase         varchar(120),             -- NULL = para todas las clases
    tasa          numeric(18,8) CHECK (tasa IS NULL OR tasa >= 0),
    prima_fija    numeric(18,2) CHECK (prima_fija IS NULL OR prima_fija >= 0),
    creado_en     timestamptz   NOT NULL DEFAULT now(),
    creado_por    integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id),
    CHECK (num_nonnulls(tasa, prima_fija) >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS periodo_tarifas_unica ON cys.periodo_tarifas (id_periodo, id_cobertura, coalesce(clase, ''));

-- ---------------------------------------------------------------------------
-- 6. Asegurados del período (inclusiones): una persona, un vehículo o una propiedad
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.inclusiones (
    id                     bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa                varchar(30)   NOT NULL,
    id_periodo             bigint        NOT NULL,
    id_persona             bigint,
    id_vehiculo            bigint,
    id_propiedad           bigint,
    certificado            varchar(40),
    ceco                   varchar(40),            -- formato por confirmar (pregunta 14)
    clase_tarifa           varchar(120),           -- clase para tarifas por clase (p. ej. tipo de vehículo en RCV)
    desde                  date          NOT NULL,
    hasta                  date          NOT NULL,
    valor_bien             numeric(18,2) CHECK (valor_bien IS NULL OR valor_bien >= 0),
    aditamentos            numeric(18,2) CHECK (aditamentos IS NULL OR aditamentos >= 0),
    suma_asegurada         numeric(18,2) CHECK (suma_asegurada IS NULL OR suma_asegurada >= 0),
    id_calculo_suma        bigint,                 -- cálculo que dio la suma asegurada (si la calculó una regla)
    id_inclusion_anterior  bigint,                 -- misma inclusión en el período anterior (renovación)
    id_endoso_alta         bigint,
    id_endoso_baja         bigint,
    observaciones          text,
    creado_en              timestamptz   NOT NULL DEFAULT now(),
    creado_por             integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id),
    FOREIGN KEY (empresa, id_persona) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_vehiculo) REFERENCES cys.vehiculos (empresa, id),
    FOREIGN KEY (empresa, id_propiedad) REFERENCES cys.propiedades (empresa, id),
    FOREIGN KEY (empresa, id_inclusion_anterior) REFERENCES cys.inclusiones (empresa, id),
    FOREIGN KEY (empresa, id_endoso_alta) REFERENCES cys.endosos (empresa, id),
    FOREIGN KEY (empresa, id_endoso_baja) REFERENCES cys.endosos (empresa, id),
    CONSTRAINT inclusiones_un_sujeto CHECK (num_nonnulls(id_persona, id_vehiculo, id_propiedad) = 1),
    CHECK (hasta > desde),
    CONSTRAINT inclusiones_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_periodo WITH =,
        (coalesce(id_persona, 0)) WITH =, (coalesce(id_vehiculo, 0)) WITH =, (coalesce(id_propiedad, 0)) WITH =,
        daterange(desde, hasta, '[)') WITH &&)
);
CREATE INDEX IF NOT EXISTS inclusiones_periodo ON cys.inclusiones (empresa, id_periodo);
CREATE INDEX IF NOT EXISTS inclusiones_persona ON cys.inclusiones (empresa, id_persona) WHERE id_persona IS NOT NULL;
CREATE INDEX IF NOT EXISTS inclusiones_vehiculo ON cys.inclusiones (empresa, id_vehiculo) WHERE id_vehiculo IS NOT NULL;
CREATE INDEX IF NOT EXISTS inclusiones_propiedad ON cys.inclusiones (empresa, id_propiedad) WHERE id_propiedad IS NOT NULL;

CREATE TABLE IF NOT EXISTS cys.beneficiarios (
    id            bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa       varchar(30)  NOT NULL,
    id_inclusion  bigint       NOT NULL,
    id_parte      bigint       NOT NULL,
    parentesco    varchar(60),
    porcentaje    numeric(7,4) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
    desde         date         NOT NULL,
    hasta         date,
    id_endoso     bigint,
    creado_en     timestamptz  NOT NULL DEFAULT now(),
    creado_por    integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_inclusion) REFERENCES cys.inclusiones (empresa, id),
    FOREIGN KEY (empresa, id_parte) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_endoso) REFERENCES cys.endosos (empresa, id),
    CHECK (hasta IS NULL OR hasta > desde),
    CONSTRAINT beneficiarios_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_inclusion WITH =, id_parte WITH =, daterange(desde, hasta, '[)') WITH &&)
);

-- ---------------------------------------------------------------------------
-- 7. Motor de cálculo: reglas versionadas y cálculos guardados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.reglas_calculo (
    id                 serial       PRIMARY KEY,
    nombre             varchar(150) NOT NULL,
    tipo               varchar(15)  NOT NULL CHECK (tipo IN ('suma_asegurada', 'prima', 'prorrateo')),
    -- Ámbito: todos opcionales; gana la regla más específica (póliza > aseguradora > cobertura > ramo > general).
    empresa            varchar(30)  REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    id_aseguradora     bigint,
    id_poliza          bigint,
    id_ramo            integer      REFERENCES cys.ramos (id),
    id_cobertura       integer      REFERENCES cys.coberturas (id),
    -- suma_asegurada y prima: expresión del lenguaje seguro (lib/dominio/calculo/expresiones.ts).
    expresion          text,
    -- prorrateo: evento al que aplica, método y base de días.
    evento             varchar(12)  CHECK (evento IN ('alta', 'baja')),
    metodo             varchar(20)  CHECK (metodo IN ('dias', 'solo_aseguradora')),
    base_dias          smallint     CHECK (base_dias IN (360, 365, 366)),
    decimales          smallint     NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 8),
    -- propuesta: práctica de mercado autorizada por GCH (se usa, pero se muestra como «Propuesta»)
    -- aprobada: confirmada con el contrato · retirada: ya no se usa (se conserva para lo calculado)
    estado             varchar(10)  NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'aprobada', 'retirada')),
    version            integer      NOT NULL DEFAULT 1 CHECK (version > 0),
    id_regla_anterior  integer      REFERENCES cys.reglas_calculo (id),
    vigente_desde      date         NOT NULL DEFAULT DATE '2000-01-01',
    vigente_hasta      date,
    descripcion        text,
    creado_en          timestamptz  NOT NULL DEFAULT now(),
    creado_por         integer      REFERENCES cys.app_usuarios (id_usuario),
    FOREIGN KEY (empresa, id_aseguradora) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_poliza) REFERENCES cys.polizas (empresa, id),
    CHECK (id_aseguradora IS NULL OR empresa IS NOT NULL),
    CHECK (id_poliza IS NULL OR empresa IS NOT NULL),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
    CONSTRAINT reglas_forma CHECK (
        (tipo = 'prorrateo' AND evento IS NOT NULL AND metodo IS NOT NULL AND expresion IS NULL
            AND (metodo <> 'dias' OR base_dias IS NOT NULL))
        OR (tipo <> 'prorrateo' AND expresion IS NOT NULL AND evento IS NULL AND metodo IS NULL AND base_dias IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reglas_nombre_version ON cys.reglas_calculo (nombre, version);

CREATE TABLE IF NOT EXISTS cys.calculos (
    id          bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa     varchar(30)   NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    id_regla    integer       REFERENCES cys.reglas_calculo (id),   -- NULL: no había regla aplicable
    tipo        varchar(15)   NOT NULL CHECK (tipo IN ('suma_asegurada', 'prima', 'prorrateo')),
    expresion   text,                                            -- copia exacta de lo usado
    entradas    jsonb         NOT NULL DEFAULT '{}',
    faltantes   jsonb         NOT NULL DEFAULT '[]',
    resultado   numeric(18,2),
    moneda      char(3),
    estado      varchar(12)   NOT NULL DEFAULT 'simulacion' CHECK (estado IN ('simulacion', 'definitivo')),
    creado_en   timestamptz   NOT NULL DEFAULT now(),
    creado_por  integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    CHECK ((resultado IS NULL) = (jsonb_array_length(faltantes) > 0))
);

ALTER TABLE cys.inclusiones DROP CONSTRAINT IF EXISTS inclusiones_calculo_suma;
ALTER TABLE cys.inclusiones ADD CONSTRAINT inclusiones_calculo_suma FOREIGN KEY (empresa, id_calculo_suma) REFERENCES cys.calculos (empresa, id);

CREATE TABLE IF NOT EXISTS cys.inclusion_coberturas (
    id                bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa           varchar(30)   NOT NULL,
    id_inclusion      bigint        NOT NULL,
    id_cobertura      integer       NOT NULL REFERENCES cys.coberturas (id),
    suma_asegurada    numeric(18,2) CHECK (suma_asegurada IS NULL OR suma_asegurada >= 0),  -- si difiere de la del asegurado
    prima_anual       numeric(18,2) CHECK (prima_anual IS NULL OR prima_anual >= 0),
    prima_periodo     numeric(18,2) CHECK (prima_periodo IS NULL OR prima_periodo >= 0),    -- lo que se cobra por los días incluidos
    -- calculada: por regla · aseguradora: importe que indicó la aseguradora (reemplaza al calculado con motivo)
    origen            varchar(12)   CHECK (origen IN ('calculada', 'aseguradora')),
    id_calculo        bigint,
    prima_calculada   numeric(18,2),   -- resultado original de la regla cuando se reemplazó (R9)
    motivo_ajuste     text,
    ajustado_por      integer       REFERENCES cys.app_usuarios (id_usuario),
    id_endoso         bigint,
    creado_en         timestamptz   NOT NULL DEFAULT now(),
    creado_por        integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    UNIQUE (id_inclusion, id_cobertura),
    FOREIGN KEY (empresa, id_inclusion) REFERENCES cys.inclusiones (empresa, id),
    FOREIGN KEY (empresa, id_calculo) REFERENCES cys.calculos (empresa, id),
    FOREIGN KEY (empresa, id_endoso) REFERENCES cys.endosos (empresa, id),
    CHECK ((prima_anual IS NULL) = (origen IS NULL)),
    CHECK (origen IS DISTINCT FROM 'aseguradora' OR motivo_ajuste IS NOT NULL)
);

-- Detalle de prima de cada endoso por cobertura (alta: cobro por los días que faltan; baja: devolución).
CREATE TABLE IF NOT EXISTS cys.endoso_lineas (
    id                       bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa                  varchar(30)   NOT NULL,
    id_endoso                bigint        NOT NULL,
    id_inclusion_cobertura   bigint        NOT NULL,
    prima_anual              numeric(18,2) NOT NULL,
    dias                     integer       NOT NULL CHECK (dias >= 0),
    base_dias                smallint,
    importe                  numeric(18,2) NOT NULL,   -- con signo, igual que endosos.prima
    origen                   varchar(12)   NOT NULL CHECK (origen IN ('calculada', 'aseguradora')),
    id_regla_prorrateo       integer       REFERENCES cys.reglas_calculo (id),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_endoso) REFERENCES cys.endosos (empresa, id),
    FOREIGN KEY (empresa, id_inclusion_cobertura) REFERENCES cys.inclusion_coberturas (empresa, id)
);

-- Propuesta base de mercado (docs/REGLAS-Y-PENDIENTES.md §2). Sin importes: las tasas y primas fijas
-- de cada contrato se cargan en las tarifas del período.
INSERT INTO cys.reglas_calculo (nombre, tipo, id_ramo, id_cobertura, expresion, descripcion)
SELECT v.nombre, v.tipo, r.id, c.id, v.expresion, v.descripcion
FROM (VALUES
    ('Suma asegurada del vehículo', 'suma_asegurada', 'Automóvil (flota)', NULL,
        'valor_bien + aditamentos', 'Valor del vehículo + aditamentos/blindaje declarados (sin aditamentos declarados cuentan 0).'),
    ('Prima de casco', 'prima', 'Automóvil (flota)', 'Casco (pérdida total / cobertura amplia)',
        'suma_asegurada * tasa / 100', 'Suma asegurada × tasa anual en % (2,5 % = 2,5).'),
    ('Prima de RCV', 'prima', 'Automóvil (flota)', 'RCV',
        'prima_fija', 'Prima fija anual por clase de vehículo (tarifa por tipo), sin tasa.'),
    ('Prima de exceso de límite', 'prima', 'Automóvil (flota)', 'Exceso de límite', 'prima_fija', 'Prima fija anual por vehículo.'),
    ('Prima de defensa penal', 'prima', 'Automóvil (flota)', 'Defensa penal', 'prima_fija', 'Prima fija anual por vehículo.'),
    ('Prima de APOV', 'prima', 'Automóvil (flota)', 'APOV', 'prima_fija', 'Prima fija anual por vehículo.'),
    ('Prima de asistencia vial', 'prima', 'Automóvil (flota)', 'Asistencia vial', 'prima_fija', 'Prima fija anual por vehículo.'),
    ('Prima por tasa (general)', 'prima', NULL, NULL,
        'suma_asegurada * tasa / 100', 'Para coberturas sin regla propia: suma asegurada × tasa anual en %.')
) AS v (nombre, tipo, ramo, cobertura, expresion, descripcion)
LEFT JOIN cys.ramos r ON r.nombre = v.ramo
LEFT JOIN cys.coberturas c ON c.id_ramo = r.id AND c.nombre = v.cobertura
WHERE NOT EXISTS (SELECT 1 FROM cys.reglas_calculo x WHERE x.nombre = v.nombre);

INSERT INTO cys.reglas_calculo (nombre, tipo, evento, metodo, base_dias, descripcion)
SELECT v.nombre, 'prorrateo', v.evento, 'dias', 365, v.descripcion
FROM (VALUES
    ('Prorrata de alta (días / 365)', 'alta', 'Alta durante la vigencia: prima anual × días desde la fecha efectiva hasta el fin ÷ 365.'),
    ('Devolución por baja (días / 365)', 'baja', 'Baja por venta o retiro: prima anual × días restantes ÷ 365.')
) AS v (nombre, evento, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM cys.reglas_calculo x WHERE x.nombre = v.nombre);

-- ---------------------------------------------------------------------------
-- 8. Finanzas: obligaciones (por pagar / por cobrar) por movimientos, pagos e imputaciones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.obligaciones (
    id                 bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa            varchar(30)  NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    naturaleza         varchar(10)  NOT NULL CHECK (naturaleza IN ('por_pagar', 'por_cobrar')),
    concepto           varchar(20)  NOT NULL CHECK (concepto IN ('prima', 'ajuste_prima', 'devolucion_prima', 'reembolso_siniestro', 'otro')),
    id_contraparte     bigint       NOT NULL,
    id_periodo         bigint,
    id_endoso          bigint,
    moneda             char(3)      NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
    fecha_emision      date         NOT NULL,
    fecha_vencimiento  date         NOT NULL,
    documento          varchar(60),          -- recibo o aviso de cobro de la aseguradora
    descripcion        text         NOT NULL,
    estado             varchar(10)  NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
    creado_en          timestamptz  NOT NULL DEFAULT now(),
    creado_por         integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_contraparte) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_periodo) REFERENCES cys.poliza_periodos (empresa, id),
    FOREIGN KEY (empresa, id_endoso) REFERENCES cys.endosos (empresa, id),
    CHECK (fecha_vencimiento >= fecha_emision),
    CHECK (concepto NOT IN ('prima', 'ajuste_prima', 'devolucion_prima') OR id_periodo IS NOT NULL)
);
-- Una obligación de prima por período confirmado y una por endoso.
CREATE UNIQUE INDEX IF NOT EXISTS obligaciones_prima_periodo ON cys.obligaciones (id_periodo) WHERE concepto = 'prima' AND estado = 'vigente';
CREATE UNIQUE INDEX IF NOT EXISTS obligaciones_endoso ON cys.obligaciones (id_endoso) WHERE id_endoso IS NOT NULL AND estado = 'vigente';
CREATE INDEX IF NOT EXISTS obligaciones_vencimiento ON cys.obligaciones (empresa, naturaleza, fecha_vencimiento);

CREATE TABLE IF NOT EXISTS cys.obligacion_movimientos (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_obligacion   bigint        NOT NULL,
    tipo            varchar(12)   NOT NULL CHECK (tipo IN ('cargo', 'aumento', 'disminucion', 'anulacion')),
    monto           numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha           date          NOT NULL,
    motivo          text,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_obligacion) REFERENCES cys.obligaciones (empresa, id)
);
CREATE INDEX IF NOT EXISTS obligacion_movimientos_obligacion ON cys.obligacion_movimientos (id_obligacion);

CREATE TABLE IF NOT EXISTS cys.pagos (
    id                 bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa            varchar(30)   NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    sentido            varchar(8)    NOT NULL CHECK (sentido IN ('egreso', 'ingreso')),
    fecha              date          NOT NULL,
    monto              numeric(18,2) NOT NULL CHECK (monto > 0),
    moneda             char(3)       NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
    referencia         varchar(80),
    id_contraparte     bigint        NOT NULL,
    observaciones      text,
    estado             varchar(10)   NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
    anulado_por        integer       REFERENCES cys.app_usuarios (id_usuario),
    anulado_en         timestamptz,
    motivo_anulacion   text,
    creado_en          timestamptz   NOT NULL DEFAULT now(),
    creado_por         integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_contraparte) REFERENCES cys.partes (empresa, id),
    CONSTRAINT pagos_anulacion CHECK ((estado = 'anulado') = (anulado_por IS NOT NULL AND anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL))
);

-- Cuánto de un pago se aplica a cada obligación. Nunca se edita: se revierte con otra fila (revierte_a).
CREATE TABLE IF NOT EXISTS cys.imputaciones (
    id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)   NOT NULL,
    id_pago         bigint        NOT NULL,
    id_obligacion   bigint        NOT NULL,
    monto           numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha           date          NOT NULL,
    revierte_a      bigint,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    creado_por      integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_pago) REFERENCES cys.pagos (empresa, id),
    FOREIGN KEY (empresa, id_obligacion) REFERENCES cys.obligaciones (empresa, id),
    FOREIGN KEY (empresa, revierte_a) REFERENCES cys.imputaciones (empresa, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS imputaciones_una_reversion ON cys.imputaciones (revierte_a) WHERE revierte_a IS NOT NULL;
CREATE INDEX IF NOT EXISTS imputaciones_obligacion ON cys.imputaciones (id_obligacion);
CREATE INDEX IF NOT EXISTS imputaciones_pago ON cys.imputaciones (id_pago);

-- Saldos desde los movimientos (fuente única para pantallas, indicadores y reportes).
CREATE OR REPLACE VIEW cys.vw_saldos_obligaciones AS
WITH montos AS (
    SELECT id_obligacion,
           sum(CASE WHEN tipo IN ('cargo', 'aumento') THEN monto ELSE -monto END) AS monto
    FROM cys.obligacion_movimientos GROUP BY id_obligacion
), aplicado AS (
    SELECT i.id_obligacion, sum(i.monto) AS imputado
    FROM cys.imputaciones i
    WHERE i.revierte_a IS NULL
      AND NOT EXISTS (SELECT 1 FROM cys.imputaciones r WHERE r.revierte_a = i.id)
    GROUP BY i.id_obligacion
)
SELECT o.id, o.empresa, o.naturaleza, o.concepto, o.moneda, o.estado, o.fecha_vencimiento,
       coalesce(m.monto, 0)::numeric(18,2) AS monto,
       coalesce(a.imputado, 0)::numeric(18,2) AS imputado,
       (coalesce(m.monto, 0) - coalesce(a.imputado, 0))::numeric(18,2) AS saldo
FROM cys.obligaciones o
LEFT JOIN montos m ON m.id_obligacion = o.id
LEFT JOIN aplicado a ON a.id_obligacion = o.id;

-- Imputación válida: misma empresa y moneda, pago y obligación vigentes, sin pasar del saldo de
-- ninguno de los dos. Las reversiones devuelven exactamente lo imputado.
CREATE OR REPLACE FUNCTION cys.validar_imputacion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    p cys.pagos%ROWTYPE;
    o cys.obligaciones%ROWTYPE;
    original cys.imputaciones%ROWTYPE;
    usado_pago numeric;
    saldo_obligacion numeric;
BEGIN
    SELECT * INTO p FROM cys.pagos WHERE id = NEW.id_pago FOR UPDATE;
    SELECT * INTO o FROM cys.obligaciones WHERE id = NEW.id_obligacion FOR UPDATE;
    IF NEW.revierte_a IS NOT NULL THEN
        SELECT * INTO original FROM cys.imputaciones WHERE id = NEW.revierte_a;
        IF original.revierte_a IS NOT NULL OR original.id_pago <> NEW.id_pago OR original.id_obligacion <> NEW.id_obligacion OR original.monto <> NEW.monto THEN
            RAISE EXCEPTION 'La reversión debe devolver exactamente una imputación original' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF p.estado <> 'vigente' OR o.estado <> 'vigente' THEN
        RAISE EXCEPTION 'El pago y la obligación deben estar vigentes' USING ERRCODE = '23514';
    END IF;
    IF p.moneda <> o.moneda THEN
        RAISE EXCEPTION 'El pago (%) y la obligación (%) tienen distinta moneda: no se convierten', p.moneda, o.moneda USING ERRCODE = '23514';
    END IF;
    IF (p.sentido = 'egreso') <> (o.naturaleza = 'por_pagar') THEN
        RAISE EXCEPTION 'Un egreso solo paga obligaciones por pagar y un ingreso solo cobra por cobrar' USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(i.monto), 0) INTO usado_pago FROM cys.imputaciones i
     WHERE i.id_pago = NEW.id_pago AND i.revierte_a IS NULL AND NOT EXISTS (SELECT 1 FROM cys.imputaciones r WHERE r.revierte_a = i.id);
    IF usado_pago + NEW.monto > p.monto THEN
        RAISE EXCEPTION 'La imputación supera lo disponible del pago (%)', p.monto - usado_pago USING ERRCODE = '23514';
    END IF;
    SELECT saldo INTO saldo_obligacion FROM cys.vw_saldos_obligaciones WHERE id = NEW.id_obligacion;
    IF NEW.monto > saldo_obligacion THEN
        RAISE EXCEPTION 'La imputación supera el saldo de la obligación (%)', saldo_obligacion USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS imputaciones_validar ON cys.imputaciones;
CREATE TRIGGER imputaciones_validar BEFORE INSERT ON cys.imputaciones FOR EACH ROW EXECUTE FUNCTION cys.validar_imputacion();

-- Movimientos e imputaciones no se editan ni se borran (se revierten con otro registro).
CREATE OR REPLACE FUNCTION cys.solo_agregar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% no se modifica ni se borra: se registra un movimiento inverso', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS obligacion_movimientos_inmutable ON cys.obligacion_movimientos;
CREATE TRIGGER obligacion_movimientos_inmutable BEFORE UPDATE OR DELETE ON cys.obligacion_movimientos FOR EACH ROW EXECUTE FUNCTION cys.solo_agregar();
DROP TRIGGER IF EXISTS imputaciones_inmutable ON cys.imputaciones;
CREATE TRIGGER imputaciones_inmutable BEFORE UPDATE OR DELETE ON cys.imputaciones FOR EACH ROW EXECUTE FUNCTION cys.solo_agregar();
DROP TRIGGER IF EXISTS endoso_lineas_inmutable ON cys.endoso_lineas;
CREATE TRIGGER endoso_lineas_inmutable BEFORE UPDATE OR DELETE ON cys.endoso_lineas FOR EACH ROW EXECUTE FUNCTION cys.solo_agregar();

-- Un pago solo cambia para anularse, y antes se revierten sus imputaciones.
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
DROP TRIGGER IF EXISTS pagos_proteger ON cys.pagos;
CREATE TRIGGER pagos_proteger BEFORE UPDATE OR DELETE ON cys.pagos FOR EACH ROW EXECUTE FUNCTION cys.proteger_pago();

-- ---------------------------------------------------------------------------
-- 9. Un período confirmado no se edita: los cambios entran por endoso (R5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cys.estado_periodo(p_id bigint) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT estado FROM cys.poliza_periodos WHERE id = p_id
$$;

CREATE OR REPLACE FUNCTION cys.proteger_periodo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los períodos no se borran: se anulan' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado = 'anulado' THEN
        RAISE EXCEPTION 'El período está anulado' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado = 'confirmado' AND (
        NEW.estado = 'borrador'
        OR (NEW.id_poliza, NEW.numero_periodo, NEW.vigencia_desde, NEW.vigencia_hasta, NEW.moneda, NEW.id_periodo_anterior, NEW.confirmado_por, NEW.confirmado_en)
           IS DISTINCT FROM (OLD.id_poliza, OLD.numero_periodo, OLD.vigencia_desde, OLD.vigencia_hasta, OLD.moneda, OLD.id_periodo_anterior, OLD.confirmado_por, OLD.confirmado_en)) THEN
        RAISE EXCEPTION 'El período está confirmado: los cambios se hacen por endoso' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS poliza_periodos_proteger ON cys.poliza_periodos;
CREATE TRIGGER poliza_periodos_proteger BEFORE UPDATE OR DELETE ON cys.poliza_periodos FOR EACH ROW EXECUTE FUNCTION cys.proteger_periodo();

-- Inclusiones: dentro de la vigencia; en un período confirmado solo se agregan por endoso de alta
-- y solo se cierran (hasta) por endoso de baja.
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
DROP TRIGGER IF EXISTS inclusiones_proteger ON cys.inclusiones;
CREATE TRIGGER inclusiones_proteger BEFORE INSERT OR UPDATE OR DELETE ON cys.inclusiones FOR EACH ROW EXECUTE FUNCTION cys.proteger_inclusion();

-- Coberturas del asegurado: en un período confirmado solo se agregan con su endoso.
CREATE OR REPLACE FUNCTION cys.proteger_inclusion_cobertura() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    estado_periodo text;
BEGIN
    SELECT p.estado INTO estado_periodo FROM cys.inclusiones i JOIN cys.poliza_periodos p ON p.id = i.id_periodo
     WHERE i.id = coalesce(NEW.id_inclusion, OLD.id_inclusion);
    IF estado_periodo = 'anulado' OR (estado_periodo = 'confirmado' AND (TG_OP <> 'INSERT' OR NEW.id_endoso IS NULL)) THEN
        RAISE EXCEPTION 'El período está confirmado: los cambios se hacen por endoso' USING ERRCODE = 'P0001';
    END IF;
    RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS inclusion_coberturas_proteger ON cys.inclusion_coberturas;
CREATE TRIGGER inclusion_coberturas_proteger BEFORE INSERT OR UPDATE OR DELETE ON cys.inclusion_coberturas FOR EACH ROW EXECUTE FUNCTION cys.proteger_inclusion_cobertura();

-- Tarifas: solo mientras el período está en preparación.
CREATE OR REPLACE FUNCTION cys.proteger_tarifa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF cys.estado_periodo(coalesce(NEW.id_periodo, OLD.id_periodo)) <> 'borrador' THEN
        RAISE EXCEPTION 'Las tarifas de un período confirmado no se modifican' USING ERRCODE = 'P0001';
    END IF;
    RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS periodo_tarifas_proteger ON cys.periodo_tarifas;
CREATE TRIGGER periodo_tarifas_proteger BEFORE INSERT OR UPDATE OR DELETE ON cys.periodo_tarifas FOR EACH ROW EXECUTE FUNCTION cys.proteger_tarifa();

-- Partes y beneficiarios: en un período confirmado solo se agregan con endoso y solo se cierran (hasta).
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
DROP TRIGGER IF EXISTS periodo_partes_proteger ON cys.periodo_partes;
CREATE TRIGGER periodo_partes_proteger BEFORE INSERT OR UPDATE OR DELETE ON cys.periodo_partes FOR EACH ROW EXECUTE FUNCTION cys.proteger_con_fechas();
DROP TRIGGER IF EXISTS beneficiarios_proteger ON cys.beneficiarios;
CREATE TRIGGER beneficiarios_proteger BEFORE INSERT OR UPDATE OR DELETE ON cys.beneficiarios FOR EACH ROW EXECUTE FUNCTION cys.proteger_con_fechas();

-- Las reglas en uso no se editan: se crea una versión nueva (solo cambian estado y vigente_hasta).
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
DROP TRIGGER IF EXISTS reglas_calculo_proteger ON cys.reglas_calculo;
CREATE TRIGGER reglas_calculo_proteger BEFORE UPDATE OR DELETE ON cys.reglas_calculo FOR EACH ROW EXECUTE FUNCTION cys.proteger_regla();

-- ---------------------------------------------------------------------------
-- 10. Documentos de pólizas y ajustes
-- ---------------------------------------------------------------------------
ALTER TABLE cys.documentos ADD COLUMN IF NOT EXISTS id_poliza bigint;
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_poliza;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_poliza FOREIGN KEY (empresa, id_poliza) REFERENCES cys.polizas (empresa, id);
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos
    ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad, id_poliza) = 1);
CREATE INDEX IF NOT EXISTS documentos_poliza_idx ON cys.documentos (empresa, id_poliza) WHERE id_poliza IS NOT NULL;

INSERT INTO cys.app_ajustes (clave, valor, descripcion) VALUES
    ('renovaciones.dias_anticipacion', '60', 'Días antes del fin de vigencia en que una póliza aparece «Por renovar»'),
    ('primas.dias_por_vencer', '15', 'Días antes del vencimiento en que una prima por pagar se muestra «Por vencer»')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO cys.catalogo_valores (lista, nombre, orden) VALUES
    ('tipo_documento', 'Póliza / cuadro de póliza', 6), ('tipo_documento', 'Endoso', 7), ('tipo_documento', 'Recibo de prima', 8)
ON CONFLICT (lista, nombre) DO NOTHING;
