# Declaración de uso de inteligencia artificial

Requisito obligatorio de la sección 13 del reto. Distingue qué decidió el equipo, qué generó la IA y cómo se verificó. Las filas marcadas _(equipo)_ las completa el equipo antes de la entrega.

## Actualización verificable — 20 de octubre de 2026

Actualización 22-10-2026: por solicitud del usuario se consultó Alki mediante Playwright para ocho textos públicos de interfaz. El sitio muestra la etiqueta «GEMINI»; no se verificó la arquitectura del proveedor. Los resultados permanecen como propuestas no aprobadas, con procedencia y alertas. Codex preparó la cola de 110 textos y el importador técnico de traducciones con revisión atribuida. No se declararon revisores humanos ficticios y, por solicitud del usuario, se activaron 102 propuestas de interfaz como vista previa, sin atribuirles aprobación lingüística. Este trabajo no traduce las respuestas institucionales ni valida kichwa con hablantes.

En esta fase se utilizó **OpenAI Codex** como asistente de programación: cambios en React/TypeScript y Python, mascota vectorial y animaciones CSS, auditoría con Playwright, corrección de conexiones y errores, investigación web de chatbots institucionales y preparación de documentación. Los modelos exactos utilizados en todas las sesiones anteriores no se pueden reconstruir a partir de este repositorio; el equipo debe confirmar los identificadores antes de la entrega.

El usuario decidió el enfoque minimalista, la identidad de Yachi, la adaptación de la mascota de referencia, la barra lateral colapsada y las prioridades de interacción. La IA asistió en código, propuestas visuales, investigación y borradores. La aprobación de una apariencia por el usuario no equivale a revisión humana de cada respuesta institucional, del código completo o del aviso legal.

Verificación de esta fase: compilación TypeScript/Vite, navegador Chrome con Playwright, comprobaciones de contrato y pruebas con API simulada cuando no se dispone de acceso administrativo real. Estas pruebas se documentan con sus límites. No se ha certificado WCAG ni probado todo el recorrido de voz con hardware real en esta fase. El backend existe y puede operar en modo extractivo sin clave del proveedor; ese modo no acredita generación bilingüe completa.

La declaración histórica siguiente debe contrastarse con registros del equipo: nombres de herramientas/modelos, afirmaciones de revisión humana y resultados previos de axe no fueron certificados de nuevo aquí. El paper y el pitch preparados con asistencia de IA son borradores: faltan autores, resultados empíricos definitivos y aprobación del equipo. No deben presentarse como investigación ya concluida.

## 1. Herramientas usadas

| Herramienta | Modelo | Para qué se usó |
|---|---|---|
| Claude Code (Anthropic), en VS Code | Claude Opus 5.5 | Generación del código del frontend, revisión visual con capturas automáticas, auditoría de accesibilidad, borradores del README, de PRODUCT.md y de esta declaración |
| Skill Impeccable (dentro de Claude Code) | — | Guía de diseño y auditoría de calidad de la interfaz |
| axe-core 4.10 (no es IA) | — | Verificación automática WCAG 2.2 AA de cada pantalla |
| _(equipo)_ | | Redacción del paper |
| _(equipo)_ | | Preparación del pitch |

**Dentro del producto** (la IA como componente, no como ayuda para desarrollar): la arquitectura propuesta usa Claude Haiku 5.5 para clasificar el tema y redactar la respuesta, y un modelo de embeddings de código abierto para la búsqueda. Hoy el prototipo funciona con un simulador sin modelo; ver README.

## 2. Aporte humano y aporte de la IA

### Decidido por el equipo
Estas decisiones las dio el equipo en sus instrucciones; la IA las implementó:
- Enfoque RAG sobre documentos PDF, XLSX y CSV, con metadatos de tema, fecha y versión.
- Dos tipos de usuario: administradores que suben el contexto y público general.
- Mascota de Yachay Tech como voz del asistente; LangChain/LangGraph para la lógica.
- Sugerencias de consulta basadas en tendencias.
- Mapa del campus con una herramienta del modelo para dibujar flecha y círculos.
- Aviso de uso de datos, acceso abierto y portal para actualizar la base de conocimiento.
- Estilo visual minimalista basado en el Help Desk de RIPCON, y micro-interacciones tipo Claude.
- Reutilizar del Help Desk el dictado por voz, los adjuntos y la captura de pantalla.
- Textos institucionales ("Sin información oficial" en lugar de "no sé"), qué ve el público y qué solo el administrador, y las mejoras inspiradas en otros chatbots (aclaraciones, motivo del 👎, hablar con una persona, bienvenida, calendario).
- Widget flotante tipo Messenger para otras páginas.
- Priorización del alcance: solo frontend en esta etapa.

### Generado por la IA (revisado por el equipo)
- Todo el código de `web/` (React + TypeScript): chat, portal, documentos, widget, simulador.
- El contenido de ejemplo del simulador (`web/src/lib/mock.ts`). **No es información oficial** y se reemplaza con los documentos del Día 1.
- El set de 26 preguntas de control y las métricas de la pestaña Validación.
- La calculadora de costo y sus supuestos (precios de la API consultados el 20-10-2026; ver la pestaña Costo).
- Los textos de la interfaz en español e inglés y el borrador del aviso de datos.
- Investigación de apoyo (con agentes de Claude Code y búsqueda web, fuentes citadas): comparación con repositorios de GitHub y chatbots institucionales en producción, recursos de kichwa ecuatoriano, precios de la API y del servidor, y artículos de la LOPDP. Base de `docs/INFORME-RUBRICA.md`; el equipo debe verificar las fuentes antes de citarlas en el paper.

### Pendiente de autoría del equipo
- _(equipo)_ Paper en formato IEEE: problema, estado del arte, metodología, validación, conclusiones.
- _(equipo)_ Pitch.
- _(equipo)_ Validación del saludo en kichwa con un hablante nativo.
- _(equipo)_ Revisión legal del aviso de datos.

## 3. Cómo se verificó lo generado por IA

- Cada pantalla se probó en un navegador real (Edge sin interfaz): escritorio, móvil, tema claro y oscuro, español e inglés, y el widget incrustado. No hubo errores de página.
- Auditoría de accesibilidad con axe-core (WCAG 2.0/2.1/2.2 A y AA): 0 violaciones en todas las pantallas tras las correcciones.
- El código pasa la verificación de tipos de TypeScript (`npm run build`).
- No se pudo probar con hardware real: el dictado por voz (micrófono) y la captura de pantalla.
- _(equipo)_ Revisión del código y de las respuestas esperadas del set de control contra los documentos fuente: quién revisó qué.
