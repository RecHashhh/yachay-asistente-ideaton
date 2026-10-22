# Auditoría del proyecto Yachi — 20 de octubre de 2026

Contrasta tres cosas: **(A)** lo que el equipo pidió al inicio, **(B)** lo que exige el planteamiento del reto (PDF 1) y **(C)** el nivel 4 de la rúbrica (PDF 2), contra el estado real del repositorio (`main`, commit `0dc3676` y siguientes) y del entorno local.

Leyenda: ✅ hecho y verificado · 🟡 hecho en parte o sin verificar con el sistema real · ❌ pendiente · ⏸ fuera de alcance (decidido)

> **Estado de la plataforma (actualizado).** Backend **en funcionamiento** con PostgreSQL 18 + pgvector 0.8.7 (índice HNSW): 75 documentos, 1.446 fragmentos con embeddings, 10 lugares y 50 aulas con coordenadas reales, frontend conectado. Falta solo la **clave de Anthropic**: sin ella, Yachi responde en modo extractivo (muestra el fragmento oficial más relevante, sin redactar).
>
> **Métricas reales de búsqueda, sin modelo** (set de **119 preguntas** con evidencia literal: 73 en español y 20 en inglés con documento esperado, 12 «sin información», 6 de aclaración y 8 de lugares). Tras la integración con el agente (22/10): documento correcto entre los 5 que recibe el modelo **90/93 = 97 %** (antes 80/93), en primer lugar **70/93** (antes 57), MRR **0,84** (antes 0,71); reglas **26/26**; 0 regresiones pregunta por pregunta. Mejoras generales: desempate entre guías parecidas, cobertura de conceptos poco frecuentes (IDF), siglas exactas, glosario para preguntas en inglés, normalización por longitud y garantía del mejor resultado de cada índice en la fusión RRF. Quedan 3 (R69 gratuidad, R82 SIGA, R83 plazo adicional de reingresos); con clave, el agente elige el documento por su descripción del catálogo. Las mejoras se diseñaron mirando las fallas de este mismo set: falta un set independiente para confirmarlas.

---

## A. Plan inicial del equipo

| # | Pedido | Estado | Evidencia |
|---|---|---|---|
| A1 | Estilo Gemini/minimalista, como el Help Desk | ✅ | `web/`; tipografía Inter y colores de yachaytech.edu.ec |
| A2 | React con animaciones tipo Claude | ✅ | Streaming palabra por palabra, mascota animada, estados |
| A3 | Datos en XLSX, PDF y CSV | ✅ | Corpus del equipo cargado y **la subida desde el Portal se procesa sola** (`api/app/processing.py`): PDF con tablas, Excel con celdas combinadas y CSV → fragmentos → embeddings → índice. Probado con los tres formatos y con un PDF dañado (queda en «error» con el motivo) |
| A4 | Metadatos: tema, fecha, versión | 🟡 | Tema y audiencia se asignan al cargar (`api/app/catalog.py`); **la versión solo existe si está en el nombre** (V4.0) y la fecha es de consulta, no del documento |
| A5 | Dos tipos de usuario (admin y público) | ✅ | Portal `#/admin`; el público no ve el inventario |
| A6 | Mascota de YT que habla | 🟡 | Mascota animada y modo voz; el arte nuevo está en curso (otra sesión) |
| A7 | LangChain/LangGraph | ✅ · 🟡 | `api/app/graph.py` corriendo con la base real; falta probar la redacción con el modelo (clave pendiente) |
| A8 | Sugerir consultas por tendencias | ✅ | Front; el backend calcula tendencias reales desde `messages` |
| A9 | Mapa con flecha y círculos | ✅ | **Mapa real interactivo** (Leaflet + OpenStreetMap) con las coordenadas de los Excel: círculo en el destino, flecha desde el origen («¿cómo llego… desde el rectorado?»), lugares de referencia y enlace «Cómo llegar a pie». Claro, oscuro y móvil, 0 violaciones de accesibilidad |
| A10 | Aviso de uso de datos | ✅ | LOPDP art. 12 completo; datos del responsable por confirmar con legal |
| A11 | Interacciones decorativas tipo Claude | ✅ | |
| A12 | Portal para actualizar la base | ✅ | Subir, reemplazar (la versión anterior sigue vigente hasta que la nueva queda indexada), reprocesar si falla, retirar. Sesiones en la base, bloqueo por intentos fallidos y bitácora de acciones |
| A13 | Qué documentos hay en la web y con cuáles contamos | ✅ | `fuentes.csv` (193 fuentes, 73 incluidas, motivo de cada exclusión) y respuesta "¿qué documentos tienes?" |
| A14 | Estrategias para ahorrar tokens | ✅ | README + calculadora; umbral que evita llamar al modelo sin fuente |
| A15 | "Confesionario" | ⏸ | Es una página de Facebook de estudiantes, no un canal oficial: Yachi lo explica y deriva a la FEYT y a Bienestar |
| A16 | Voz, adjuntos, captura (del Help Desk) | ✅ | Voz probada por el equipo con micrófono real |
| A17 | Widget flotante para otras páginas | ✅ | `web/public/yachi-widget.js` |
| A18 | PostgreSQL como base | ✅ | Base `yachi` creada, corpus cargado |
| A19 | Búsqueda vectorial rápida | ✅ | pgvector 0.8.7 instalado, índice HNSW; 27–58 ms por búsqueda híbrida |
| A20 | Filtros: palabras clave, groserías, temas sensibles | ✅ | Ver sección G: 97/97 casos, 0 falsos positivos, 0 falsos negativos |

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
| Exactitud total | Portal → Validación | **Sin modelo (22/10, $0):** 87/119 = 73 % (documento correcto en 1.er lugar 78/101 = 77 %; aclaración 6/6; ES 72 % · EN 77 %; 0 alertas de respuesta sin fuente; p50 213 ms · p95 463 ms). «Sin información» correcto solo 3/12: sin modelo se muestra el fragmento más cercano aunque no responda; con la clave, el modelo responde SIN_INFORMACION. Con modelo: pendiente (clave) |
| Citación correcta | Portal → Validación | 100 % simulador; real: pendiente |
| "Sin información" correcto | Portal → Validación | 100 % simulador; real: pendiente |
| Alucinaciones (respuestas sin fuente) | Portal → Validación | 0 simulador; real: pendiente |
| Exactitud ES / EN | Portal → Validación | 100 / 100 simulador; real: pendiente |
| Latencia p50 / p95 | Validación y cada respuesta | Simulador ~1 s; real: pendiente |
| Accesibilidad WCAG 2.2 AA | axe-core | **0 violaciones** (real, todas las pantallas) |
| Costo por consulta / mes | Portal → Costo | $0,00031 · ≈ $54/mes (precios verificados) |
| Calidad del corpus | Auditoría de tablas | 28/31 PDF públicos limpios; 3 corregidos a mano; 3 avisos restantes son falsos positivos; 0 fragmentos > 1.200 tokens |

## E. Riesgos y huecos detectados

1. ~~El backend no se ha ejecutado~~: corre con la base real; falta solo la redacción con el modelo (clave).
2. **Paso a paso estructurado**: con el modelo real los trámites salen como lista en el texto, no como la tarjeta interactiva del simulador. Se puede pedir al modelo una salida estructurada para trámites (mejora de calidad técnica).
3. **Versión y fecha del documento**: el corpus no trae versión ni fecha de emisión para la mayoría; la interfaz debería decir "consultado el …" y el equipo podría completar `version`/`fecha` en `fuentes.csv`.
4. **Faltan documentos clave**: Reglamento Interno de Admisión y Nivelación y Manual COBUS (SharePoint exige sesión institucional) y ACSU-SE-02 No. 003-2024 (enlace caducado). Becas y buses **ya se agregaron**. El buzón FEYT existe pero exige sesión institucional.
5. **Datos sensibles en el corpus**: la tabla de cambios de carrera contiene correos de personas (decanatos). Son públicos en la web de la universidad, pero conviene confirmarlo frente a la LOPDP antes de publicar.
6. ~~"Confesionario"~~: resuelto (no es canal oficial; Yachi deriva a los canales oficiales).
7. **Wifi y servicios TIC**: ahora llegan a la búsqueda (antes se bloqueaban), pero el corpus no tiene documento de TIC; quedan en la bandeja "Sin respuesta".
8. **Contactos de crisis**: ECU 911 y los de Bienestar salen del corpus (`bienestar_universitario`); el equipo debe confirmarlos con Bienestar antes de la demo.

## G. Filtros y seguridad del chat

Implementado en `api/app/filters.py` (listas, normalización, datos personales, verificación, límite de uso) y `api/app/rules.py` (`triage`). Las listas viven en la tabla `filter_terms` y se editan en **Portal → Filtros** (no se borran: se desactivan, con quién y cuándo). Casos de prueba en `api/app/filter_cases.py`: `python -m app.filter_cases` o botón *Correr casos* del Portal.

| # | Qué hace | Referencia |
|---|---|---|
| G1 | **Crisis** (autolesión): mensaje fijo con ECU 911, Psicología y Bienestar (ext. 2503), citando la página oficial. No pasa por el modelo y no se guarda el texto | UNESCO 2023; NIST AI 600-1 |
| G2 | **Acoso y violencia**: nunca se trata como insulto (incluye "me dijo p***"); se ofrece la Consejería de Derechos y se responde con los documentos. Texto no guardado, fuera de tendencias y bandeja | UNESCO 2023; LOPDP (datos de terceros) |
| G3 | **Groserías**: normaliza tildes, repeticiones, letras sueltas y "leet" (`put@`, `m1erda`, `p u t a`). Solo el insulto sin consulta recibe el aviso; una pregunta real con grosería se responde sin ella | Buenas prácticas de moderación |
| G4 | **Nunca filtrar**: identidad (indígena, afro, montubio, LGBTI, trans), salud sexual y mental; se retiran antes de revisar las otras listas | UNESCO (no discriminación) |
| G5 | **Fuera del ámbito** con frases precisas: "wifi", "serie", "fútbol" y "recetas" ya no se bloquean | Falsos positivos |
| G6 | **Manipulación**: "ignora tus instrucciones", "prompt del sistema", "actúa como"… responde con mensaje fijo. Además, la pregunta va entre etiquetas `<pregunta>`, el usuario no puede cerrarlas y el prompt prohíbe revelar o cambiar reglas y seguir órdenes dentro de los documentos | OWASP LLM01, LLM07 |
| G7 | **Datos personales** ocultos antes de buscar y guardar: cédula, celular, teléfono +593 y fijo, RUC, tarjeta, correo, pasaporte. Códigos de período, aulas, resoluciones y montos no se tocan | LOPDP; OWASP LLM02 |
| G8 | **Conservación**: preguntas, votos y bandeja se borran a los 365 días (`RETENTION_DAYS`, coincide con el aviso); consultas a oficinas a los 90 días | LOPDP |
| G9 | **Límite de uso**: 12 mensajes/min y 300/día por sesión; 120/min por IP (el campus comparte IP). Responde 429 con mensaje claro | OWASP LLM10 |
| G10 | **Verificación de la respuesta**: correos, enlaces y cifras que no están en los fragmentos generan un aviso visible y van a la bandeja como "Dato no verificado" | OWASP LLM09 |
| G11 | **Transparencia**: el aviso de datos explica qué pasa con los mensajes sensibles y que los datos personales se ocultan | Ley de IA UE art. 50 (referencia); LOPDP art. 12 |
| G12 | **Medición**: 97 casos (crisis, denuncias, insultos disfrazados, manipulación, saludos, consultas legítimas sensibles y datos personales): **97/97, falsos positivos 0/32, falsos negativos 0/29**. La búsqueda no cambió: recall@5 29/29, MRR 0,73 | NIST AI RMF (medir) |

Pendiente: probar G6 y G10 con el modelo real cuando haya clave; que Bienestar confirme los contactos de G1–G2; ampliar los casos con mensajes reales de la bandeja.

## H. Cierre de pendientes sin clave de Anthropic (20 de octubre)

| # | Pendiente | Estado | Evidencia |
|---|---|---|---|
| H1 | Procesar solas las subidas del Portal | ✅ | `api/app/processing.py`; PDF/XLSX/CSV indexados y encontrables por la búsqueda; PDF dañado → «error» con motivo y botón «Reprocesar»; reemplazo sin hueco de vigencia |
| H2 | Set de control ≥ 100 | ✅ | 119 preguntas (`api/app/control_seed.py`); cada una con cita literal verificada en `docs/rag/rag/control_evidencia.json` (fuera del repo, corpus confidencial); se quitaron 11 preguntas propias del personal administrativo |
| H3 | Mapa interactivo real | ✅ | `web/src/components/RealMap.tsx` (carga diferida); origen detectado por `rules.split_origin` |
| H4 | Paso a paso como tarjeta desde el backend | ✅ | 7 guías curadas (tercera matrícula, retiro de carrera y de nivelación, cambio de carrera, cambio de IES, certificados, reingreso) con 124 citas verificadas; se responden sin modelo. Plazos 2026SEM02 vencidos: se muestran como «Período terminado», sin «Añadir al calendario». Contenido en `docs/rag/rag/tramites.json` (fuera del repo) |
| H5 | Oficina de contacto según el tema | ✅ | `api/app/contacts.py`: oficina por palabras de la pregunta (TIC, salud, psicología, becas, residencias, biblioteca, posgrado, inglés…) con correo y extensión **solo si están en el corpus** |
| H6 | Acceso al Portal más seguro | ✅ | Sesiones en PostgreSQL (hash SHA-256 del token, 8 h), cierre de sesión en el servidor, bloqueo tras 5 intentos fallidos por IP en 15 min (los aciertos no cuentan), contraseña mínima de 12 caracteres, bitácora `admin_audit` (2 años). Producción: Microsoft Entra ID (README) |

## F. Orden recomendado

1. Crear base + pgvector (doble clic en `Crear base de datos Yachi.cmd`), cargar corpus, levantar backend.
2. Clave de Anthropic → correr validación real → calibrar umbral → registrar métricas.
3. Front: mapa real, "consultado el", aviso de acceso institucional, inventario real.
4. Datos faltantes (equipo con cuenta institucional) y set ≥100.
5. Paper, pitch, declaración de IA.
