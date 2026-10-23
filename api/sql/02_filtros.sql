-- Filtros del chat editables desde el Portal (ver app/filters.py). Se siembran con DEFAULT_TERMS al migrar.
CREATE TABLE IF NOT EXISTS filter_terms (
  category    text NOT NULL CHECK (category IN ('crisis', 'denuncia', 'manipulacion', 'salud', 'profanidad', 'fuera_de_dominio', 'permitido')),
  term        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  note        text,
  updated_by  text NOT NULL DEFAULT 'semilla',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category, term)
);

-- Bandeja: respuestas con cifras, correos o enlaces que no están en los fragmentos citados.
ALTER TABLE unanswered DROP CONSTRAINT IF EXISTS unanswered_reason_check;
ALTER TABLE unanswered ADD CONSTRAINT unanswered_reason_check CHECK (reason IN ('sin_fuente', 'fuera_de_dominio', 'voto_negativo', 'no_verificada'));
