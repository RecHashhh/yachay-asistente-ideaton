# Declaración de uso de inteligencia artificial

Requisito de la sección 13 del reto. **Esta es una plantilla: el equipo debe completarla y revisarla antes de entregar.** Que una herramienta de IA haya escrito una parte no significa que el equipo no deba poder explicarla ante el jurado.

## 1. Herramientas usadas

| Herramienta | Versión o modelo | Para qué se usó |
|---|---|---|
| Claude Code (Anthropic) | Claude Opus 5.5 | Generación del frontend React (chat, portal, widget, simulador), revisión visual con capturas, borrador del README |
| _(completar)_ | | Redacción del paper |
| _(completar)_ | | Revisión de estilo IEEE y referencias |

**Dentro del producto** (no como ayuda para desarrollarlo): el asistente usa Claude Haiku 5.5 para clasificar el tema y redactar la respuesta, y un modelo de embeddings de código abierto para la búsqueda. Esto está descrito en la arquitectura del paper.

## 2. Qué parte hizo la IA y qué parte hizo el equipo

| Componente | Generado por IA | Asistido por IA | Autoría del equipo |
|---|---|---|---|
| Planteamiento del problema y alcance | | | ✔ |
| Elección de arquitectura (RAG, "no sé", costo) | | ✔ | ✔ decisión final |
| Código del frontend (`web/src`) | ✔ primera versión | | ✔ revisión, ajustes, pruebas |
| Contenido de ejemplo del simulador (`mock.ts`) | ✔ | | ✔ reemplazado por documentos reales |
| Set de preguntas de control | | ✔ | ✔ respuestas esperadas verificadas a mano |
| Paper (texto) | _(completar)_ | | |
| Pitch | _(completar)_ | | |

## 3. Cómo se verificó lo generado por IA

- Cada pantalla se probó en el navegador (escritorio, móvil, tema claro y oscuro) con capturas automáticas.
- El código pasa la verificación de tipos de TypeScript (`npm run build`).
- Las respuestas esperadas del set de control se verificaron contra los documentos fuente, no contra el modelo.
- _(completar: revisión por pares dentro del equipo, quién revisó qué)_
