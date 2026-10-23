# Piloto operativo: métricas y concurrencia

## Objetivo

Operar un piloto local de extremo a extremo con visibilidad de errores, latencia, llamadas y tokens de Anthropic, costo estimado y concurrencia sobre el flujo SSE ya implementado.

## Estado previo a la implementación (2026-10-23)

- `messages` ya guarda latencia y tokens de la respuesta final, pero no agrupa el uso del clasificador y las rondas de selección de herramientas.
- Hay logs de algunos pasos de Anthropic y del motor geográfico, pero no una superficie agregada de métricas para scraping ni métricas HTTP/SSE de errores y solicitudes activas.
- Compose ejecuta una API Uvicorn de un worker, PostgreSQL y los servicios de la aplicación. No hay scraper, dashboard ni generador de carga.
- El backend y el frontend ya tienen suites de tests y la ruta geográfica pasó una prueba real con SSE. La salida visual del mapa y Anthropic externo siguen siendo comprobaciones manuales del piloto.

## Diseño

El piloto se sirve desde el Compose actual y agrega una pila opcional bajo el perfil `pilot`: Prometheus scrapea `/metrics` y Grafana muestra un dashboard provisionado. La API sigue siendo útil sin ese perfil. Se limita a un worker para que el cliente Prometheus en memoria tenga semántica correcta; escalar a múltiples workers requerirá almacenamiento multiproceso o OpenTelemetry.

La instrumentación registra:

- solicitudes HTTP por plantilla de ruta, método y clase de estado; duración e inflight, incluyendo la vida completa del stream SSE;
- solicitudes de chat terminadas o fallidas por intención/tipo de resultado, duración y primer evento SSE;
- llamadas Anthropic por operación y modelo, resultado, latencia, tokens de entrada/salida y tokens de cache;
- costo estimado por modelo y operación, según tarifas configurables por millón de tokens. El cálculo separa entrada normal, cache write, cache read y salida. Si falta la tarifa para el modelo, expone costo no configurado y no reporta cero como si fuera gratis;
- consultas y rutas geográficas por resultado y latencia.

Las etiquetas son enums de baja cardinalidad. No se registran prompts, contenido, session IDs, IPs ni IDs de lugares. Los logs pueden incluir un request ID aleatorio, nunca datos del usuario. Los fallos SSE cuentan como errores de aplicación aunque HTTP ya haya devuelto 200.

El perfil opcional levanta Prometheus y Grafana solo en loopback. La ruta `/metrics` queda disponible en el servicio interno de Compose, y debe excluirse del ingreso público al desplegar fuera del equipo local. Las métricas Prometheus son para operación en vivo; el historial anónimo existente continúa en PostgreSQL.

Un script con `httpx` ya declarado en requirements emite usuarios virtuales SSE con sesiones distintas, procesa el stream completo y reporta throughput, errores, p50/p95/p99, tiempo al primer evento y respuestas por resultado. Sus niveles por defecto son 1, 5, 10 y 20 sesiones. El caso por defecto usa una ubicación del catálogo y no requiere Anthropic. Enviar preguntas documentales con posible llamada facturable requiere un flag explícito.

## Tarifas

Los precios se cargan desde `ANTHROPIC_PRICING_USD_PER_MTOK_JSON`, con la tabla Haiku como respaldo configurable. Para el default `claude-haiku-5-5`, se documentan los precios Anthropic consultados el 2026-10-23: $0.10 input y $0.50 output por millón de tokens para prompts hasta 100k; $0.50/$2.50 para prompts sobre 100k; cache write $0.125/$0.625 y cache read $0.01/$0.05. Estos valores deben revisarse al cambiar modelo, región, contrato o precio. El estimado no sustituye la factura del proveedor ni lleva una marca de tiempo individual en cada muestra.

Fuente de tarifas: [Anthropic, Claude model pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Límites

- El primer piloto es local en Docker Compose y mide hasta 20 sesiones concurrentes; no despliega ni transmite telemetría a terceros.
- No se fija un SLO de producción sin conocer el servidor objetivo y las expectativas institucionales. El informe de carga presenta datos medidos, no declara un umbral inventado.
- Un test sin clave real valida protocolo y mocks, pero no valida latencia, disponibilidad, precio final ni cuota de Anthropic.
- El cliente Prometheus en memoria es para un worker. La operación multiproceso queda bloqueada hasta adoptar backend multiproceso u OpenTelemetry Collector.

## Aceptación

- `/metrics` expone contadores, histogramas y gauge; métricas excluyen texto y IDs de sesión.
- La API mide el ciclo completo SSE y cuenta `error` dentro del stream como fallo aun con HTTP 200.
- Cada llamada Anthropic exitosa o fallida reporta operación, tiempo, tokens y costo estimado/configuración faltante.
- Las tarifas model-specific soportan cache y límite de 100k tokens y se prueban con valores conocidos.
- Prometheus y Grafana arrancan con `docker compose --profile pilot up`; el dashboard carga métricas sin config manual.
- El load runner ejecuta 1/5/10/20 sesiones contra `/chat`, aísla IDs, reporta percentiles y errores, y no llama Anthropic por defecto.
- Se puede verificar que una respuesta RAG con flag de consentimiento es la única ruta de carga que puede hacer llamadas facturables.
- Se repiten todas las pruebas backend y web, más una prueba real de carga contra Compose con clave Anthropic vacía.
