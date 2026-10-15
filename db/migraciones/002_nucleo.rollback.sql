-- Reversión de 002_nucleo.sql (¡borra personas, activos y documentos!). Los archivos en Blob o
-- en la carpeta compartida no se borran.
DROP TABLE IF EXISTS cys.documentos;
DROP TABLE IF EXISTS cys.titularidades;
DROP TABLE IF EXISTS cys.propiedades;
DROP TABLE IF EXISTS cys.vehiculos;
DROP TABLE IF EXISTS cys.relaciones_empresa;
DROP TABLE IF EXISTS cys.partes;
DROP TABLE IF EXISTS cys.archivos;
DROP TABLE IF EXISTS cys.modelos;
DROP TABLE IF EXISTS cys.marcas;
DROP TABLE IF EXISTS cys.catalogo_valores;
DROP FUNCTION IF EXISTS cys.normalizar_codigo(text);
DELETE FROM cys.app_ajustes WHERE clave = 'archivos.tamano_maximo_mb';
DELETE FROM cys.app_migraciones WHERE nombre = '002_nucleo.sql';
