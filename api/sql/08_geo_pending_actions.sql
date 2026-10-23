-- Estado breve de aclaraciones geográficas. El contenido solo incluye nombres y candidatos del mapa.
CREATE TABLE IF NOT EXISTS geo_pending_actions (
  session_id  text PRIMARY KEY,
  state       jsonb NOT NULL,
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_pending_actions_expiry_idx
  ON geo_pending_actions (expires_at);
