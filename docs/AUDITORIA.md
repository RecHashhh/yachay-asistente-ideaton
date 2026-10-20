# Auditoría del proyecto Yachi — 20 de octubre de 2026

Contrasta tres cosas: **(A)** lo que el equipo pidió al inicio, **(B)** lo que exige el planteamiento del reto (PDF 1) y **(C)** el nivel 4 de la rúbrica (PDF 2), contra el estado real del repositorio (`main`, commit `0dc3676` y siguientes) y del entorno local.

Leyenda: ✅ hecho y verificado · 🟡 hecho en parte o sin verificar con el sistema real · ❌ pendiente · ⏸ fuera de alcance (decidido)

> **Estado de la plataforma.** El frontend está completo y verificado (axe-core sin violaciones, pruebas en navegador). El backend (FastAPI + LangGraph + PostgreSQL + pgvector + Claude Haiku 5.5) está **escrito y subido, pero aún no se ha ejecutado contra la base**: falta crear la base (necesita la contraseña de `postgres`) y la clave de Anthropic. Toda métrica de este documento proviene del **simulador** hasta que eso ocurra.

---

## A. Plan inicial del equipo

| # | Pedido | Estado | Evidencia |
|---|---|---|---|
| A1 | Estilo Gemini/minimalista, como el Help Desk | ✅ | `web/`; tipografía Inter y colores de yachaytech.edu.ec |
| A2 | React con animaciones tipo Claude | ✅ | Streaming palabra por palabra, mascota animada, estados |
| A3 | Datos en XLSX, PDF y CSV | 🟡 | Corpus del equipo (71 docs, 1.424 fragmentos) listo para el backend; la subida desde el portal guarda el archivo, pero el troceo lo hace `preparar_corpus.py` |
| A4 | Metadatos: tema, fecha, versión | 🟡 | Tema y audiencia se asignan al cargar (`api/app/catalog.py`); **la versión solo existe si está en el nombre** (V4.0) y la fecha es de consulta, no del documento |
| A5 | Dos tipos de usuario (admin y público) | ✅ | Portal `#/admin`; el público no ve el inventario |
| A6 | Mascota de YT que habla | 🟡 | Mascota animada y modo voz; falta arte y nombre oficiales |
| A7 | LangChain/LangGraph | 🟡 | `api/app/graph.py` con LangGraph; sin ejecutar aún |
| A8 | Sugerir consultas por tendencias | ✅ | Front; el backend calcula tendencias reales desde `messages` |
| A9 | Mapa SVG con flecha y círculos | 🟡 | Funciona con plano esquemático; **coordenadas reales ya cargables** (10 puntos + 50 aulas) pero el mapa del front aún no las usa |
| A10 | Aviso de uso de datos | ✅ | LOPDP art. 12 completo; datos del responsable por confirmar con legal |
| A11 | Interacciones decorativas tipo Claude | ✅ | |
| A12 | Portal para actualizar la base | ✅ front · 🟡 back | Endpoints listos; sin ejecutar |
| A13 | Qué documentos hay en la web y con cuáles contamos | ✅ | `fuentes.csv` (193 fuentes, 73 incluidas, motivo de cada exclusión) y respuesta "¿qué documentos tienes?" |
| A14 | Estrategias para ahorrar tokens | ✅ | README + calculadora; umbral que evita llamar al modelo sin fuente |
| A15 | "Confesionario" | ❌ | Sin definir por el equipo |
| A16 | Voz, adjuntos, captura (del Help Desk) | ✅ · 🟡 | Probado con micrófono simulado; falta prueba con hardware real |
| A17 | Widget flotante para otras páginas | ✅ | `web/public/yachi-widget.js` |
| A18 | PostgreSQL como base | 🟡 | Esquema completo con pgvector; base pendiente de crear |
| A19 | Búsqueda vectorial rápida | 🟡 | pgvector 0.8.7 compilado para PG 18 + índice HNSW; pendiente de instalar (requiere permiso de administrador) |

## B. Requisitos del planteamiento del reto (PDF 1)

| Sección | Requisito | Estado | Nota |
|---|---|---|---|
| 4.1 | Relevar y estructurar la información | ✅ | Corpus del equipo (ahora 73 documentos, 1.452 fragmentos) + 3 tablas corregidas a mano tras auditoría automática de 31 PDF + becas (7 tipos y reglamento) y horario de buses 2026 agregados desde la web pública |
| 4.2 | Arquitectura que responda solo con fuentes verificadas | 🟡 | Diseñada e implementada (9 capas); falta medirla con el modelo real |
| 4.3 | Interfaz amigable ES/EN | ✅ | |
| 4.4 | Validación teórica de veracidad | 🟡 | Mecanismo y set de 34 preguntas reales listos; **falta correrlo contra el sistema real** |
| 4.5 | Costo computacional | ✅ | Calculadora con precios verificados; ≈ $54/mes (Haiku 5.5 + servidor $48) |
| 4.6 | Documentar como investigación | 🟡 | `docs/INFORME-RUBRICA.md` como base; falta el paper |
| 5 | Procedimientos, representatividad, ubicaciones | 🟡 | Representatividad y procedimientos en el corpus real; ubicaciones con coordenadas reales cargables; falta Reglamento de Admisión y Nivelación |
| 8.1 | Sin instrucciones previas | ✅ | Bienvenida de 3 pasos, tendencias, aclaraciones |
| 8.1 | Bilingüe con detección/selección (kichwa si es posible) | ✅ · 🟡 | ES/EN completo; kichwa solo saludo (no existe traductor automático confiable) |
| 8.1 | Guía paso a paso (qué, cómo, orden, documentos) | 🟡 | Tarjeta de trámite en el simulador; con el modelo real el paso a paso sale como lista numerada en el texto (no como tarjeta) |
| 8.2 | Respuesta inmediata percibida | ✅ | Estado < 1 s y streaming; latencia real por medir |
| 8.2 | Ninguna alucinación, todo rastreable | 🟡 | Citas armadas por el servidor + "sin información"; falta evidencia real |
| 8.2 | Validación con set de control | 🟡 | Ver 4.4 |
| 8.2 | Estimación de costo | ✅ | |
| 10.1 | Paper IEEE | ❌ | Equipo |
| 10.2 | Prototipo funcional | ✅ front · 🟡 back | |
| 10.3 | Repositorio público | ✅ | Sin documentos confidenciales (verificado con `.gitignore`) |
| 10.4 | Pitch | ❌ | Guion en `INFORME-RUBRICA.md` |
| 13 | Declaración de uso de IA | 🟡 | Falta completar filas del equipo |

## C. Rúbrica — nivel estimado hoy y qué falta para el 4

| Criterio | Hoy | Para llegar a 4 |
|---|---|---|
| Rigor científico | 1–2 | Paper IEEE con estado del arte crítico (material ya reunido: GOV.UK, Pounce, repositorios, técnicas) |
| Calidad técnica | 3 | Backend corriendo con el corpus real + mapa real + inventario real en el portal |
| Alucinaciones y validación | 2–3 | **Correr la validación real**, ampliar a ≥100 preguntas, reportar métricas por idioma y el umbral calibrado |
| UX y bilingüismo | 4 (kichwa parcial) | Validar kichwa; prueba de voz real |
| Costo | 4 | Confirmar servidor con TI |
| Uso de IA | 3 | Completar la declaración |
| Pitch | — | Preparar y ensayar |

## D. Métricas que pide la evaluación y su estado

| Métrica | Dónde se mide | Valor actual |
|---|---|---|
| Exactitud total | Portal → Validación | 100 % **en el simulador** (26 casos); set real: 40 preguntas listas, ejecución pendiente |
| Citación correcta | Portal → Validación | 100 % simulador; real: pendiente |
| "Sin información" correcto | Portal → Validación | 100 % simulador; real: pendiente |
| Alucinaciones (respuestas sin fuente) | Portal → Validación | 0 simulador; real: pendiente |
| Exactitud ES / EN | Portal → Validación | 100 / 100 simulador; real: pendiente |
| Latencia p50 / p95 | Validación y cada respuesta | Simulador ~1 s; real: pendiente |
| Accesibilidad WCAG 2.2 AA | axe-core | **0 violaciones** (real, todas las pantallas) |
| Costo por consulta / mes | Portal → Costo | $0,00031 · ≈ $54/mes (precios verificados) |
| Calidad del corpus | Auditoría de tablas | 28/31 PDF públicos limpios; 3 corregidos a mano; 3 avisos restantes son falsos positivos; 0 fragmentos > 1.200 tokens |

## E. Riesgos y huecos detectados

1. **El backend no se ha ejecutado** contra la base: cualquier defecto aparecerá al cargarlo. Prioridad 1.
2. **Paso a paso estructurado**: con el modelo real los trámites salen como lista en el texto, no como la tarjeta interactiva del simulador. Se puede pedir al modelo una salida estructurada para trámites (mejora de calidad técnica).
3. **Versión y fecha del documento**: el corpus no trae versión ni fecha de emisión para la mayoría; la interfaz debería decir "consultado el …" y el equipo podría completar `version`/`fecha` en `fuentes.csv`.
4. **Faltan documentos clave**: Reglamento Interno de Admisión y Nivelación y Manual COBUS (SharePoint exige sesión institucional) y ACSU-SE-02 No. 003-2024 (enlace caducado). Becas y buses **ya se agregaron**. El buzón FEYT existe pero exige sesión institucional.
5. **Datos sensibles en el corpus**: la tabla de cambios de carrera contiene correos de personas (decanatos). Son públicos en la web de la universidad, pero conviene confirmarlo frente a la LOPDP antes de publicar.
6. **"Confesionario"** sin definir.

## F. Orden recomendado

1. Crear base + pgvector (doble clic en `Crear base de datos Yachi.cmd`), cargar corpus, levantar backend.
2. Clave de Anthropic → correr validación real → calibrar umbral → registrar métricas.
3. Front: mapa real, "consultado el", aviso de acceso institucional, inventario real.
4. Datos faltantes (equipo con cuenta institucional) y set ≥100.
5. Paper, pitch, declaración de IA.
