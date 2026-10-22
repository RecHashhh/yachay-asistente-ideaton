# Yachi — backend (RAG)

## Reconocimiento de voz Kichwa (experimental)

Instala, desde `api/`, ` .venv\Scripts\python -m pip install -r requirements-speech.txt`
y ejecuta `.venv\Scripts\python scripts/install_killkan.py`. Reinicia la API habitual;
no se necesita otro servidor. El modelo pesa aproximadamente 1,3 GB y se descarga una vez
en `api/models/` (fuera de Git). La primera transcripción carga el modelo en RAM;
en CPU puede tardar. Consulta `/speech/capabilities` para comprobar la instalación.

El micrófono en Kichwa captura hasta 15 segundos y llama a `/speech/transcribe`
con WAV PCM16 mono a 16 kHz. Devuelve un borrador editable antes de enviar la consulta.
El servidor no guarda audio ni entrena con él. ES/EN conservan el reconocimiento del navegador.
La transcripción no traduce ni acredita la exactitud de la respuesta institucional.

Créditos: Chihiro Taguchi, Jefferson Saransig, Dayana Velásquez y David Chiang,
[Killkan-ASR](https://huggingface.co/ctaguchi/killkan_asr), CC BY 4.0,
revisión `2d00fbbb610ea6f7579d3a008cfe6aa4fbb95251`.
[Dataset Killkan](https://huggingface.co/datasets/ctaguchi/killkan) y
[artículo](https://arxiv.org/abs/2404.15501).
La integración de audio y la interfaz de Yachi son adaptaciones; el modelo se usa sin reentrenar.
No se incorporan sus conversaciones de radio como fuentes universitarias.
Para redistribuir grabaciones originales consulta también la atribución y licencia de sus autores.

## Lectura en voz Kichwa (experimental)

Con las dependencias opcionales anteriores, ejecuta desde `api/`:
`.venv\Scripts\python scripts/install_kichwa_tts.py` y reinicia la API.
Descarga una voz de 145 MB; no requiere clave de pago ni una voz instalada en Windows.
`POST /speech/synthesize` recibe `{"text":"Imanalla"}` (máximo 400 caracteres)
y devuelve WAV mono PCM16. La interfaz divide las respuestas largas, permite detener
la reproducción y conserva la velocidad elegida. No se guardan los textos ni los audios
de estas peticiones. En modo voz aparece «Probar voz Kichwa».

Modelo de Meta: [MMS-TTS quw](https://huggingface.co/facebook/mms-tts-quw),
variante ecuatoriana de Tena, revisión `110330c764f39caf92839747412afcb98a0c8f79`.
Licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): uso no comercial
y atribución. Los pesos permanecen fuera de Git. La integración de Yachi adapta el
transporte y la reproducción; no modifica ni reentrena los pesos de Meta.
Es una voz sintética experimental: su pronunciación debe revisarse con hablantes y
puede diferir del Kichwa de Imbabura. No usarla como prueba de corrección de la traducción.

FastAPI + LangGraph + PostgreSQL + Claude Haiku 5.5. Usa el corpus que preparó el equipo (`docs/rag/rag/`, **confidencial, fuera del repositorio**).

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

Tablas añadidas después: `filter_terms` (filtros editables, `sql/02_filtros.sql`), `admin_sessions` y `admin_audit` (`sql/03_admin.sql`) y `procedures` (guías de trámite, `sql/04_tramites.sql`). `python -m app.migrate` aplica todos los `sql/0[1-9]_*.sql` en orden (el `00_` lo corre el superusuario una vez).

## Documentos subidos desde el Portal

`app/processing.py` convierte PDF (tablas por posición, sin membretes repetidos), XLSX (celdas combinadas) y CSV a texto, lo parte en fragmentos de ≤ 800 tokens con la ruta de sección, calcula embeddings y lo indexa en segundo plano. El documento pasa de `procesando` a `indexado`, o a `error` con el motivo (p. ej. PDF escaneado sin texto). Al reemplazar una versión, la anterior sigue respondiendo hasta que la nueva queda indexada.

## Seguridad del Portal

- Prototipo: correos de `ADMIN_EMAILS` y `ADMIN_PASSWORD` (mínimo 12 caracteres; si es más corta, el Portal no deja entrar).
- Sesiones en PostgreSQL: se guarda el hash SHA-256 del token, duran 8 h y `POST /admin/logout` las invalida en el servidor.
- Tras 5 intentos fallidos por IP en 15 min (o 10 por correo en 1 h) el login responde 429; los aciertos no cuentan.
- Bitácora `admin_audit` (2 años): inicios de sesión, subidas, reemplazos, retiros, filtros, temas, bandeja y casos de control. `GET /admin/audit` muestra las últimas 200 acciones.
- **Producción: Microsoft Entra ID** con el tenant de la universidad (OpenID Connect). El frontend obtiene el token con MSAL y el backend valida firma, emisor, audiencia y un grupo de seguridad «Yachi-Administradores» en `admin()`; así se eliminan `ADMIN_PASSWORD`, el bloqueo propio y la gestión de contraseñas, y se hereda el MFA institucional. La bitácora se mantiene igual.
