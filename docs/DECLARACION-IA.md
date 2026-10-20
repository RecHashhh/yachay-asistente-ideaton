# Declaración de uso de inteligencia artificial

Requisito obligatorio de la sección 13 del reto. Distingue qué decidió el equipo, qué generó la IA y cómo se verificó. Las filas marcadas _(equipo)_ las completa el equipo antes de la entrega.

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
- Widget flotante tipo Messenger para otras páginas.
- Priorización del alcance: solo frontend en esta etapa.

### Generado por la IA (revisado por el equipo)
- Todo el código de `web/` (React + TypeScript): chat, portal, documentos, widget, simulador.
- El contenido de ejemplo del simulador (`web/src/lib/mock.ts`). **No es información oficial** y se reemplaza con los documentos del Día 1.
- El set de 21 preguntas de control y las métricas de la pestaña Validación.
- La calculadora de costo y sus supuestos (precios de la API consultados el 20-10-2026; ver la pestaña Costo).
- Los textos de la interfaz en español e inglés y el borrador del aviso de datos.

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
