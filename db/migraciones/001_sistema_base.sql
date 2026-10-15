-- =============================================================================
-- 001_sistema_base.sql
-- Base del sistema: empresas (cada una se maneja por separado), usuarios, roles por empresa,
-- permisos excepcionales, bitácora (append-only) y ajustes. Esquema propio: cys.
-- Idempotente. Reversión: 001_sistema_base.rollback.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cys;
COMMENT ON SCHEMA cys IS 'Control de Seguros y Activos (GCH Solutions)';

-- 1. Empresas: frontera de datos. Un usuario solo ve las empresas donde tiene rol.
CREATE TABLE IF NOT EXISTS cys.app_empresas (
    codigo     varchar(30)  PRIMARY KEY CHECK (codigo ~ '^[a-z0-9-]+$'),
    nombre     varchar(150) NOT NULL,
    rif        varchar(20),
    orden      integer      NOT NULL DEFAULT 0,
    activa     boolean      NOT NULL DEFAULT true,
    creado_en  timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_empresas_rif ON cys.app_empresas (upper(rif)) WHERE rif IS NOT NULL;

-- 2. Usuarios (nunca se borran: se bloquean).
CREATE TABLE IF NOT EXISTS cys.app_usuarios (
    id_usuario          serial       PRIMARY KEY,
    nombre_usuario      varchar(50)  NOT NULL,
    nombre_apellido     varchar(100) NOT NULL,
    cedula              varchar(20),
    cargo               varchar(100),
    clave_hash          text,
    debe_cambiar_clave  boolean      NOT NULL DEFAULT false,
    bloqueado           boolean      NOT NULL DEFAULT false,
    intentos_fallidos   integer      NOT NULL DEFAULT 0,
    bloqueado_hasta     timestamptz,
    ultimo_acceso       timestamptz,
    clave_actualizada   timestamptz,
    recibe_alertas      boolean      NOT NULL DEFAULT false,
    recibe_aprobaciones boolean      NOT NULL DEFAULT false,
    creado_en           timestamptz  NOT NULL DEFAULT now(),
    creado_por          integer      REFERENCES cys.app_usuarios (id_usuario),
    actualizado_en      timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_usuarios_nombre_usuario_ci ON cys.app_usuarios (lower(nombre_usuario));
CREATE UNIQUE INDEX IF NOT EXISTS app_usuarios_cedula ON cys.app_usuarios (cedula) WHERE cedula IS NOT NULL;

-- 3. Permisos y roles. alcance 'global' (administrador, desarrollador) o 'empresa' (analista, consulta).
CREATE TABLE IF NOT EXISTS cys.app_permisos (
    codigo       varchar(60)  PRIMARY KEY,
    nombre       varchar(120) NOT NULL,
    grupo        varchar(60)  NOT NULL,
    alcance      varchar(15)  NOT NULL CHECK (alcance IN ('global', 'empresa')),
    descripcion  text
);

CREATE TABLE IF NOT EXISTS cys.app_roles (
    id           serial       PRIMARY KEY,
    codigo       varchar(30)  NOT NULL UNIQUE,
    nombre       varchar(120) NOT NULL,
    alcance      varchar(15)  NOT NULL CHECK (alcance IN ('global', 'empresa')),
    nivel        integer      NOT NULL DEFAULT 0,
    descripcion  text,
    activo       boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cys.app_rol_permisos (
    id_rol          integer     NOT NULL REFERENCES cys.app_roles (id) ON DELETE CASCADE,
    codigo_permiso  varchar(60) NOT NULL REFERENCES cys.app_permisos (codigo) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, codigo_permiso)
);

CREATE TABLE IF NOT EXISTS cys.app_usuario_roles (
    id_usuario  integer NOT NULL REFERENCES cys.app_usuarios (id_usuario) ON DELETE CASCADE,
    id_rol      integer NOT NULL REFERENCES cys.app_roles (id) ON DELETE CASCADE,
    PRIMARY KEY (id_usuario, id_rol)
);

-- Rol del usuario en cada empresa; vigente_hasta NULL = indefinido.
CREATE TABLE IF NOT EXISTS cys.app_usuario_empresas (
    id_usuario    integer     NOT NULL REFERENCES cys.app_usuarios (id_usuario) ON DELETE CASCADE,
    empresa       varchar(30) NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    id_rol        integer     NOT NULL REFERENCES cys.app_roles (id),
    vigente_hasta date,
    asignado_por  integer     REFERENCES cys.app_usuarios (id_usuario),
    asignado_en   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id_usuario, empresa)
);

-- Permisos excepcionales por empresa (p. ej. ver datos personales, anular movimientos).
CREATE TABLE IF NOT EXISTS cys.app_usuario_permisos (
    id_usuario      integer     NOT NULL REFERENCES cys.app_usuarios (id_usuario) ON DELETE CASCADE,
    empresa         varchar(30) NOT NULL REFERENCES cys.app_empresas (codigo) ON UPDATE CASCADE,
    codigo_permiso  varchar(60) NOT NULL REFERENCES cys.app_permisos (codigo) ON DELETE CASCADE,
    vigente_hasta   date,
    asignado_por    integer     REFERENCES cys.app_usuarios (id_usuario),
    asignado_en     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id_usuario, empresa, codigo_permiso)
);

-- 4. Bitácora: texto legible (formato tgesth) + datos estructurados. No se edita ni se borra.
CREATE TABLE IF NOT EXISTS cys.app_bitacora (
    id                  bigserial   PRIMARY KEY,
    id_usuario_gestion  integer,
    fecha_gestion       timestamp without time zone NOT NULL,
    modulo              text        NOT NULL,
    descripcion         text,
    empresa             varchar(30),
    operacion           varchar(40),
    entidad             varchar(60),
    id_registro         text,
    cambios             jsonb,
    motivo              text
);
CREATE INDEX IF NOT EXISTS app_bitacora_fecha ON cys.app_bitacora (fecha_gestion DESC);
CREATE INDEX IF NOT EXISTS app_bitacora_registro ON cys.app_bitacora (entidad, id_registro);

CREATE OR REPLACE FUNCTION cys.app_bitacora_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La bitácora no se modifica ni se borra';
END $$;
DROP TRIGGER IF EXISTS app_bitacora_inmutable ON cys.app_bitacora;
CREATE TRIGGER app_bitacora_inmutable BEFORE UPDATE OR DELETE ON cys.app_bitacora
    FOR EACH ROW EXECUTE FUNCTION cys.app_bitacora_inmutable();

-- 5. Ajustes del sistema (valor jsonb).
CREATE TABLE IF NOT EXISTS cys.app_ajustes (
    clave            varchar(80)  PRIMARY KEY,
    valor            jsonb        NOT NULL,
    descripcion      text,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  integer      REFERENCES cys.app_usuarios (id_usuario)
);

-- 6. Catálogo inicial (debe coincidir con lib/auth/permisos.ts).
INSERT INTO cys.app_permisos (codigo, nombre, grupo, alcance, descripcion) VALUES
    ('admin.sistema',            'Administrador del sistema', 'Sistema', 'global', 'Acceso total: empresas, usuarios, configuración'),
    ('sistema.desarrollador',    'Desarrollador',             'Sistema', 'global', 'Herramientas técnicas de GCH Solutions'),
    ('empresa.acceso',           'Acceso a la empresa',       'Empresa', 'empresa', 'Ve la empresa en el sistema'),
    ('usuarios.gestionar',       'Gestionar usuarios',        'Empresa', 'empresa', 'Crea y modifica usuarios de la empresa'),
    ('seguros.ver',              'Ver información',           'Seguros', 'empresa', 'Personas, activos, pólizas, siniestros, pagos y reportes'),
    ('seguros.registrar',        'Ingresar información',      'Seguros', 'empresa', 'Registra y modifica; todo queda en la bitácora'),
    ('personas.datos_sensibles', 'Ver datos personales',      'Seguros', 'empresa', 'Fecha de nacimiento, contacto, dirección y siniestros de personas'),
    ('movimientos.anular',       'Anular y ajustar',          'Seguros', 'empresa', 'Anula pagos, cobros y obligaciones; ajusta importes calculados')
ON CONFLICT (codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre, grupo = EXCLUDED.grupo, alcance = EXCLUDED.alcance, descripcion = EXCLUDED.descripcion;

INSERT INTO cys.app_roles (codigo, nombre, alcance, nivel, descripcion) VALUES
    ('administrador', 'Administrador',        'global', 100, 'Acceso total al sistema'),
    ('desarrollador', 'Desarrollador (GCH)',  'global',   0, 'Herramientas técnicas; solo lo asigna usuario:soporte'),
    ('analista',      'Analista',             'empresa', 10, 'Ve e ingresa la información de la empresa'),
    ('consulta',      'Consulta (solo ver)',  'empresa',  5, 'Solo ve la información de la empresa')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cys.app_rol_permisos (id_rol, codigo_permiso)
SELECT r.id, p.codigo
FROM cys.app_roles r
JOIN (VALUES
    ('administrador', 'admin.sistema'),
    ('desarrollador', 'sistema.desarrollador'),
    ('analista',      'empresa.acceso'),
    ('analista',      'seguros.ver'),
    ('analista',      'seguros.registrar'),
    ('consulta',      'empresa.acceso'),
    ('consulta',      'seguros.ver')
) AS v (rol, permiso) ON v.rol = r.codigo
JOIN cys.app_permisos p ON p.codigo = v.permiso
ON CONFLICT DO NOTHING;

INSERT INTO cys.app_ajustes (clave, valor, descripcion) VALUES
    ('polizas.dias_por_vencer', '30', 'Días antes del fin de vigencia en que una póliza se muestra «Por vencer»')
ON CONFLICT (clave) DO NOTHING;
