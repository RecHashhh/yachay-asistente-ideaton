# Asistente institucional Yachay Tech

Chatbot público de la universidad. Responde con los documentos que cargan los administradores (PDF, XLSX, CSV), cita la fuente con su versión y su fecha, y puede marcar lugares en el mapa del campus.

```
IDEATHON/
  web/   Frontend React + Vite + motion (este paso)
  api/   Backend LangChain + LangGraph (siguiente paso)
```

## Correr el frontend

```bash
cd web
npm install
npm run dev          # http://localhost:5180
```

- Chat público: `http://localhost:5180/`
- Widget incrustado en otra página (estilo Messenger): `http://localhost:5180/demo-sitio.html`
- Portal de administración: `http://localhost:5180/#/admin`. En modo de ejemplo entra cualquier correo `@yachaytech.edu.ec` con una contraseña de 4 caracteres o más.

Si `VITE_API_URL` está vacío (ver `.env.example`), todo funciona con el simulador `web/src/lib/mock.ts`. Los datos de ejemplo **no son información oficial**.

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

| Método | Ruta | Uso |
|---|---|---|
| POST | `/chat` | `ChatRequest` → `text/event-stream` con `StreamEvent` (`status`, `token`, `tool`, `procedure`, `unknown`, `sources`, `suggestions`, `link`, `done`, `error`) |
| GET | `/trends` | Consultas más frecuentes de los últimos 7 días |
| GET | `/topics` | Temas consultables |
| POST | `/admin/login` | Devuelve un token. Sugerido: Microsoft Entra ID con el tenant de la universidad |
| GET/POST/DELETE | `/admin/docs` | Listar, subir (multipart con metadatos) y quitar documentos |
| POST | `/admin/topics` | Crear un tema |
| POST | `/inquiries` | Consulta enviada a la dependencia desde una respuesta sin información (`office`, `email`, `question`, `lang`) → código de seguimiento |
| POST | `/feedback` | Voto 👍/👎 de una respuesta; los 👎 entran a la bandeja |
| GET/PATCH | `/admin/unanswered` | Bandeja "Sin respuesta": preguntas sin fuente, fuera del ámbito o con 👎, agrupadas y con conteo; estado nuevo, convertida o descartada |
| POST | `/admin/validation/cases` | Agregar una pregunta de control (desde la bandeja o el CSV) |

## Backend propuesto (LangChain + LangGraph)

**Ingesta.** Cuando el administrador sube un archivo:
1. Se lee según el tipo: PDF con `PyPDFLoader` (una página por documento); XLSX y CSV fila por fila, convirtiendo cada fila en texto `columna: valor` con su hoja y número de fila.
2. Se parte en fragmentos de unos 800 tokens con 100 de traslape. Las tablas se parten por grupos de filas, nunca a mitad de fila.
3. Cada fragmento lleva los metadatos `doc_id`, `topic_id`, `version`, `doc_date`, `origin`, `url`, `locator` (página, hoja o fila) y `is_current`.
4. Al subir una versión nueva se marca `is_current=false` en la anterior. No se borra, para poder auditar.

**Consulta (grafo LangGraph):**
```
entrada → caché semántica ──(acierto)──────────────────────────→ respuesta
             └─(fallo)→ router de tema (modelo pequeño) → recuperación híbrida filtrada
                         → reordenar (top 4) → modelo de respuesta con herramienta
                           mostrar_en_mapa → stream SSE
```
- La recuperación filtra por `is_current=true` y por el tema que detecta el router, y combina BM25 con vectores.
- La herramienta `mostrar_en_mapa(destino, origen?, resaltar?)` solo acepta los `id` de `campus.ts`. El modelo nunca ve coordenadas.
- Si ningún fragmento pasa el umbral de relevancia, el asistente dice que no lo sabe en vez de inventar.

## Búsqueda híbrida (especificación para el backend)

Los reglamentos tienen numeración ("art. 42", "literal b") y siglas ("F-SG-03") que la búsqueda por vectores encuentra mal; la búsqueda por palabras clave las encuentra exacto, pero falla con sinónimos ("cambiarme de carrera" frente a "cambio de carrera"). Se combinan las dos:

1. **Fragmentación por estructura.** Los PDF se parten por artículo o sección (no por número fijo de caracteres); cada fragmento guarda su encabezado ("Art. 42 – Cambio de carrera"). Los XLSX/CSV, por grupos de filas con los nombres de columna.
2. **Dos índices en la misma base.** PostgreSQL con `pgvector` (embeddings multilingües, coseno) y búsqueda de texto completo (`tsvector` en español e inglés, o BM25 con `pg_search`). Ambos filtran por `is_current = true` y por el tema que detecta el router.
3. **Fusión por rango recíproco (RRF).** Se toman los 20 mejores de cada índice y se combinan con `score = Σ 1 / (60 + rango)`. No requiere calibrar pesos entre índices.
4. **Reordenamiento.** Un reordenador (cross-encoder multilingüe o el mismo Haiku con una instrucción corta) deja los 4 fragmentos que van al modelo.
5. **Umbral de "sin información".** Si el mejor fragmento reordenado no supera el umbral, no se llama al modelo de respuesta: se devuelve el evento `unknown` (más barato y sin riesgo de inventar).
6. **Citas armadas por el servidor.** El modelo solo devuelve el `id` del fragmento que usa; el backend completa documento, versión, fecha, página y enlace. Una cita inventada es imposible por construcción.

Para el paper: correr el set de control con tres modos (solo vectores, solo palabras clave, híbrido) y reportar exactitud y citación correcta de cada uno en la pestaña Validación.

## Estrategias para gastar menos tokens

1. **Caché semántica.** Si una pregunta nueva es casi igual a una ya respondida (similitud mayor a 0.95, con el mismo tema y la misma versión de los documentos), se devuelve la respuesta guardada sin llamar al modelo. Las preguntas de las tendencias son las que más se repiten.
2. **Caché de prompt.** El prompt de sistema, la lista de lugares y la definición de la herramienta van primero y no cambian, así se cachean y cuestan una fracción del precio en cada llamada.
3. **Router barato.** Un modelo pequeño (Haiku) clasifica el tema y descarta saludos y preguntas fuera de alcance. El modelo grande solo responde cuando hay contexto útil.
4. **Pocos fragmentos y buenos.** Se recuperan unos 20 y el reordenador se queda con 4, en vez de mandar 10 o más al modelo.
5. **Historial corto.** El frontend envía solo los últimos 6 turnos (`HISTORY_TURNS` en `Chat.tsx`). El backend resume lo anterior en 2 o 3 líneas.
6. **Tablas precalculadas.** Las preguntas de valores exactos (aranceles, horarios) se responden con una búsqueda estructurada sobre el CSV o XLSX, no metiendo la tabla completa en el prompt.
7. **Límite de salida.** `max_tokens` de unos 600 y la instrucción de responder breve y con listas.
8. **Sugerencias sin modelo.** Las preguntas de seguimiento salen de las tendencias del mismo tema, no de otra llamada al modelo.
