-- Descripción de cada documento para el catálogo que consulta el agente antes de buscar
-- (elige en qué documentos buscar y con qué términos). Se carga desde rag/descripciones.csv al migrar.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
