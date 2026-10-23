-- Uso real del modelo (Claude): tokens y costo de cada llamada, para el tope de gasto y la pestaña Costo del Portal.
CREATE TABLE IF NOT EXISTS llm_usage (
  id             bigserial PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL,              -- redaccion (respuesta al estudiante) | agente (elegir documentos y términos)
  model          text NOT NULL,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  cache_tokens   integer NOT NULL DEFAULT 0, -- lecturas de caché del prompt
  cost_usd       numeric(12,6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS llm_usage_at_idx ON llm_usage (at);
