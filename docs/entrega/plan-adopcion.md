# Plan de adopción de Yachi en el campus

Cómo pasar del prototipo del Ideatón a un servicio que la universidad pueda operar. Cada afirmación remite a algo que ya existe en el repositorio o se marca como pendiente.

## 1. Qué ya está listo para adoptarse

| Necesidad de la universidad | Cómo la resuelve el prototipo | Dónde verlo |
|---|---|---|
| Ponerlo en cualquier página institucional | Widget de una línea (`<script src=".../yachi-widget.js">`) que abre el chat en un iframe aislado, en español, inglés o kichwa | `web/public/yachi-widget.js`, demo en `web/public/demo-sitio.html` |
| Que las dependencias actualicen el contenido sin programar | Portal con subida y versionado de documentos, temas, bandeja de preguntas sin respuesta, validación, filtros editables, tendencias, consultas, costo y bitácora | `#/admin` |
| Responder solo con información oficial | 75 documentos vigentes indexados; citas armadas por el servidor; "sin información" cuando no hay fuente; verificación de cifras, correos y enlaces | `api/app/graph.py` |
| Guiar trámites paso a paso | 9 guías curadas (qué, cómo, en qué orden, con qué documentos, plazos y oficina), cada dato con su cita | Chat: "¿Cómo solicito una tercera matrícula?" |
| Atender lo que el bot no sabe | Consulta a la dependencia con autorización de datos y código de seguimiento; el personal la gestiona en el portal | Portal → Consultas |
| Proteger a estudiantes y datos | Mensajes fijos para crisis, denuncias y síntomas de salud; ocultamiento de cédula, correo y teléfono; límites de uso; retención limitada (LOPDP) | `api/app/filters.py`, `api/app/main.py` |
| Demostrar que funciona | Set de control de 119 preguntas ES/EN: **113/119 (95 %) y 0 respuestas sin fuente** con Claude Haiku 5.5 (22-10-2026); 83 pruebas de backend, 34 de frontend y CI en cada cambio | Portal → Validación, `.github/workflows/ci.yml` |

## 2. Fases propuestas

| Fase | Duración | Alcance | Criterio para avanzar |
|---|---|---|---|
| **0. Piloto controlado** | 4 semanas | Una dependencia dueña del contenido (Registros Académicos) y un grupo de 50–100 estudiantes de primer año | ≥ 90 % en el set de control revisado por la dependencia; ≥ 70 % de votos positivos; ningún dato institucional inventado |
| **1. Lanzamiento académico** | 1 semestre | Widget en la web de admisiones y en el aula virtual; guías de matrícula, retiro, reingreso y cambios | Consultas resueltas sin derivar ≥ 80 %; tiempo de respuesta de consultas derivadas < 3 días hábiles |
| **2. Campus completo** | 2.º semestre | Bienestar, Biblioteca, Residencias, FEYT y posgrado con sus propios documentos | Cada dependencia mantiene sus documentos al día (revisión mensual registrada en la bitácora) |

## 3. Quién hace qué (gobierno del contenido)

| Rol | Responsabilidad | Herramienta |
|---|---|---|
| **Dependencia dueña** (Registros, Bienestar, Biblioteca…) | Subir la versión vigente de sus documentos y retirar las vencidas; revisar mensualmente sus preguntas sin respuesta | Portal → Documentos, Sin respuesta |
| **Equipo de calidad** (2 personas de TIC o Docencia) | Correr la validación después de cada cambio de documentos; mantener filtros y set de control | Portal → Validación, Filtros |
| **TIC** | Hosting, respaldos, actualizaciones de seguridad, clave del modelo y tope de gasto | Docker Compose, `.env` |
| **Bienestar Universitario** | Validar los mensajes de crisis, denuncias y salud, y sus contactos | `api/app/graph.py` (textos fijos) |
| **Hablante de kichwa** | Revisar las traducciones antes de quitar la etiqueta beta | Reportes de traducción enviados desde el chat (tabla `translation_reports`) |

## 4. Costo de operación

Estimación de la calculadora del portal (Portal → Costo), con supuestos editables: 1.800 estudiantes, 540 consultas al día, Claude Haiku 5.5 y servidor de 4 vCPU / 8 GB.

| Concepto | Mensual |
|---|---|
| Modelo de lenguaje | ≈ USD 6 |
| Servidor (API, PostgreSQL + pgvector, embeddings locales) | ≈ USD 48 |
| **Total** | **≈ USD 54** (≈ USD 69 en pico de matrículas) |

Saludos, crisis, lugares, guías de trámite y síntomas de salud se responden sin llamar al modelo, lo que reduce el costo variable. **Pendiente:** registrar el consumo real por consulta (incluidos los tokens de caché y las llamadas del agente) y aplicar un tope de gasto automático; hoy la cifra es una estimación, no una medición.

## 5. Lo que falta antes del lanzamiento (honesto)

| Pendiente | Por qué importa | Esfuerzo estimado |
|---|---|---|
| Inicio de sesión institucional (Microsoft Entra ID) en el portal y roles por dependencia | Hoy hay un único usuario administrador; cada dependencia debería editar solo lo suyo | 1–2 semanas |
| Tope de gasto y registro de consumo real del modelo | Controlar el presupuesto y justificar el costo con datos | 2–3 días |
| Revisión institucional del set de control y de las 9 guías | La validación actual la hizo el equipo, no las dependencias | 2 semanas (en el piloto) |
| Despliegue en infraestructura de la universidad, respaldos y monitoreo | Pasar de equipos del equipo a un servicio con responsable | 1 semana con TIC |
| Texto legal de privacidad aprobado por la universidad | El aviso de datos está marcado "por confirmar" | Depende de Jurídico |
| Kichwa validado por un hablante competente | Se presenta como beta hasta entonces | Continuo |

Fuera de alcance a propósito: matrícula, notas y pagos reales. El asistente orienta y deriva; no reemplaza los sistemas académicos.
