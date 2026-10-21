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
# Edita .env y agrega ANTHROPIC_API_KEY
docker compose up --build
```

En otra terminal:

```bash
cd web
npm install
npm run dev          # http://localhost:5180
```

- Chat público: `http://localhost:5180/`
- Widget incrustado en otra página (estilo Messenger): `http://localhost:5180/demo-sitio.html`
- Portal de administración: `http://localhost:5180/#/admin`. En modo de ejemplo entra cualquier correo `@yachaytech.edu.ec` con una contraseña de 4 caracteres o más.

`web/.env.local` conecta el chat a `http://localhost:8000`. Para usar el agente simulado, elimina ese archivo o deja `VITE_API_URL` vacío y reinicia Vite. Las sugerencias, tendencias, temas y administración siguen usando datos de ejemplo porque esos endpoints aún no existen en el backend; esos datos **no son información oficial**.

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
| "No sé" explícito con la dependencia de contacto; rechazo de preguntas fuera del dominio | `ProcedureCard.tsx` → `UnknownCard` |
| Español e inglés con selector y detección automática; saludo en kichwa (beta, por validar) | `src/lib/i18n.ts` |
| Mascota animada: parpadea, piensa y habla según el estado | `src/components/Mascot.tsx` |
| Texto que aparece palabra por palabra al estilo Claude, y estado "Buscando en los documentos…" con brillo | `src/components/Markdown.tsx`, `.shimmer` en `styles.css` |
| Mapa del campus con flecha y círculos: aulas, laboratorios, salas de estudio, residencias, representación estudiantil | `src/components/CampusMap.tsx`, `src/lib/campus.ts` |
| Aviso de uso de datos y "Cómo funciona" (bilingües) | `src/components/ConsentDialog.tsx`, `Chat.tsx` → `AboutDialog` |
| Portal: documentos, subir con metadatos, nueva versión, temas, tendencias | `src/views/Admin.tsx` |
| Portal → **Validación**: set de preguntas de control y métricas (exactitud, citación correcta, "no sé" correcto, alucinaciones, ES/EN, latencia p50/p95) | `src/views/AdminExtras.tsx`, `controlSet` en `mock.ts` |
| Portal → **Costo**: calculadora con supuestos explícitos, fórmula paso a paso y escenarios de carga | `src/views/AdminExtras.tsx` |
| Widget para otras páginas | `public/yachi-widget.js`, `public/demo-sitio.html` |
| Contrato con el backend | `src/lib/types.ts`, `src/lib/api.ts` |

## Cobertura de la rúbrica del reto

| Criterio | Dónde se ve en el prototipo | Falta (fuera del frontend) |
|---|---|---|
| Calidad técnica | Prototipo navegable, trámites paso a paso, representación, ubicaciones, widget | Backend real con los documentos del Día 1; repositorio público en GitHub |
| Mitigación de alucinaciones | Fuente con versión, fecha y fragmento citado; "no sé" con contacto; pestaña Validación | Correr el set de control (≥100 preguntas) contra el modelo real |
| UX y bilingüismo | Sin instrucciones previas, ES/EN con detección, voz, adjuntos, accesible por teclado, movimiento reducido | Validar kichwa con un hablante nativo |
| Costo computacional | Pestaña Costo con fórmula, supuestos y escenarios | Cotización real del servidor |
| Uso documentado de IA | `docs/DECLARACION-IA.md` (plantilla) y aviso en "Cómo funciona" | Completar la declaración |
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

La configuración de los modelos está en `.env.example`: Ollama usa `bge-m3` para embeddings de 1024 dimensiones y Anthropic usa Haiku para redactar respuestas. `OLLAMA_EMBEDDING_MODEL` se puede cambiar por otro modelo compatible de 1024 dimensiones; si se cambia, la carga vuelve a calcular los vectores. Las claves de Anthropic no deben guardarse en Git.

El frontend ya conecta el chat con `/chat` mediante `VITE_API_URL=http://localhost:8000` en `web/.env.local`. El CORS del backend permite los orígenes locales de Vite. `/health` se puede consultar para verificar que la base y el índice estén disponibles. Las preguntas y respuestas usan el agente real; las tarjetas de sugerencias, tendencias, temas y el portal de administración siguen siendo de ejemplo.

`fecha_consulta` se conserva como metadato de la fuente y no se presenta como fecha de publicación. El historial se procesa en la petición, sin almacenarse en PostgreSQL. Esta etapa no incluye adjuntos, autenticación, administración de documentos, tendencias, temas ni feedback.
