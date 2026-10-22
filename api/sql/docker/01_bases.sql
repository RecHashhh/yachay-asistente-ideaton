-- Solo en el primer arranque del contenedor de PostgreSQL: base aparte para la capa Ollama/Alembic original (perfil "ollama").
-- Su tabla `documents` tiene otro esquema que la de Yachi; por eso no comparten base.
CREATE DATABASE yachay_rag;
