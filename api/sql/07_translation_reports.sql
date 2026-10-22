-- Reportes explícitos, separados de conocimiento aprobado y del corpus institucional.
CREATE TABLE IF NOT EXISTS translation_reports (
    id varchar(36) PRIMARY KEY,
    message_id varchar(100) NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    fragment text NOT NULL,
    correction text NOT NULL DEFAULT '',
    status varchar(30) NOT NULL DEFAULT 'pending_review' CHECK (status = 'pending_review'),
    created_at timestamptz NOT NULL DEFAULT now()
);
