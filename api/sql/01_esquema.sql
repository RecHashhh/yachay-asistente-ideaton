-- Esquema de Yachi. Idempotente: se puede ejecutar varias veces (lo aplica `python -m app.migrate`).

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector (instalado por scripts/crear_base.ps1)

-- Búsqueda de texto en español sin tildes: "matricula" encuentra "matrícula".
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'es_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION es_unaccent ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS topics (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  name_en        text,
  description_en text
);

CREATE TABLE IF NOT EXISTS documents (
  id             text PRIMARY KEY,
  title          text NOT NULL,
  tipo           text NOT NULL,                 -- reglamento, procedimiento, calendario, pagina_web…
  topic_id       text REFERENCES topics(id),
  audiencia      text NOT NULL DEFAULT 'estudiantes' CHECK (audiencia IN ('estudiantes', 'general', 'personal')),
  version        text NOT NULL DEFAULT 'vigente',
  periodo        text,                          -- p. ej. 2026SEM02: la información caduca con el período
  fecha_consulta date,                          -- cuándo se descargó la fuente
  url            text,
  acceso         text NOT NULL DEFAULT 'publico' CHECK (acceso IN ('publico', 'institucional', 'interno')),
  kind           text NOT NULL DEFAULT 'pdf',
  status         text NOT NULL DEFAULT 'indexado' CHECK (status IN ('procesando', 'indexado', 'error', 'retirado')),
  is_current     boolean NOT NULL DEFAULT true, -- solo los vigentes se usan para responder
  replaces       text REFERENCES documents(id),
  uploaded_by    text NOT NULL DEFAULT 'corpus',
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  size_kb        integer NOT NULL DEFAULT 0,
  notes          text
);

CREATE TABLE IF NOT EXISTS chunks (
  id        text PRIMARY KEY,
  doc_id    text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord       integer NOT NULL,
  seccion   text NOT NULL DEFAULT '',
  texto     text NOT NULL,
  tokens    integer NOT NULL DEFAULT 0,
  tsv       tsvector GENERATED ALWAYS AS (to_tsvector('es_unaccent', coalesce(seccion, '') || ' ' || texto)) STORED,
  -- Vector del modelo de embeddings multilingüe (384 dimensiones), con índice HNSW por similitud coseno.
  embedding vector(384)
);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks (doc_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Lugares con coordenadas reales (puntos importantes y zonas de aulas).
CREATE TABLE IF NOT EXISTS places (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  name_en   text,
  uso       text,
  horario   text,
  lat       double precision NOT NULL,
  lon       double precision NOT NULL,
  maps_url  text,
  aliases   text[] NOT NULL DEFAULT '{}',
  fuente    text NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  code      text PRIMARY KEY,                  -- A13, B101, JBY1…
  zona      text NOT NULL,
  ubicacion text NOT NULL,
  place_id  text REFERENCES places(id),
  lat       double precision,
  lon       double precision,
  -- Varias aulas comparten la misma coordenada en la fuente: la ubicación es de la zona, no del aula exacta.
  coord_compartida boolean NOT NULL DEFAULT false
);

-- Historial anónimo: sin IP ni datos personales (el texto ya llega sin cédulas ni correos).
CREATE TABLE IF NOT EXISTS messages (
  id          text PRIMARY KEY,
  session_id  text NOT NULL,
  question    text NOT NULL,
  lang        text NOT NULL,
  kind        text NOT NULL,                    -- respuesta, sin_fuente, fuera_de_dominio, aclaracion, lugar, saludo, cierre, respeto, vacio, error
  doc_ids     text[] NOT NULL DEFAULT '{}',
  latency_ms  integer,
  tokens_in   integer,
  tokens_out  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id          bigserial PRIMARY KEY,
  message_id  text,
  vote        text NOT NULL CHECK (vote IN ('up', 'down')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unanswered (
  id          text PRIMARY KEY,
  q           text NOT NULL,
  q_norm      text NOT NULL,
  lang        text NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('sin_fuente', 'fuera_de_dominio', 'voto_negativo')),
  count       integer NOT NULL DEFAULT 1,
  details     jsonb NOT NULL DEFAULT '{}',
  first_at    timestamptz NOT NULL DEFAULT now(),
  last_at     timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'convertida', 'descartada')),
  control_id  text,
  UNIQUE (q_norm, reason)
);

CREATE TABLE IF NOT EXISTS inquiries (
  code        text PRIMARY KEY,
  office      text NOT NULL,
  email       text NOT NULL,
  question    text NOT NULL,
  lang        text NOT NULL,
  transcript  text,
  status      text NOT NULL DEFAULT 'recibida',
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- LOPDP: el correo solo se conserva mientras se atiende la consulta.
  delete_after timestamptz NOT NULL DEFAULT now() + interval '90 days'
);

CREATE TABLE IF NOT EXISTS control_cases (
  id          text PRIMARY KEY,
  q           text NOT NULL,
  lang        text NOT NULL,
  expect      text NOT NULL,                    -- id de documento, 'no_se', 'aclaracion' o 'lugar'
  source      text NOT NULL DEFAULT 'equipo',   -- equipo, bandeja, csv
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_runs (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  model       text NOT NULL,
  metrics     jsonb NOT NULL,
  results     jsonb NOT NULL
);
