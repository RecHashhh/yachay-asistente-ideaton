-- Guías paso a paso de trámites, curadas del corpus con evidencia literal (cada paso tiene su cita y chunk).
-- Se responden sin modelo: cero tokens y cero redacción libre. Se cargan desde RAG_DIR/tramites.json (confidencial, fuera del repo).
CREATE TABLE IF NOT EXISTS procedures (
  id          text PRIMARY KEY,
  doc_id      text NOT NULL REFERENCES documents(id),
  locator     text NOT NULL DEFAULT '',
  periodo     text,
  triggers    text[] NOT NULL,          -- frases normalizadas (sin tildes) en es y en
  data        jsonb NOT NULL,           -- {es: {...}, en: {...}} con el formato de Procedure del frontend
  evidence    jsonb NOT NULL,           -- [{field, chunk_id, quote}]
  active      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
