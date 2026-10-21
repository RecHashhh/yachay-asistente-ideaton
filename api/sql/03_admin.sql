-- Sesiones del Portal: sobreviven a un reinicio del servidor. Se guarda el hash del token, nunca el token.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  text PRIMARY KEY,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_exp_idx ON admin_sessions (expires_at);

-- Bitácora de acciones del Portal (trazabilidad, ISO/IEC 42001): quién cambió la base de conocimiento y cuándo.
CREATE TABLE IF NOT EXISTS admin_audit (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  email   text NOT NULL,
  action  text NOT NULL,      -- login, login_fallido, logout, subir, reprocesar, retirar, filtro, tema, bandeja, caso_control, validacion
  target  text,
  ip      text
);
CREATE INDEX IF NOT EXISTS admin_audit_at_idx ON admin_audit (at DESC);
