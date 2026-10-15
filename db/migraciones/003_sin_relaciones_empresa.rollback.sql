-- Reversión de 003: vuelve a crear la tabla de relaciones (vacía) y la columna en documentos.
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
        empresa WITH =, id_parte WITH =, tipo_relacion WITH =, daterange(desde, hasta, '[]') WITH &&)
);
ALTER TABLE cys.documentos ADD COLUMN IF NOT EXISTS id_relacion bigint;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_relacion_fkey FOREIGN KEY (empresa, id_relacion) REFERENCES cys.relaciones_empresa (empresa, id);
ALTER TABLE cys.documentos DROP CONSTRAINT IF EXISTS documentos_una_ficha;
ALTER TABLE cys.documentos ADD CONSTRAINT documentos_una_ficha CHECK (num_nonnulls(id_parte, id_vehiculo, id_propiedad, id_relacion) = 1);
DELETE FROM cys.app_migraciones WHERE nombre = '003_sin_relaciones_empresa.sql';
