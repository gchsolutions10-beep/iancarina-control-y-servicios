-- Reversión de 008_recorridos.sql (solo preferencias: no hay datos de negocio).
DROP TABLE IF EXISTS cys.app_recorridos_vistos;
DELETE FROM cys.app_migraciones WHERE nombre = '008_recorridos.sql';
