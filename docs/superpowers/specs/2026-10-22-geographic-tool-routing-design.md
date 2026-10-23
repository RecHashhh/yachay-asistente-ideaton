# Enrutamiento geográfico conversacional

## Objetivo

Las peticiones de ubicaciones y rutas deben llegar al motor geográfico aunque se expresen en lenguaje libre. El RAG sigue atendiendo consultas documentales y ambas herramientas pueden ejecutarse para una consulta mixta.

## Diseño

El flujo clasifica localmente estructuras claras de búsqueda, marcador, ruta y consulta documental. Cuando la clasificación local no es suficiente y Claude está disponible, un clasificador con salida Pydantic identifica intención y entidades; los umbrales se prueban como decisiones del router, no como probabilidades calibradas. Sin Claude, el sistema conserva un resultado controlado y no presenta el RAG como respuesta a una petición geográfica inequívoca.

La capa de resolución consulta siempre el catálogo PostGIS y conserva identificadores estables. No deja que el modelo invente lugares ni resuelva ambigüedades por posición. La herramienta existente sigue siendo la única responsable de búsqueda espacial y cálculo de rutas.

Las aclaraciones geográficas se guardan por `sessionId`, con expiración, y guardan intención, entidades resueltas/candidatas y el campo esperado. Una respuesta breve como «el edificio» completa el destino pendiente sin descartar el origen. Una petición nueva no relacionada invalida el estado pendiente.

Para preguntas mixtas, el backend ejecuta mapa y RAG de manera independiente, entrega al LLM solo metadatos geográficos compactos y conserva la geometría fuera del prompt. Los eventos SSE tipados se adaptan a los eventos actuales de mapa/aclaración para no romper clientes existentes.

## Límites

Se preservan FastAPI, Anthropic/LangChain actuales, PostGIS, pgRouting, RAG y el renderizado de mapa. No se añade otra dependencia obligatoria ni se modifican datos OSM. El estado usa la clave de conversación que ya proporciona el cliente, pues este producto no incluye identidad autenticada para el chat.

## Aceptación

- Las frases de ruta y marcador llegan a `map_action` sin depender solo de expresiones regulares.
- Claude clasifica entradas ambiguas con un esquema validado; los patrones claros no requieren llamada de clasificación.
- Una ambigüedad puede continuar en un turno posterior y conserva los lugares ya resueltos.
- El resultado geográfico sigue llegando por SSE y se muestra sobre satélite o calles.
- Las consultas documentales continúan en RAG y las mixtas pueden usar ambas herramientas.
- Errores de resolución, grafo y proveedor se distinguen de ausencia documental.
