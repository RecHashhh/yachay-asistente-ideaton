-- Gestión humana de las consultas registradas. No envía correos automáticamente.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nueva';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries (status, created_at DESC);
