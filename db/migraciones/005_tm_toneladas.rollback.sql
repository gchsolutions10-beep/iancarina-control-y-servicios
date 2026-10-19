-- Reversión de 005: TM vuelve a texto (conserva el número como texto).
ALTER TABLE cys.vehiculos DROP CONSTRAINT IF EXISTS vehiculos_tm;
ALTER TABLE cys.vehiculos ALTER COLUMN tm TYPE varchar(40) USING tm::text;
COMMENT ON COLUMN cys.vehiculos.tm IS NULL;
DELETE FROM cys.app_migraciones WHERE nombre = '005_tm_toneladas.sql';
