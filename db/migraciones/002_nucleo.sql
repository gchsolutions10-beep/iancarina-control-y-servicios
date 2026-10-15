-- =============================================================================
-- 002_nucleo.sql — Etapa 2: catálogos, personas (naturales y jurídicas), relaciones con la
-- empresa, vehículos, propiedades, titularidades con historial, archivos y documentos.
--
-- * Cada empresa se maneja por separado: toda tabla de negocio lleva `empresa` y las llaves
--   entre ellas son compuestas (empresa, id), así la base impide mezclar datos de dos empresas.
-- * Nada se borra: bajas con fecha, relaciones y titularidades cerradas con `hasta`.
-- * Los archivos NO se guardan en la base: solo sus metadatos (contenido en Vercel Blob privado
--   o en la carpeta compartida del servidor).
-- Idempotente. Reversión: 002_nucleo.rollback.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normaliza identificaciones y placas: mayúsculas, sin espacios, puntos ni guiones.
CREATE OR REPLACE FUNCTION cys.normalizar_codigo(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT upper(regexp_replace(coalesce(texto, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- ---------------------------------------------------------------------------
-- 1. Catálogos (Configuración; comunes a todas las empresas, no contienen datos de negocio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.catalogo_valores (
    id      serial       PRIMARY KEY,
    lista   varchar(40)  NOT NULL,
    nombre  varchar(120) NOT NULL,
    orden   integer      NOT NULL DEFAULT 0,
    activo  boolean      NOT NULL DEFAULT true,
    UNIQUE (lista, nombre)
);

CREATE TABLE IF NOT EXISTS cys.marcas (
    id      serial       PRIMARY KEY,
    nombre  varchar(80)  NOT NULL UNIQUE,
    activo  boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cys.modelos (
    id        serial       PRIMARY KEY,
    id_marca  integer      NOT NULL REFERENCES cys.marcas (id),
    nombre    varchar(80)  NOT NULL,
    activo    boolean      NOT NULL DEFAULT true,
    UNIQUE (id_marca, nombre)
);

-- Valores iniciales genéricos (no contractuales). El administrador los cambia en Configuración.
INSERT INTO cys.catalogo_valores (lista, nombre, orden) VALUES
    ('tipo_identificacion', 'V', 1), ('tipo_identificacion', 'E', 2), ('tipo_identificacion', 'P', 3),
    ('tipo_identificacion', 'J', 4), ('tipo_identificacion', 'G', 5),
    ('tipo_relacion', 'Socio', 1), ('tipo_relacion', 'Accionista', 2), ('tipo_relacion', 'Propietario', 3),
    ('tipo_relacion', 'Director', 4),
    ('funcion_organizacion', 'Aseguradora', 1), ('funcion_organizacion', 'Corredor', 2),
    ('funcion_organizacion', 'Taller', 3), ('funcion_organizacion', 'Transportista', 4),
    ('funcion_organizacion', 'Proveedor', 5),
    ('tipo_vehiculo', 'Automóvil', 1), ('tipo_vehiculo', 'Camioneta', 2), ('tipo_vehiculo', 'Camión', 3),
    ('tipo_vehiculo', 'Chuto', 4), ('tipo_vehiculo', 'Batea / remolque', 5), ('tipo_vehiculo', 'Moto', 6),
    ('tipo_vehiculo', 'Montacargas', 7),
    ('tipo_inmueble', 'Casa', 1), ('tipo_inmueble', 'Apartamento', 2), ('tipo_inmueble', 'Edificio', 3),
    ('tipo_inmueble', 'Galpón', 4), ('tipo_inmueble', 'Oficina', 5), ('tipo_inmueble', 'Terreno', 6),
    ('tipo_documento', 'Identificación', 1), ('tipo_documento', 'Título de propiedad', 2),
    ('tipo_documento', 'Certificado de registro', 3), ('tipo_documento', 'Fotografía', 4),
    ('tipo_documento', 'Acta / documento societario', 5), ('tipo_documento', 'Otro', 99)
ON CONFLICT (lista, nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Archivos (solo metadatos) — se crean antes porque las fichas tienen foto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.archivos (
    id             uuid         PRIMARY KEY,
    empresa        varchar(30)  NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    almacen        varchar(10)  NOT NULL CHECK (almacen IN ('nube', 'carpeta')),
    clave          text         NOT NULL,            -- generada por el servidor, nunca por el navegador
    nombre         varchar(255) NOT NULL,
    tipo_mime      varchar(120) NOT NULL,            -- detectado por el contenido
    tamano         bigint       NOT NULL CHECK (tamano > 0),
    sha256         char(64)     NOT NULL,
    es_imagen      boolean      NOT NULL,
    subido_por     integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    subido_en      timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (empresa, id)
);

-- ---------------------------------------------------------------------------
-- 3. Partes: personas naturales y jurídicas (una tabla, reglas por tipo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.partes (
    id                         bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa                    varchar(30)  NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    tipo                       varchar(10)  NOT NULL CHECK (tipo IN ('natural', 'juridica')),
    tipo_identificacion        varchar(5)   NOT NULL,
    numero_identificacion      varchar(30)  NOT NULL,
    identificacion_normalizada text         GENERATED ALWAYS AS (cys.normalizar_codigo(tipo_identificacion || numero_identificacion)) STORED,
    nombres                    varchar(120),
    apellidos                  varchar(120),
    razon_social               varchar(200),
    funciones                  text[]       NOT NULL DEFAULT '{}',  -- jurídicas: aseguradora, taller…
    fecha_nacimiento           date,
    telefono                   varchar(40),
    correo                     varchar(120),
    direccion                  text,
    observaciones              text,
    id_foto                    uuid,
    estado                     varchar(10)  NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva', 'fusionada')),
    fusionada_en               bigint,
    creado_en                  timestamptz  NOT NULL DEFAULT now(),
    creado_por                 integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en             timestamptz  NOT NULL DEFAULT now(),
    actualizado_por            integer      REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    CONSTRAINT partes_natural CHECK (tipo <> 'natural' OR (nombres IS NOT NULL AND apellidos IS NOT NULL AND razon_social IS NULL)),
    CONSTRAINT partes_juridica CHECK (tipo <> 'juridica' OR (razon_social IS NOT NULL AND nombres IS NULL AND apellidos IS NULL AND fecha_nacimiento IS NULL)),
    CONSTRAINT partes_fusion CHECK ((estado = 'fusionada') = (fusionada_en IS NOT NULL)),
    FOREIGN KEY (empresa, fusionada_en) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_foto) REFERENCES cys.archivos (empresa, id)
);
-- Una persona = una ficha por empresa (las fusionadas no cuentan).
CREATE UNIQUE INDEX IF NOT EXISTS partes_identificacion_unica
    ON cys.partes (empresa, identificacion_normalizada) WHERE estado <> 'fusionada';
CREATE INDEX IF NOT EXISTS partes_nombre_trgm
    ON cys.partes USING gin ((coalesce(nombres, '') || ' ' || coalesce(apellidos, '') || ' ' || coalesce(razon_social, '')) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. Relaciones persona–empresa (socios, accionistas, propietarios…) con historial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.relaciones_empresa (
    id              bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa         varchar(30)  NOT NULL,
    id_parte        bigint       NOT NULL,
    tipo_relacion   varchar(120) NOT NULL,
    porcentaje      numeric(7,4) CHECK (porcentaje IS NULL OR (porcentaje > 0 AND porcentaje <= 100)),
    desde           date         NOT NULL,
    hasta           date,
    observaciones   text,
    creado_en       timestamptz  NOT NULL DEFAULT now(),
    creado_por      integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_parte) REFERENCES cys.partes (empresa, id),
    CHECK (hasta IS NULL OR hasta >= desde),
    CONSTRAINT relaciones_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_parte WITH =, tipo_relacion WITH =,
        daterange(desde, hasta, '[]') WITH &&)
);

-- ---------------------------------------------------------------------------
-- 5. Vehículos y propiedades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.vehiculos (
    id                    bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa               varchar(30)  NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    origen                varchar(10)  NOT NULL CHECK (origen IN ('propio', 'tercero')),
    placa                 varchar(15)  NOT NULL,
    placa_normalizada     text         GENERATED ALWAYS AS (cys.normalizar_codigo(placa)) STORED,
    id_modelo             integer      REFERENCES cys.modelos (id),
    anio                  smallint     CHECK (anio IS NULL OR anio BETWEEN 1950 AND 2100),
    tm                    varchar(40),            -- significado por confirmar con el cliente
    color                 varchar(120),
    tipo_vehiculo         varchar(120),
    clasificacion_chuto   varchar(120),
    tiene_batea           boolean      NOT NULL DEFAULT false,
    fecha_adquisicion     date,
    estado                varchar(10)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'vendido', 'retirado')),
    fecha_baja            date,
    motivo_baja           varchar(15)  CHECK (motivo_baja IN ('venta', 'transferencia', 'retiro')),
    observaciones         text,
    id_foto               uuid,
    creado_en             timestamptz  NOT NULL DEFAULT now(),
    creado_por            integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en        timestamptz  NOT NULL DEFAULT now(),
    actualizado_por       integer      REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_foto) REFERENCES cys.archivos (empresa, id),
    CONSTRAINT vehiculos_baja CHECK ((estado = 'activo') = (fecha_baja IS NULL AND motivo_baja IS NULL)),
    CONSTRAINT vehiculos_baja_fecha CHECK (fecha_baja IS NULL OR fecha_adquisicion IS NULL OR fecha_baja >= fecha_adquisicion)
);
-- Una placa activa por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_placa_activa ON cys.vehiculos (empresa, placa_normalizada) WHERE estado = 'activo';

CREATE TABLE IF NOT EXISTS cys.propiedades (
    id                bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa           varchar(30)   NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    nombre            varchar(150)  NOT NULL,
    tipo_inmueble     varchar(120),
    direccion         text,
    valor_declarado   numeric(18,2) CHECK (valor_declarado IS NULL OR valor_declarado >= 0),
    moneda            char(3)       CHECK (moneda ~ '^[A-Z]{3}$'),
    estado            varchar(10)   NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'vendida', 'retirada')),
    fecha_baja        date,
    motivo_baja       varchar(15)   CHECK (motivo_baja IN ('venta', 'transferencia', 'retiro')),
    observaciones     text,
    id_foto           uuid,
    creado_en         timestamptz   NOT NULL DEFAULT now(),
    creado_por        integer       NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en    timestamptz   NOT NULL DEFAULT now(),
    actualizado_por   integer       REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_foto) REFERENCES cys.archivos (empresa, id),
    CONSTRAINT propiedades_baja CHECK ((estado = 'activa') = (fecha_baja IS NULL AND motivo_baja IS NULL)),
    CONSTRAINT propiedades_moneda CHECK ((valor_declarado IS NULL) = (moneda IS NULL))
);

-- ---------------------------------------------------------------------------
-- 6. Titularidades: propietario legal y responsable administrativo, con historial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.titularidades (
    id            bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa       varchar(30)  NOT NULL,
    id_vehiculo   bigint,
    id_propiedad  bigint,
    rol           varchar(30)  NOT NULL CHECK (rol IN ('propietario_legal', 'responsable_administrativo')),
    id_parte      bigint       NOT NULL,
    desde         date         NOT NULL,
    hasta         date,
    observaciones text,
    creado_en     timestamptz  NOT NULL DEFAULT now(),
    creado_por    integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_vehiculo) REFERENCES cys.vehiculos (empresa, id),
    FOREIGN KEY (empresa, id_propiedad) REFERENCES cys.propiedades (empresa, id),
    FOREIGN KEY (empresa, id_parte) REFERENCES cys.partes (empresa, id),
    CONSTRAINT titularidades_un_activo CHECK (num_nonnulls(id_vehiculo, id_propiedad) = 1),
    CHECK (hasta IS NULL OR hasta >= desde),
    CONSTRAINT titularidades_vehiculo_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_vehiculo WITH =, rol WITH =, daterange(desde, hasta, '[]') WITH &&) WHERE (id_vehiculo IS NOT NULL),
    CONSTRAINT titularidades_propiedad_sin_solape EXCLUDE USING gist (
        empresa WITH =, id_propiedad WITH =, rol WITH =, daterange(desde, hasta, '[]') WITH &&) WHERE (id_propiedad IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS titularidades_parte ON cys.titularidades (empresa, id_parte);

-- ---------------------------------------------------------------------------
-- 7. Documentos: un archivo vinculado a exactamente una ficha
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cys.documentos (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa          varchar(30)  NOT NULL,
    id_archivo       uuid         NOT NULL,
    tipo_documento   varchar(120) NOT NULL,
    descripcion      text,
    fecha_documento  date,
    confidencial     boolean      NOT NULL DEFAULT false,
    id_parte         bigint,
    id_vehiculo      bigint,
    id_propiedad     bigint,
    id_relacion      bigint,
    retirado         boolean      NOT NULL DEFAULT false,   -- se oculta, nunca se borra
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    UNIQUE (empresa, id),
    FOREIGN KEY (empresa, id_archivo) REFERENCES cys.archivos (empresa, id),
    FOREIGN KEY (empresa, id_parte) REFERENCES cys.partes (empresa, id),
    FOREIGN KEY (empresa, id_vehiculo) REFERENCES cys.vehiculos (empresa, id),
    FOREIGN KEY (empresa, id_propiedad) REFERENCES cys.propiedades (empresa, id),
    FOREIGN KEY (empresa, id_relacion) REFERENCES cys.relaciones_empresa (empresa, id),
    CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad, id_relacion) = 1)
);
CREATE INDEX IF NOT EXISTS documentos_parte ON cys.documentos (empresa, id_parte) WHERE id_parte IS NOT NULL;
CREATE INDEX IF NOT EXISTS documentos_vehiculo ON cys.documentos (empresa, id_vehiculo) WHERE id_vehiculo IS NOT NULL;
CREATE INDEX IF NOT EXISTS documentos_propiedad ON cys.documentos (empresa, id_propiedad) WHERE id_propiedad IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. Permiso de configuración y ajuste de archivos
-- ---------------------------------------------------------------------------
INSERT INTO cys.app_ajustes (clave, valor, descripcion) VALUES
    ('archivos.tamano_maximo_mb', '4', 'Tamaño máximo de cada archivo (MB). En Vercel el límite real es 4 MB.')
ON CONFLICT (clave) DO NOTHING;
