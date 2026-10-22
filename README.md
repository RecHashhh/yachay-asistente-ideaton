# Asistente institucional Yachay Tech

Prototipo del chatbot público de la universidad. Responde con documentos fuente, cita su período de vigencia y sección, y puede marcar lugares en el mapa del campus.

```
IDEATHON/
  web/   Frontend React + Vite + motion (este paso)
  api/   Backend FastAPI + LangChain/LangGraph
  rag/   Corpus Markdown y fragmentos para el índice RAG
```

## Correr el frontend

Para preguntar al agente RAG, configura el frontend y levanta el backend en terminales separadas:

```bash
cp web/.env.example web/.env.local
cp .env.example .env
# Edita .env: ADMIN_EMAILS/ADMIN_PASSWORD (≥ 12) y, para el agente, ANTHROPIC_API_KEY.
# Copia el corpus autorizado (confidencial, no está en el repo) a ./rag
docker compose up --build
```

Sin Docker: ver `api/README.md` (PostgreSQL 18 + pgvector local, `python -m app.migrate`, `python -m app.ingest`, `uvicorn app.main:app`).

En otra terminal:

```bash
cd web
npm install
npm run dev          # http://localhost:5180
```

- Chat público: `http://localhost:5180/`
- **Modo voz directo** (para compartir con personas ciegas o con baja visión): `http://localhost:5180/#/voz`
- Widget incrustado en otra página (estilo Messenger): `http://localhost:5180/demo-sitio.html`
- Portal de administración: `http://localhost:5180/#/admin`. Con backend: los correos de `ADMIN_EMAILS` y `ADMIN_PASSWORD`. En el simulador entra cualquier correo `@yachaytech.edu.ec` con una contraseña de 4 caracteres o más.

`web/.env.local` conecta el frontend a `http://localhost:8000`: chat, tendencias, temas, guías, lugares, bandeja, filtros, validación y Portal usan el backend real. Sin `VITE_API_URL` todo funciona con el simulador (datos de ejemplo, **no son información oficial**).

## Arquitectura (integración del 22/10/2026)

Cada pregunta pasa por el grafo de Yachi (`api/app/graph.py`) y, solo si hace falta buscar, por el agente:

1. **Triage sin modelo** (`rules.py`, `filters.py`): datos personales ocultos, crisis (ECU 911 y Bienestar), acoso o violencia, insultos, manipulación, saludos, fuera del ámbito, Confesionario.
2. **Respuestas deterministas, sin modelo**: guías de trámite con citas verificadas (`procedures.py`), aulas y lugares con coordenadas oficiales y mapa real, aclaraciones.
3. **Búsqueda**:
   - *Con `ANTHROPIC_API_KEY`* (y `YACHI_AGENT=auto`): el **agente** (`agent.py`) lee el catálogo de documentos con sus descripciones (`rag/descripciones.csv`), elige en cuáles buscar, reformula con los términos del documento y puede buscar varias veces; consulta el índice de Yachi a través de `yachi_retriever.py`.
   - *Sin clave*: búsqueda híbrida directa (`search.py`): texto en español, cobertura de conceptos poco frecuentes, siglas exactas, glosario para preguntas en inglés y vectores multilingües, fusionados con RRF.
4. **Redacción con salvaguardas** (`generate`): solo con los fragmentos, citas armadas por el servidor, `SIN_INFORMACION` → "sin información oficial" con la oficina que corresponde, y verificación posterior de cifras, correos y enlaces. Sin clave se muestra el fragmento literal.

El panel de actividad del chat muestra los pasos reales (catálogo, búsquedas, documentos, verificación). La capa original del agente con Ollama/`bge-m3` y Alembic (`retrieval.py`, `models.py`, `seed.py`, `migrations/`) se conserva como perfil opcional `ollama` de `docker-compose`, en su propia base.

## Estado de entrega — 20 de octubre de 2026

Existe backend real además del simulador. Consulta `api/README.md` para instalarlo y preparar las tablas; los documentos fuente se suministran por un canal autorizado, no se incluyen en este repositorio público. Configura `web/.env` según `web/.env.example` para conectar la API. En desarrollo, Vite utiliza un proxy local; en producción se requiere configurar el origen permitido o un proxy equivalente.

El código no equivale a un despliegue en producción. Sin credenciales del proveedor, las rutas extractivas permiten consultar fuentes pero no demuestran generación bilingüe completa. La autenticación de ejemplo descrita arriba solo corresponde al modo simulador.

La importación CSV de Validación usa ahora GET/PUT autenticados del backend. Los errores de evaluación y feedback permiten reintentar sin confirmar un guardado fallido. El análisis de archivos del usuario está deshabilitado mientras no exista esa capacidad; la carga de documentos institucionales del administrador es una función distinta y se mantiene. Las consultas a oficinas se registran sin prometer notificaciones ni respuestas automáticas.

Objetivos, límites y evidencia: [informe de rúbrica](docs/INFORME-RUBRICA.md). Las autoevaluaciones antiguas y métricas del simulador no certifican resultados reales. Las capturas locales que reproduzcan contenido institucional se excluyen de nuevas publicaciones.

La nueva sección **Consultas** del portal permite al personal autorizado revisar las últimas 100 consultas vigentes y marcar su estado. Requiere aplicar las migraciones (`cd api; python -m app.migrate` con el entorno virtual activo). El contacto es manual: no envía correos. Comparación documentada, guion de pitch y límites: [revisión de entrega](docs/entrega/revision.html). [Borrador IEEE en LaTeX](docs/entrega/paper.tex), pendiente de autores y resultados reales.

### Comprobaciones reproducibles

```powershell
npm --prefix web run build
# Desde api, con dependencias instaladas y configuración local válida:
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Para la regresión visual, instalar Playwright en `web` (`npm --prefix web install --no-save playwright`) y disponer de Chrome. Con Vite ejecutándose en el puerto 5180 y `VITE_API_URL` configurado para activar el contrato de API: `node scripts/verificar-entrega.cjs` desde la raíz. Se interceptan las peticiones para probar fallos y reintentos con datos sintéticos; no acredita la base de datos real. Se puede usar `AUDIT_URL` para otro puerto y `PLAYWRIGHT_MODULE` para una instalación existente de Playwright.

La comprobación opcional `api/tests/verify_postgres.py`, ejecutada desde `api` con el entorno virtual, usa exclusivamente una tabla temporal de PostgreSQL: verifica guardado y rollback completo si falla una fila durante el reemplazo. Requiere una base configurada con el esquema, pero no modifica el set persistente de la aplicación.

### Utilidad: guías, preparación y seguimiento

`/#/guias` permite buscar las guías respaldadas por el corpus y filtrar las listas personales pendientes. También se accede desde la barra lateral del chat. Documentos y pasos se pueden marcar; se indica qué falta preparar, se conservan las marcas en este navegador y se comparten entre idiomas. Una revisión distinta de la guía reinicia las marcas para evitar trasladar la preparación a instrucciones modificadas. Revocar el consentimiento borra también estas listas locales.

Cada guía se puede copiar o descargar con sus fuentes. Las fechas vencidas no ofrecen «Añadir al calendario»; la exportación ICS valida fechas y respeta las líneas UTF-8 del formato. Los enlaces y contactos solo se cargan si tienen respaldo literal. Los datos no especificados por la fuente se señalan explícitamente. Marcar una lista no tramita, envía ni aprueba una solicitud.

El backend ofrece `GET /procedures?lang=es|en`; vuelve a comprobar que las fuentes estén activas y las citas sigan disponibles. Las preguntas de seguimiento reconocibles, como «¿y los documentos?» o «¿cuánto tarda?», conservan el trámite y responden al campo solicitado. Una consulta de otro tema o de otro período no debe reutilizar automáticamente la guía anterior. Los mapas con coordenadas reales tienen prioridad sobre el plano esquemático del simulador.

En la base local se han curado nueve guías, incluyendo residencias y participación/FEYT. Su contenido y las citas permanecen en el corpus autorizado, excluido del repositorio público. Para otro entorno, cargar el corpus y ejecutar `python -m app.procedures` con un `RAG_DIR/tramites.json` autorizado. El verificador exige evidencia de resumen, dependencia, documentos y pasos; verifica literalmente contactos/enlaces y la estructura ES/EN. No sustituye la revisión semántica humana.

Prueba de interfaz: `node scripts/verificar-utilidad.cjs`, con los mismos requisitos de Playwright de arriba y datos sintéticos. Comprobación opcional de lectura real: `api/tests/verify_guides_live.py` desde `api`; verifica las guías del corpus local y el enrutamiento ES/EN, sin invocar al modelo ni registrar consultas. Las fechas de las convocatorias históricas no se actualizan por inferencia.

## Incrustar el asistente en cualquier página

```html
<script src="https://ASISTENTE/yachi-widget.js" data-lang="es" defer></script>
```

Aparece un botón con la mascota abajo a la derecha; al tocarlo se abre un chat compacto (`#/embed`) dentro de un iframe, así la página anfitriona no ve ni altera la conversación. El iframe se carga recién cuando alguien lo abre. En el celular ocupa toda la pantalla.

## Qué hay en el frontend

| Pieza | Archivo |
|---|---|
| Chat estilo Gemini: saludo, sugerencias por tendencia, respuestas que se escriben en vivo, fuentes, votos, reintento y latencia | `src/views/Chat.tsx` |
| Composer (igual que el Help Desk de RIPCON): dictado por voz, adjuntar imagen o PDF, capturar pantalla, pegar con Ctrl+V y preguntas parecidas mientras escribes | `src/components/Composer.tsx` |
| Guía paso a paso de cada trámite: qué es, qué documentos, pasos en orden (se pueden marcar), responsable, tiempo y lugar | `src/components/ProcedureCard.tsx` |
| Respuesta "Sin información oficial sobre este tema" con la dependencia de contacto; "Consulta fuera del ámbito institucional" para preguntas ajenas | `ProcedureCard.tsx` → `UnknownCard` |
| Español e inglés con selector y detección automática, incluidos temas, oficinas y lugares del mapa; saludo en kichwa (beta, por validar) | `src/lib/i18n.ts` |
| Mascota animada: parpadea, piensa y habla según el estado | `src/components/Mascot.tsx` |
| Texto que aparece palabra por palabra al estilo Claude, y estado "Buscando en los documentos…" con pulso | `src/components/Markdown.tsx`, `.working` en `styles.css` |
| Mapa del campus con flecha y círculos: aulas, laboratorios, salas de estudio, residencias, representación estudiantil | `src/components/CampusMap.tsx`, `src/lib/campus.ts` |
| Conversaciones: título automático según lo consultado, renombrar y eliminar (menú «⋯», con deshacer), agrupadas por fecha; sugerencias «para continuar» según tus consultas | `src/components/ChatList.tsx`, `Chat.tsx` |
| **Aclaraciones** ante consultas ambiguas, **motivo del 👎** (llega a la bandeja), **hablar con una persona** con la conversación adjunta, **bienvenida de 3 pasos** y **añadir al calendario** (.ics) en trámites con plazo | `components/Feedback.tsx`, `ProcedureCard.tsx`, `ConsentDialog.tsx`, `lib/ics.ts` |
| **Modo voz** manos libres (enlace `#/voz` o botón «Voz»): reconocimiento y síntesis del navegador con la mejor voz disponible, interrupción, comandos («siguiente», «anterior», «repetir», «todos los pasos», «uno/dos», «ayuda», «más despacio», «salir»), mapa descrito en palabras, fuentes leídas, datos personales omitidos, sonidos de estado y atajos de teclado; «Escuchar respuesta» en cada respuesta | `components/VoiceMode.tsx`, `lib/speech.ts` |
| Aviso antes de enviar datos personales (cédula, teléfono, correo): se pueden quitar antes de enviar | `Chat.tsx` |
| **Abrir documento** desde cada fuente citada (en PDF, directo en la página) | `Chat.tsx`, `ProcedureCard.tsx` |
| Aviso de privacidad con lo que exige el art. 12 de la LOPDP (Ecuador), divulgación de que es una IA, revocar consentimiento y borrar datos del navegador; "Cómo funciona" (bilingües) | `src/components/ConsentDialog.tsx`, `Chat.tsx` → `AboutDialog` |
| Portal: documentos, subir con metadatos, nueva versión, temas, tendencias | `src/views/Admin.tsx` |
| Portal → **Sin respuesta**: bandeja de preguntas sin fuente, fuera del ámbito o con 👎, agrupadas con conteo; convertir en pregunta de control o subir el documento que falta | `src/views/AdminExtras.tsx` → `Inbox`, `src/lib/inbox.ts` |
| Botón **Enviar consulta a la dependencia** en la respuesta sin información: correo, pregunta y autorización (LOPDP); devuelve código de seguimiento | `ProcedureCard.tsx` → `InquiryForm` |
| Portal → **Validación**: set de preguntas de control y métricas (exactitud, citación correcta, "sin información" correcto, alucinaciones; importar el set y exportar resultados en CSV, ES/EN, latencia p50/p95) | `src/views/AdminExtras.tsx`, `controlSet` en `mock.ts` |
| Portal → **Costo**: calculadora con supuestos explícitos, fórmula paso a paso y escenarios de carga | `src/views/AdminExtras.tsx` |
| Widget para otras páginas | `public/yachi-widget.js`, `public/demo-sitio.html` |
| Contrato con el backend | `src/lib/types.ts`, `src/lib/api.ts` |

## Cobertura de la rúbrica del reto

Detalle por criterio, evidencia y guion del pitch: [docs/INFORME-RUBRICA.md](docs/INFORME-RUBRICA.md).

| Criterio | Dónde se ve en el prototipo | Falta (fuera del frontend) |
|---|---|---|
| Calidad técnica | Prototipo navegable, trámites paso a paso, representación, ubicaciones, widget, repositorio público | Backend real con los documentos del Día 1 |
| Mitigación de alucinaciones | Fuente con versión, fecha, fragmento citado y enlace al original; "sin información oficial" con contacto; pestaña Validación con importar/exportar CSV | Correr el set de control (≥100 preguntas) contra el modelo real |
| UX y bilingüismo | Sin instrucciones previas, ES/EN con detección, voz, adjuntos; WCAG 2.2 AA verificado con axe-core (0 violaciones), teclado, lector de pantalla, movimiento reducido | Traducir `docs/kichwa-traduccion.csv` con un hablante nativo de kichwa ecuatoriano |
| Costo computacional | Pestaña Costo con fórmula, supuestos y escenarios | Cotización real del servidor |
| Uso documentado de IA | `docs/DECLARACION-IA.md` y aviso en "Cómo funciona" | Completar las filas del equipo (paper, pitch, revisores) |
| Rigor científico y pitch | — | Paper IEEE y presentación |

**Provisional, falta reemplazar:** el nombre y el arte de la mascota (`src/config.ts`, `Mascot.tsx`), el SVG oficial del campus (`CampusMap.tsx` → `CampusBase`, y las coordenadas en `campus.ts`) y el texto legal del aviso de datos.

## Contrato con el backend

El backend implementa `POST /chat` y `GET /health`. El chat envía el texto, idioma e historial reciente al agente y consume la respuesta SSE. El resto de las funciones listadas abajo permanece en el simulador del frontend.

| Método | Ruta | Uso |
|---|---|---|
| POST | `/chat` | `ChatRequest` → `text/event-stream` (`status`, `token`, `unknown`, `sources`, `suggestions`, `done`, `error`) |
| GET | `/health` | Estado de PostgreSQL y conteo de documentos y fragmentos indexados |

## Backend RAG con Docker Compose

El Compose levanta PostgreSQL 17 con pgvector, el servicio de carga inicial y la API. El frontend no está dentro de Compose.

1. Copia el archivo de entorno y configura las claves:

```bash
cp .env.example .env
# Edita .env: ANTHROPIC_API_KEY
```

2. Construye y arranca los servicios:

```bash
docker compose up --build
```

Compose levanta Ollama y descarga el modelo de embeddings al volumen persistente `ollama_data`. Después, el servicio `seed` aplica las migraciones y sincroniza `rag/chunks.jsonl`, `rag/fuentes.csv` y `rag/descripciones.csv`. Guarda un resumen por documento en `documents.description` y genera embeddings locales para fragmentos nuevos o modificados; una segunda ejecución sin cambios no vuelve a generarlos. La base de datos conserva sus datos en el volumen `postgres_data`.

Ollama reserva una GPU NVIDIA para calcular embeddings. El host debe tener un driver NVIDIA activo y NVIDIA Container Toolkit configurado para Docker; Compose pasa una GPU al contenedor de Ollama.

```bash
docker compose run --rm seed  # volver a sincronizar el corpus
docker compose down           # detener servicios, conservar datos
docker compose down -v        # eliminar también la base local
```

API: `http://localhost:8000`; salud: `http://localhost:8000/health`. PostgreSQL se publica solo en `localhost:5432`. La búsqueda combina distancia coseno en pgvector y búsqueda textual PostgreSQL; LangGraph responde con hasta cuatro fragmentos. Sin fragmentos sobre el umbral de relevancia, emite `unknown`.

La configuración de los modelos está en `.env.example`: Ollama usa `bge-m3` para embeddings de 1024 dimensiones y Anthropic usa Claude Haiku 5.5 (`claude-haiku-5-5`) para redactar respuestas. `OLLAMA_EMBEDDING_MODEL` se puede cambiar por otro modelo compatible de 1024 dimensiones; si se cambia, la carga vuelve a calcular los vectores. Las claves de Anthropic no deben guardarse en Git.

El frontend ya conecta el chat con `/chat` mediante `VITE_API_URL=http://localhost:8000` en `web/.env.local`. El CORS del backend permite los orígenes locales de Vite. `/health` se puede consultar para verificar que la base y el índice estén disponibles. Las preguntas y respuestas usan el agente real; las tarjetas de sugerencias, tendencias, temas y el portal de administración siguen siendo de ejemplo.

`fecha_consulta` se conserva como metadato de la fuente y no se presenta como fecha de publicación. El historial se procesa en la petición, sin almacenarse en PostgreSQL. Esta etapa no incluye adjuntos, autenticación, administración de documentos, tendencias, temas ni feedback.
