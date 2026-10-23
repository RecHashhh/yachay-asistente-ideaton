-- Mantiene las categorías de la tabla alineadas con FILTER_CATEGORIES y DEFAULT_TERMS.
-- 02_filtros.sql ya crea tablas nuevas con este conjunto; esta migración actualiza las existentes.
ALTER TABLE filter_terms DROP CONSTRAINT IF EXISTS filter_terms_category_check;
ALTER TABLE filter_terms
  ADD CONSTRAINT filter_terms_category_check
  CHECK (category IN ('crisis', 'denuncia', 'manipulacion', 'salud', 'profanidad', 'fuera_de_dominio', 'permitido'));
