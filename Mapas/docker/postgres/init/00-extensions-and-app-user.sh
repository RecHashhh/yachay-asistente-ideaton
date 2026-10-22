#!/bin/bash
set -euo pipefail

APP_USER="${APP_DB_USER:-yachay_app}"
APP_PASSWORD="${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
TEST_DB="${TEST_DB_NAME:-yachay_maps_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v app_user="$APP_USER" -v app_password="$APP_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE ' || quote_ident(:'app_user') || ' LOGIN PASSWORD ' || quote_literal(:'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')\gexec
ALTER ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v app_user="$APP_USER" -v test_db="$TEST_DB" <<'SQL'
SELECT 'CREATE DATABASE ' || quote_ident(:'test_db') || ' OWNER ' || quote_ident(:'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')\gexec
GRANT ALL PRIVILEGES ON DATABASE :"test_db" TO :"app_user";
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$TEST_DB" \
    -v app_user="$APP_USER" <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
