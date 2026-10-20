-- Ejecutar UNA vez como superusuario (postgres):
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f api/sql/00_crear_base.sql
-- Pide la contraseña del nuevo usuario "yachi" (no queda escrita en ningún archivo).
-- Después, pon esa contraseña en api/.env (DATABASE_URL).

\prompt 'Contraseña para el nuevo usuario yachi: ' yachi_pwd

CREATE ROLE yachi LOGIN PASSWORD :'yachi_pwd';
CREATE DATABASE yachi OWNER yachi ENCODING 'UTF8' TEMPLATE template0;

\connect yachi
-- Extensiones de confianza: el dueño de la base puede usarlas, pero las creamos aquí para no depender de eso.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL ON SCHEMA public TO yachi;

\echo 'Listo: base "yachi" y usuario "yachi" creados.'
