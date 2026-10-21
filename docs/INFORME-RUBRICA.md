# Informe de avance frente a la rúbrica — Reto 1: Chatbot Institucional de Procedimientos

## Revisión con los documentos oficiales — 20 de octubre de 2026

Fuentes revisadas: `Rubrica_Reto_Chatbot_Institucional.pdf` (p. 1) y `Reto1 chatbot Yachaytech.pdf` (pp. 2–6), facilitados por el usuario desde Downloads. Sus requisitos son criterios del concurso; esta revisión no autoriza publicar documentos institucionales ni subir cambios a GitHub.

**Estado de la evidencia:** la auditoría integral de esta fecha combina pruebas públicas reales, revisión de código y pruebas administrativas con API simulada, identificadas por separado en `docs/auditoria-integral-2026-10-20/index.html`. No permite declarar cumplimiento total ni asignar una nota final.

**Advertencia sobre el contenido histórico que sigue:** fue elaborado para una etapa anterior del prototipo. Sus notas 4/4, porcentajes del simulador, afirmaciones de accesibilidad, estimaciones de precios y descripciones de funcionalidades no constituyen resultados vigentes verificados. El backend ya existe; el acceso administrativo real requiere autenticación y no se debe usar la instrucción antigua de «cualquier correo y contraseña». No reutilizar cifras o afirmaciones históricas en el paper sin comprobarlas.

### Objetivos y criterios de cierre

Los siete criterios de la rúbrica no tienen ponderaciones indicadas. Kichwa es un valor agregado; español e inglés son obligatorios. Producción, matrícula/notas/pagos reales y firma electrónica quedan fuera del alcance exigido. La guía paso a paso y la representatividad estudiantil sí forman parte del alcance.

| Objetivo | Evidencia disponible | Condición de cierre propuesta | Prioridad |
|---|---|---|---|
| Responder trámites oficiales paso a paso | Chat y fuentes funcionan; hay respuestas extractivas que reproducen fragmentos en vez de resolver la consulta | Inventario de trámites con fuente vigente; verificar por trámite qué hacer, cómo, orden, documentos y dependencia. Omitir datos ausentes y reconocerlos | 1 |
| Cubrir representatividad y ubicaciones | Ubicaciones/mapa comprobados parcialmente; no se ha certificado toda la cobertura de representantes | Lista contrastada de consejos, representantes y canales; probar aulas, laboratorios, salas de estudio y residencias contra fuentes oficiales | 1 |
| Demostrar veracidad | Citas, aclaraciones y rechazo observados; importación CSV y errores de evaluación presentan fallos | Corregir validación; ejecutar set ES/EN revisado por personas sobre backend real; exportar pregunta, respuesta esperada, respuesta obtenida, fuente, fecha y resultado | 1 |
| Ofrecer primer uso claro y bilingüe | Selector ES/EN, chat progresivo, historial y widget probados; quedan problemas móviles y traducción de respuestas por comprobar | Misma batería ES/EN sin cambiar hechos; recorrido por teclado y móvil, sin recortes; mensajes de error recuperables y fuentes accesibles | 1 |
| Entregar prototipo honesto y estable | Auditoría con 11 hallazgos | Corregir los fallos que afectan a la demo; conectar o retirar funciones que aparentan capacidades inexistentes, especialmente adjuntos y confirmaciones falsas | 1 |
| Justificar costo computacional | Calculadora y documentación existentes; valores y precios no revalidados | Fórmulas consistentes, entradas válidas, CPU/RAM/almacenamiento e inferencia; escenarios y supuestos explícitos, precios documentados con fecha | 2 |
| Completar paper IEEE | Hay notas y documentación; no se localizó un entregable final identificable por nombre paper/IEEE | Paper con resumen, problema, estado del arte y referencias, metodología, arquitectura, validación real, costos, conclusiones y limitaciones | 2 |
| Documentar uso de IA | Existe `docs/DECLARACION-IA.md` | Completar herramientas/modelos, propósito, aporte humano y de IA, responsables de revisión; incorporarlo al documento técnico | 2 |
| Publicar código revisable | Origin configurado; main remoto consultado, cambios locales pendientes | Revisar secretos y datos institucionales, compilar, crear commits y publicarlos; verificar acceso anónimo al repositorio y reproducibilidad desde README | 2 |
| Preparar pitch | Hay guion histórico | Ensayar problema, demo ES/EN, veracidad, costo e impacto; ajustar al tiempo que confirme la organización | 3 |

Como meta interna, no impuesta por los PDF, se propone un set de al menos 100 preguntas equilibrado ES/EN, con casos sin información, ambiguos, fuera de dominio y ataques a instrucciones. Reportar exactitud, cita correcta, rechazo apropiado, resultados por idioma y latencias p50/p95. Cualquier hecho institucional inventado detectado bloquea la versión de demostración hasta corregirlo; no presentar «cero alucinaciones» como garantía universal por superar un set finito.

### Decisión de interacción

Se conserva la aparición progresiva del texto: contribuye a la fluidez percibida exigida en 8.2. El estado breve de trabajo solo se muestra mientras se procesa; al terminar desaparece y ya no aparece «Ver actividad». Las fuentes permanecen disponibles. La animación no demuestra que el modelo esté generando en tiempo real: `displayStream` también reparte texto recibido de golpe por repintados. Mantener Detener, respetar movimiento reducido, evitar esperas añadidas y medir por separado tiempo hasta la primera respuesta visible y tiempo total. No animar de nuevo respuestas históricas.

### Publicación comprobada en esta revisión

Esta subsección conserva el diagnóstico **previo a la solicitud de publicar**. La revisión posterior, descrita más abajo, prepara la publicación y sus correcciones; no debe interpretarse esta fotografía anterior como estado permanente del remoto.

`origin` apunta a `https://github.com/RecHashhh/yachay-asistente-ideaton.git`. `git ls-remote origin refs/heads/main` devolvió `0daca792f2218107508ee14dc9ced26f5b8fb947`. El HEAD local es `12d819c`, con dos commits por delante de la referencia de seguimiento y numerosos archivos modificados o nuevos sin commit. Por tanto, **no está todo publicado**. En esta revisión no se realizó commit, push ni despliegue. Consultar una referencia con las credenciales locales no certifica acceso público anónimo; queda pendiente esa comprobación. GitHub y despliegue de la página son verificaciones distintas.

---

## Contenido histórico — requiere revalidación antes de la entrega

### Correcciones posteriores de esta fecha

Se conectó el CSV de validación al servidor (GET/PUT autenticados, reemplazo transaccional y validación de filas), se agregó recuperación de errores de evaluación/feedback y se deshabilitaron adjuntos del público sin soporte real (el backend también los rechaza explícitamente). Se corrigieron el inicio en poca altura, el formulario móvil y el foco/cierre del menú. El historial «Ver actividad» ya no aparece al terminar. La calculadora limita valores inválidos y usa 384 dimensiones por defecto, coherente con el esquema actual; sus costos siguen siendo una estimación, no mediciones de consumo.

Se añadió **Consultas** al portal: listado de las últimas 100 vigentes y estados nueva/en atención/resuelta, con autenticación y bitácora. Aplicar `api/sql/05_consultas.sql` mediante `python -m app.migrate`. No envía correos; la atención es manual y el texto público evita prometer una respuesta automática. La migración se aplicó en la base local durante esta revisión. Los contratos y la interfaz se probaron en aislamiento; no se certificó el circuito administrativo con personas reales.

Verificación: `npm --prefix web run build`; seis pruebas de contratos HTTP con `python -m unittest discover -s tests -v` desde `api`; regresión Playwright en `scripts/verificar-entrega.cjs` con API simulada. Queda una advertencia de tamaño del bundle de Vite. Estos resultados no sustituyen la evaluación factual del chatbot.

### Comparación con instituciones — fuentes consultadas el 20-10-2026

**Avance funcional posterior en utilidad:** catálogo `#/guias` con búsqueda y pendientes; listas de documentos y pasos persistidas en el navegador; siguiente elemento por preparar; revisión compartida ES/EN que invalida marcas antiguas si cambia el contenido; copia/descarga con fuentes; calendario sin plazos vencidos; contactos/enlaces respaldados por citas. La base local contiene nueve guías: las siete previas más residencias y participación/FEYT. El corpus privado sigue fuera de GitHub. Las fuentes se comprueban de nuevo al ofrecer una guía, para evitar servir guías retiradas o con evidencia cambiada.

Las consultas elípticas reconocibles conservan el trámite y responden al campo solicitado. Se distingue una justificación de ausencia a clase de una ausencia a órganos de cogobierno; si el fragmento no respalda la gestión académica, se deriva como falta de información. Un mapa con coordenadas reales ya no se sustituye por el esquema de ejemplo si comparte un identificador. Se corrigió además la altura del mapa interactivo.

No se llenan con suposiciones tiempos totales, costos, enlaces de formularios ni fechas de nuevas convocatorias. Las tarjetas indican los datos ausentes y ofrecen el original o contacto documentado. La presencia literal de una cita demuestra trazabilidad textual, no corrección semántica absoluta ni superioridad frente a otros asistentes. La validación con estudiantes y la revisión institucional siguen pendientes.

Evidencia de cierre de utilidad: 16 pruebas de backend, dos suites de Playwright, nueve guías activas y 36 comprobaciones de rutas/seguimiento ES/EN contra la base local. Se realizó además un recorrido normal de tres consultas por la API: guía de cambio de carrera, seguimiento de tiempo y mapa de biblioteca. Resultados y límites en `docs/utilidad-2026-10-20/verificacion.json`; las capturas quedan locales por contener información institucional. La compilación pasa con una advertencia de tamaño del paquete principal.

Revisión documental de fuentes primarias, no una prueba de acceso autenticado a los productos. Las publicaciones históricas acreditan funciones descritas en esas fechas; no garantizan que todos los servicios sigan iguales hoy. «No documentado» no significa «inexistente».

| Referente | Qué aporta y qué nos falta | Cómo orientar Yachi |
|---|---|---|
| [Pounce · Georgia State](https://success.gsu.edu/reduction-of-summer-melt/) | Mensajería SMS 24/7, orientación personalizada para matrícula y evidencia experimental de impacto. Yachi no tiene campañas proactivas ni resultados de impacto con estudiantes | Medir resolución de consultas, corrección y tiempo de completar una tarea antes de sumar más canales |
| [Genie · Deakin](https://www.deakin.edu.au/about-deakin/news-and-media-releases/articles/deakins-genie-a-virtual-digital-assistant-out-of-the-bottle) | La universidad documentó horarios, tareas, recursos, saldo y préstamos, además de navegación. Yachi carece de integración autenticada con esos servicios | El mapa ya es una coincidencia, no una exclusividad. Las integraciones personales quedan como futuro: sistemas críticos están fuera del reto |
| [Sunny · ASU](https://news.asu.edu/20200709-asu-launches-bilingual-chatbot-reach-parents-who-want-go-college) | Orientación bilingüe ES/EN dirigida también a estudiantes con hijos. Yachi no ha validado recorridos por perfiles | Bilingüismo es requisito básico; diferenciar por precisión y claridad para estudiantes nuevos y de intercambio |
| [LOLA · Universidad de Murcia](https://clutv10.um.es/pro/video?id=116011) | Asistencia para preinscripción/matrícula con interacción familiar de mensajería. Yachi todavía necesita pruebas de tareas completas con usuarios | Priorizar resolver una consulta concreta; conservar el diseño minimalista y evitar paneles técnicos en la conversación |

**Diferenciación defendible:** la combinación en una misma conversación de evidencia institucional visible (documento/versión/fecha y enlace cuando exista), guía de trámite curada y localización física; herramientas de revisión y validación administrables; identidad local y widget. Son fortalezas observables del prototipo, no funciones exclusivas de Yachi. Voz, calendario, bilingüismo y mascota no son innovaciones por sí solos. El valor científico debe probarse con una evaluación reproducible de la exactitud y de la resolución de tareas. Kichwa solo se presentará como valor agregado cuando lo valide un hablante competente.

**Orden de evolución:** (1) cobertura y fuentes vigentes; (2) evaluación humana ES/EN; (3) atención manual realmente operativa; (4) prueba con estudiantes; (5) recordatorios optativos o nuevos canales si los resultados lo justifican. No añadir matrícula, notas o pagos reales para aparentar madurez: no son necesarios para este reto.

Los precios de Haiku/Sonnet usados en la calculadora se contrastaron con la [tarifa oficial de Anthropic](https://platform.claude.com/docs/en/about-claude/pricing); el supuesto de servidor 4 vCPU/8 GiB a USD 48/mes se contrastó con [DigitalOcean Basic Regular](https://www.digitalocean.com/pricing/droplets). El costo real depende de tráfico, uso efectivo de caché, configuración, impuestos y operación; el monto de la calculadora no demuestra que una instancia soporte una carga concreta.

Se prepararon `docs/entrega/paper.tex` (borrador IEEE) y `docs/entrega/revision.html` (comparación, cierre y guion de pitch). Falta completar autores, evaluación factual, revisión institucional y ensayo. El repositorio se comprobó público mediante una consulta anónima a la API de GitHub (`private: false`). La publicación de commits se verifica al finalizar; no equivale a desplegar una página.

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
- **Modo voz (accesibilidad y valor agregado):** conversación manos libres en `#/voz`, un enlace que se puede compartir con estudiantes ciegos o con baja visión, o desde el botón «Voz». Funciona así:
  - Yachi escucha, responde en voz alta y vuelve a escuchar, y se puede interrumpir.
  - Los trámites se recorren por voz («siguiente», «anterior», «todos los pasos»), las aclaraciones se responden con «uno» o «dos», y el mapa se describe en palabras («desde la entrada principal, camina hacia el noreste…»).
  - Las fuentes se leen al final y los datos personales dichos en voz alta se omiten.
  - Hay sonidos de estado, atajos de teclado y se puede ajustar la velocidad y la voz.
  - Costo cero: usa el reconocimiento y la síntesis del navegador; el reconocimiento funciona en Chrome y Edge. Se probó la conversación completa con un micrófono simulado.
  - Complementa a los lectores de pantalla (NVDA, JAWS, TalkBack, VoiceOver), con los que la interfaz ya es compatible; no los reemplaza.
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
