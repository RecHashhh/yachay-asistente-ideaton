# Informe de avance frente a la rúbrica — Reto 1: Chatbot Institucional de Procedimientos

Documento de trabajo del equipo. Recorre cada criterio de la rúbrica (escala 1 a 4), dice qué pide el nivel 4, qué tiene hoy el prototipo, dónde verlo y qué falta. Sirve como base para el paper IEEE y el guion del pitch. Actualizarlo cada vez que se agregue algo.

- Repositorio: https://github.com/RecHashhh/yachay-asistente-ideaton
- Demo local: `cd web && npm install && npm run dev` → http://localhost:5180 (chat), `/#/admin` (portal; cualquier correo `@yachaytech.edu.ec` y contraseña de 4+ caracteres), `/demo-sitio.html` (widget).
- Estado de los datos: **contenido de ejemplo** hasta recibir los documentos del Día 1. Las métricas de este informe miden el simulador, no un modelo real.

| Criterio | Nivel estimado hoy | Qué lo sube a 4 |
|---|---|---|
| Rigor científico y metodológico | 1–2 (falta el paper) | Escribir el paper IEEE con este informe como base |
| Calidad técnica del prototipo | 3–4 | Cargar 10–15 trámites reales del Día 1 |
| Mitigación de alucinaciones y validación | 3 | Set de control amplio (≥100) corrido contra el modelo real |
| Experiencia de usuario y bilingüismo | 4 (kichwa parcial) | Kichwa validado por un hablante nativo |
| Análisis de costo computacional | 4 | Confirmar la cotización del servidor con TI |
| Uso documentado de IA | 3–4 | Completar las filas del equipo en la declaración |
| Calidad del pitch | — | Preparar y ensayar (guion al final) |

---

## 1. Mitigación de alucinaciones y validación de veracidad (secciones 8.2 y 9)

**Nivel 4 pide:** anclaje a fuentes, citación interna, restricción de dominio, manejo explícito de "no sé", set de control amplio y métricas de precisión que demuestren respuestas trazables a la fuente.

### 1.1 Defensa en capas

Ninguna técnica sola elimina las alucinaciones; se combinan nueve capas, cada una detiene un tipo de error distinto.

| # | Capa | Qué evita | Dónde se ve | Estado |
|---|---|---|---|---|
| 1 | **Restricción de dominio**: un clasificador previo descarta lo que no es de la universidad ("Consulta fuera del ámbito institucional") | Que el modelo opine de temas ajenos | Chat: pregunta "¿Qué clima hará mañana?" | Prototipo ✅ · backend: router con Haiku |
| 2 | **Preguntas de aclaración**: si la consulta es ambigua ("residencias", "labs", "matrícula"), el asistente pregunta con opciones antes de responder | Adivinar la intención y responder otra cosa | Chat: escribir "Residencias" | Prototipo ✅ |
| 3 | **Recuperación anclada a documentos vigentes** (RAG) con metadatos de tema, versión y fecha; solo `is_current = true` | Responder con versiones viejas o de memoria | README → Backend propuesto | Especificado · backend |
| 4 | **Búsqueda híbrida** (palabras clave + vectores con RRF) y fragmentos por artículo | No encontrar "art. 42" o "F-SG-03" y rellenar con texto inventado | README → Búsqueda híbrida | Especificado · backend |
| 5 | **Umbral de "sin información"**: si ningún fragmento supera el umbral, no se llama al modelo; se responde "Sin información oficial sobre este tema" con la dependencia de contacto | La alucinación clásica: inventar cuando no hay fuente | Chat: "¿Cuál es el sueldo del rector?" | Prototipo ✅ |
| 6 | **Citas armadas por el servidor**: el modelo solo devuelve el id del fragmento; el backend completa documento, versión, fecha, página y enlace | Citas inventadas | README → Búsqueda híbrida, punto 6 | Especificado · backend |
| 7 | **Citación visible y verificable**: cada respuesta muestra documento, versión, fecha, fragmento textual y "Abrir en pág. N" | Que el estudiante no pueda comprobar | Chat: clic en la fuente | Prototipo ✅ |
| 8 | **Ciclo de mejora con usuarios**: 👍/👎 con motivo (incorrecta, desactualizada, no responde, confusa) → bandeja "Sin respuesta" del portal → convertir en pregunta de control o subir el documento faltante | Errores que se repiten sin que nadie se entere | Portal → Sin respuesta | Prototipo ✅ |
| 9 | **Escalamiento humano**: "Hablar con una persona" o "Enviar consulta a la dependencia", con la conversación adjunta y código de seguimiento | Dejar al estudiante sin respuesta | Chat: 👎 o respuesta sin información | Prototipo ✅ |

Nota de terminología: la rúbrica habla de "manejo explícito de *no sé*". En la interfaz se redactó de forma institucional: **"Sin información oficial sobre este tema"**. Para preguntas ajenas a la universidad se usa **"Consulta fuera del ámbito institucional"**.

### 1.2 Por qué preguntas de aclaración (evidencia)

En la evaluación pública de GOV.UK Chat (gobierno del Reino Unido), la mayoría de las respuestas incorrectas venían de **consultas ambiguas**. Las preguntas de aclaración y el rechazo de lo que está fuera de alcance llevaron al 88 % de respuestas dentro de alcance y subieron la precisión del 76 % al 90 %.
Fuentes: https://insidegovuk.blog.gov.uk/2026/03/16/5-things-we-learned-testing-gov-uk-chat-an-ai-assistant-for-government · https://insidegovuk.blog.gov.uk/2024/01/18/the-findings-of-our-first-generative-ai-experiment-gov-uk-chat/

### 1.3 Validación con set de control (Portal → Validación)

- **26 preguntas de control** de ejemplo: español e inglés, preguntas que deben citar un documento concreto, preguntas cuya respuesta correcta es "sin información", preguntas ambiguas que deben pedir aclaración y una pregunta de inventario.
- **Métricas**: exactitud total, citación correcta, "sin información" cuando corresponde, respuestas sin fuente (alucinaciones), exactitud por idioma y latencia p50/p95.
- **Importar CSV** para cargar el set definitivo y **exportar resultados** como evidencia para el paper.
- Las preguntas reales sin respuesta que llegan a la bandeja se convierten en nuevas preguntas de control, así el set crece con preguntas de estudiantes y no solo con preguntas inventadas por el equipo.

Resultado actual (simulador, 20-10-2026): **100 %** de exactitud, **0** alucinaciones, **100 %/100 %** ES/EN.

**Ejemplo de que la validación funciona.** Al agregar la respuesta de aranceles, la regla se activaba con cualquier "¿cuánto cuesta…?". La pregunta de control "¿Cuánto cuesta el parqueadero?" pasó a responderse con el valor de la matrícula, y la exactitud bajó al 96 %. El set lo detectó antes de publicar, se corrigió la regla y volvió al 100 %. Esto ilustra en el paper por qué se valida después de cada cambio.

### 1.4 Qué falta para el nivel 4
1. Set de **≥100 preguntas** con los documentos del Día 1: mitad español y mitad inglés, ~20 % "sin información" y ~10 % ambiguas, con la respuesta esperada (documento y artículo) **verificada por una persona contra el documento**, no contra el modelo.
2. Correrlo contra el **backend real** y reportar las métricas con intervalo de confianza; si hay tiempo, comparar solo vectores, solo palabras clave e híbrido.
3. Idealmente, que un experto de cada dependencia revise una muestra (método de GOV.UK).

---

## 2. Calidad técnica del prototipo (secciones 8.1, 10.2 y 10.3)

**Nivel 4 pide:** prototipo conversacional funcional con cobertura amplia, guía paso a paso (qué, cómo, en qué orden y con qué documentos), buenas prácticas de código y viabilidad real de adopción.

| Requisito | Qué tenemos |
|---|---|
| Procedimientos | Tarjetas de trámite: qué es, documentos, pasos en orden (se pueden marcar), dependencia responsable, tiempo, lugar en el mapa, **fechas clave con "Añadir al calendario" (.ics)** y fuente |
| Representatividad estudiantil | Respuesta con instancias y contacto, y ubicación en el mapa |
| Ubicaciones | Mapa del campus con flecha y círculos dibujados por una herramienta del modelo (`mostrar_en_mapa`): aulas, laboratorios, salas de estudio, residencias y más |
| Conversación | Streaming, aclaraciones, sugerencias de seguimiento, historial con renombrar y eliminar |
| Repositorio | Público, README con arquitectura, contrato de API y estrategias; TypeScript estricto; sin secretos |
| Viabilidad de adopción | Widget de una línea para cualquier página de la universidad; portal para que las dependencias suban y versionen documentos sin programar; costo mensual bajo (sección 4) |

**Falta:** contenido real del Día 1 (10–15 trámites bastan para la demo) y el backend.

---

## 3. Experiencia de usuario y bilingüismo (secciones 5, 8.1 y 8.2)

**Nivel 4 pide:** interfaz amigable y accesible sin instrucciones previas, español e inglés fluidos con detección o selección (kichwa como valor agregado) y respuesta percibida como inmediata.

- **Sin instrucciones previas:** bienvenida de 3 pasos en la primera visita (qué hace, cada respuesta trae su fuente, aviso de datos), tendencias y sugerencias mientras se escribe.
- **Bilingüe:** selector ES/EN y detección automática que ofrece cambiar de idioma. Temas, oficinas, lugares y ubicaciones de las citas se traducen; el nombre oficial del documento y la cita textual se mantienen en el original y se marcan "original quote in Spanish".
- **Kichwa:** ningún servicio de traducción automática soporta kichwa ecuatoriano (Google y DeepL ofrecen quechua sureño). Se dejaron los 81 textos en `docs/kichwa-traduccion.csv` para que los traduzca un hablante nativo, y la interfaz lo indica con honestidad ("Kichwa (Ecuador) · beta"). Es un argumento de rigor para el jurado.
- **Accesibilidad:** WCAG 2.2 AA verificado con axe-core, con **0 violaciones** en todas las pantallas, temas claro y oscuro y ambos idiomas. Además: lector de pantalla con un solo anuncio por respuesta, foco atrapado en diálogos, movimiento reducido y alto contraste de Windows.
- **Respuesta inmediata:** el estado ("Buscando en los documentos oficiales…") aparece en menos de un segundo y el texto llega en streaming; la latencia se muestra en cada respuesta.
- **Otros:** dictado por voz, adjuntar imagen o PDF, captura de pantalla, modo oscuro, diseño con la identidad de yachaytech.edu.ec (Inter, azul `#27618E`, celeste `#06B0EE`).

**Falta:** validar el kichwa; probar voz y captura con hardware real.

---

## 4. Análisis de costo computacional (sección 4, objetivo 5, y 8.2)

**Nivel 4 pide:** estimación detallada y matemáticamente consistente (infraestructura, modelo, almacenamiento, inferencia), con supuestos explícitos, escenarios de carga y decisiones de arquitectura que la sustentan.

En el portal, pestaña **Costo**: los supuestos se pueden editar, la fórmula se muestra paso a paso y hay tres escenarios. Con los valores por defecto:

| Concepto | Valor |
|---|---|
| Supuestos | 1.800 estudiantes · 0,3 consultas/estudiante/día = 540 consultas/día · 30 % de acierto de caché semántica · Claude Haiku 5.5 · 4 fragmentos de 500 tokens · 300 tokens de respuesta |
| Costo de modelo por consulta | **$0,00031** (router + respuesta; los aciertos de caché no llaman al modelo) |
| Por cada 1.000 consultas | **$0,31** |
| Modelo al mes | $5,95 (incluye $0,95 de escrituras de caché de prompt) |
| Servidor al mes | $48: DigitalOcean 4 vCPU / 8 GB con API, PostgreSQL + pgvector y modelo de embeddings local |
| **Total al mes** | **≈ $54** |
| Pico de matrículas (×4) | ≈ $69 |
| Sin caché semántica | ≈ $56 |
| Almacenamiento | 12.000 vectores ≈ 70 MB; memoria ≈ 1,6 GB |

Precios verificados el 20-10-2026:
- Anthropic: Haiku 5.5 a $0,10 / $0,50 / $0,01 (entrada / salida / caché) por millón de tokens; Sonnet 5.5 a $2 / $10 / $0,10. https://platform.claude.com/docs/en/about-claude/pricing
- DigitalOcean: https://www.digitalocean.com/pricing/droplets

**Decisiones que lo sustentan:** modelo pequeño para clasificar y responder; caché de prompt; caché semántica; 4 fragmentos en vez de 10; historial de 6 turnos más un resumen; respuestas de tablas por búsqueda estructurada; y el umbral de "sin información", que evita llamar al modelo cuando no hay fuente.

**Falta:** confirmar con TI si se usa este proveedor o la infraestructura de la universidad.

---

## 5. Uso documentado de IA (sección 13, obligatorio)

Ver `docs/DECLARACION-IA.md`: herramientas, propósito de cada una y la distinción entre lo que decidió el equipo, lo que generó la IA y cómo se verificó. **Falta:** completar las filas marcadas *(equipo)* (paper, pitch, quién revisó qué).

---

## 6. Rigor científico y metodológico (secciones 8.2, 9 y 10.1)

**Nivel 4 pide:** paper IEEE completo, problema bien delimitado, estado del arte crítico (chatbots institucionales y técnicas contra alucinaciones) y cada decisión justificada con evidencia.

Material listo para el paper:

| Sección del paper | Material |
|---|---|
| Problema | Planteamiento del reto, más el foco elegido: trámites con fuente verificable y bilingüe |
| Estado del arte | Chatbots en producción: Pounce (Georgia State; RCT con −21 % de abandono antes de la matrícula), GOV.UK Chat (precisión del 76 % al 90 %), Ask Jamie (Singapur), Genie (Deakin), Sunny (ASU), Lola (U. de Murcia). Repositorios abiertos: ninguno con validación en el portal, costo, mapa ni accesibilidad verificada. En Ecuador solo hay prototipos de tesis (ESPOL). Técnicas contra alucinaciones: RAG, búsqueda híbrida, rechazo con umbral, citación, aclaración y evaluación con set de control |
| Metodología | Arquitectura en capas (sección 1.1), búsqueda híbrida (README), cálculo de costo (sección 4) |
| Validación | Set de control, métricas, el ejemplo del parqueadero y accesibilidad con axe-core |
| Limitaciones | Datos de ejemplo, kichwa sin validar, backend especificado pero no construido |

---

## 7. Guion sugerido para el pitch (sección 10.4)

1. **Problema** (30 s): un estudiante de intercambio buscando cómo cambiar de carrera.
2. **Demo** (2 min):
   - "Residencias" → el asistente pide aclarar → trámite paso a paso → añadir la fecha al calendario → ver en el mapa.
   - La misma pregunta en inglés.
   - "¿Cuál es el sueldo del rector?" → sin información oficial → enviar la consulta a la dependencia.
3. **Veracidad** (1 min): las nueve capas, la pestaña Validación y el caso del parqueadero.
4. **Costo** (30 s): ≈ $54 al mes para toda la universidad, y por qué.
5. **Impacto y adopción** (30 s): widget de una línea, las dependencias actualizan sus documentos y el ciclo de la bandeja.

Preguntas probables del jurado:
- ¿Cómo evitan que el modelo invente? → capas 1, 5 y 6 más la validación.
- ¿Qué pasa si el reglamento cambia? → versionado, solo se usa la versión vigente, nuevas preguntas de control.
- ¿Y los datos de los estudiantes? → LOPDP, art. 12: aviso, minimización, revocación.
- ¿Por qué no está en kichwa? → no existe traducción automática confiable para el kichwa ecuatoriano; se propone validación humana.
