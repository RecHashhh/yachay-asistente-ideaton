# Yachi — backend (RAG)

FastAPI + LangGraph + PostgreSQL + Claude Haiku 5.5. Usa el corpus que preparó el equipo (`docs/fuentes/rag/`, **confidencial, fuera del repositorio**).

## Puesta en marcha (Windows, PostgreSQL 18 local)

```powershell
cd api

# 1. Base de datos y usuario propios (una vez). Pide la contraseña del usuario "yachi".
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f sql/00_crear_base.sql

# 2. Configuración: copiar y completar (contraseña de la base, clave de Anthropic, contraseña del portal).
copy .env.example .env
notepad .env

# 3. Dependencias
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt

# 4. Esquema y carga del corpus (la primera vez descarga el modelo de embeddings, ~220 MB)
.venv\Scripts\python -m app.migrate
.venv\Scripts\python -m app.ingest

# 5. Servidor
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Frontend: en `web/.env` poner `VITE_API_URL=http://localhost:8000` y reiniciar `npm run dev`.

Sin `ANTHROPIC_API_KEY` el backend funciona en **modo extractivo**: busca y muestra el fragmento oficial más relevante, sin redactar. Sirve para probar la búsqueda sin costo.

## Cómo responde (graph.py)

1. **Ruta**: fuera de dominio → aviso; consulta ambigua → aclaración con opciones; aula o lugar → respuesta exacta desde los Excel (sin modelo); el resto → búsqueda.
2. **Búsqueda híbrida** (search.py): texto completo en PostgreSQL (`es_unaccent`, sin tildes) + vectores multilingües (ES↔EN), fusionados con RRF; prioridad a documentos para estudiantes; solo documentos vigentes.
3. **Umbral**: si nada es suficientemente relevante, responde "Sin información oficial" sin llamar al modelo.
4. **Claude Haiku 5.5** recibe solo los fragmentos marcados [F1]…[F5] y debe citarlos; si no alcanzan, responde `SIN_INFORMACION`.
5. **Citas armadas por el servidor** a partir de las marcas: el modelo nunca escribe títulos, versiones ni enlaces.
6. Se registra la consulta (anónima), y lo no respondido entra a la bandeja del portal.

## Tablas (sql/01_esquema.sql)

`documents` (versión, período, acceso público/institucional/interno, audiencia, vigente), `chunks` (texto + `tsvector` + embedding), `topics`, `places` y `rooms` (coordenadas reales), `messages` (anónimo), `feedback`, `unanswered` (bandeja), `inquiries` (consultas a dependencias; el correo se borra a los 90 días), `control_cases` y `validation_runs`.

En producción: PostgreSQL con **pgvector** (`embedding vector(384)` + índice HNSW) y la búsqueda vectorial pasa a SQL sin cambiar el resto.
