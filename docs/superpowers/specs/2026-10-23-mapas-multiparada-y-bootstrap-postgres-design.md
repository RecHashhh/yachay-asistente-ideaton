# Diseño: navegación multiparada y arranque PostgreSQL tolerante a volúmenes existentes

## Objetivo

Mejorar las consultas de ubicación para que Yachay resuelva con datos geográficos reales las búsquedas cercanas, permita navegar por varios destinos en una misma solicitud y solo pida precisión cuando los resultados sean realmente ambiguos. Además, hacer que el stack Docker Compose cree de forma idempotente la base de datos objetivo cuando se reutilice un volumen PostgreSQL inicializado con otro nombre, sin borrar ni reemplazar bases existentes.

## Comportamiento acordado

- Una petición explícita como «quiero ir de SENESCYT a Caballerizas y luego a Riksplan» debe resolver las paradas, calcular cada tramo con el backend/PostGIS y devolver un enlace de Google Maps con origen, paradas intermedias, destino y modo de viaje. No se solicita una confirmación adicional para ejecutar una ruta explícita.
- Una petición de proximidad como «la enfermería más cercana a los bloques de departamentos» debe resolver la categoría y la referencia geográfica y ordenar los candidatos por distancia calculada en PostGIS. Se marca el resultado más cercano cuando la referencia y el lugar son confiables.
- Si hay varias coincidencias razonables, la API devuelve hasta tres candidatos válidos; el chat los presenta y pide elegir. No se inventan lugares ni coordenadas. Con una coincidencia confiable se muestra directamente.
- Una consulta meramente locativa («¿dónde está X?») sigue marcando X y puede ofrecer la ruta como acción opcional.
- Se conserva la compatibilidad con las consultas existentes de un único origen y destino y con los enlaces actuales de Google Maps.
- En el arranque, el servicio de base de datos informa disponibilidad conectándose a la base administrativa `postgres`. Un inicializador idempotente crea la base configurada por `POSTGRES_DB` solo si falta; una base ya existente y todas las bases anteriores permanecen intactas. `seed` empieza después del inicializador.

## Diseño técnico

### Mapas y navegación

Extender el contrato interno de la conversación/mapa de dos roles (`origin`, `destination`) a una secuencia ordenada de paradas y tramos de ruta, manteniendo el caso de dos puntos compatible. El backend geográfico determina las ubicaciones candidatas y calcula cada tramo; el LLM solo identifica la intención y conserva el texto del usuario. Las geometrías se limitan a la respuesta para la interfaz y no se envían como contexto textual extenso.

La selección de resultados sigue siendo determinista: búsqueda de lugares/categorías, resolución de la referencia, filtro por categoría y orden por distancia PostGIS. La ambigüedad se representa como una respuesta explícita con hasta tres candidatos y conserva el contexto de la solicitud para que la selección posterior continúe la búsqueda o la ruta.

La interfaz construye el enlace de Google Maps a partir de las coordenadas confirmadas. Para varias paradas usa el origen, los waypoints ordenados y el destino final; si no puede formar un enlace válido, mantiene la ubicación/ruta visible sin fabricar un destino.

### PostgreSQL en Docker Compose

Cambiar el healthcheck para comprobar que el servidor acepta conexiones usando la base administrativa `postgres`, no la base de aplicación, pues `pg_isready` puede indicar que el servidor está listo aunque la base configurada no exista. Añadir un servicio de inicialización que espere al healthcheck y conecte a `postgres`; si `POSTGRES_DB` no existe, la crea con identificadores escapados y autocommit. `seed` dependerá de que ese servicio termine correctamente.

No se ejecuta `dropdb`, `down -v`, restauración destructiva ni renombrado automático. Los volúmenes y bases existentes se conservan. La inicialización de esquema/extensiones y carga OSM/RAG siguen en las migraciones/seed actuales.

## Archivos candidatos

- `api/app/maps_tool.py` y pruebas: búsqueda cercana y secuencia de paradas con resultados compactos.
- `Mapas/app/search.py` y, si hace falta para la consulta, consultas geoespaciales de proximidad; pruebas de API/PostGIS.
- `web/src/lib/mapPayload.ts`, `web/src/lib/mapConversation.ts` (tipos), `web/src/lib/googleMapsNavigation.ts` y pruebas: conversión del FeatureCollection, varias paradas y enlaces.
- `web/src/views/Chat.tsx` y `web/src/components/GeoMap.tsx`: adaptar el contrato del mapa sin cambiar el flujo existente de chat.
- `web/e2e/map-chat.spec.ts`: verificar el enlace de indicaciones en la UI.
- `docker-compose.yml`, un módulo pequeño de inicialización de DB en `api/app/` y pruebas: readiness, creación idempotente y preservación de DB existente.

Los nombres definitivos pueden ajustarse a los límites reales del código durante la implementación; no se hará una reestructuración general.

## Etapas y verificación

1. Reproducir en pruebas el fallo de enlace multiparada, solicitud de proximidad y ambigüedad; reproducir la creación faltante de la base con un inicializador aislado.
2. Añadir la resolución/ruta multiparada y enlaces Google Maps, preservando el caso de un solo tramo.
3. Añadir la selección por proximidad PostGIS y respuestas de hasta tres candidatos integradas al chat.
4. Añadir bootstrap idempotente de la base configurada y corregir el healthcheck/dependencias de Compose.
5. Ejecutar pruebas unitarias Python/TypeScript, pruebas de mapas con PostgreSQL/PostGIS cuando Docker esté disponible, typecheck/build y E2E afectado. Probar tanto volumen vacío como volumen ya inicializado con otro nombre de DB; comprobar que la DB preexistente permanece.

## Reversión

La reversión es por código: revertir los cambios de contrato/UI y retirar el servicio bootstrap. El bootstrap no elimina ni transforma datos; si creó la base objetivo, esta queda intacta y puede conservarse. No se recomienda borrarla como parte de una reversión. No se planea una migración destructiva de datos.

## Riesgos y límites

- El OSM local puede no contener algún destino o un acceso enrutable; en ese caso se ofrecen coincidencias o se informa que la ruta no está disponible, sin inventarla.
- Los enlaces de Google Maps admiten un número finito de waypoints según el cliente; la interfaz deberá limitar la secuencia al máximo soportado y explicitar cualquier parada omitida, o rechazar secuencias mayores sin truncarlas silenciosamente.
- Crear la base requiere que el usuario configurado como administrador de PostgreSQL tenga `CREATEDB`, lo cual se cumple con el `POSTGRES_USER` de inicialización estándar; si no, el servicio debe fallar con un diagnóstico claro y sin alterar bases existentes.
- Las pruebas de integración con PostGIS/Docker dependen de que el daemon Docker esté accesible.
