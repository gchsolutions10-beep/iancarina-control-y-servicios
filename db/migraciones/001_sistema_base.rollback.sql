-- Reversión de 001_sistema_base.sql. Borra las tablas del sistema base (¡pierde usuarios y bitácora!).
DROP TABLE IF EXISTS cys.app_ajustes;
DROP TABLE IF EXISTS cys.app_bitacora;
DROP FUNCTION IF EXISTS cys.app_bitacora_inmutable();
DROP TABLE IF EXISTS cys.app_usuario_permisos;
DROP TABLE IF EXISTS cys.app_usuario_empresas;
DROP TABLE IF EXISTS cys.app_usuario_roles;
DROP TABLE IF EXISTS cys.app_rol_permisos;
DROP TABLE IF EXISTS cys.app_roles;
DROP TABLE IF EXISTS cys.app_permisos;
DROP TABLE IF EXISTS cys.app_usuarios;
DROP TABLE IF EXISTS cys.app_empresas;
DELETE FROM cys.app_migraciones WHERE nombre = '001_sistema_base.sql';
