# Piloto operativo de Agente Yachay

## Levantar el piloto

1. En `.env`, define las conexiones y una contraseña para Grafana. Para una prueba sin llamadas facturables, deja `ANTHROPIC_API_KEY` vacío.
2. Inicia la aplicación y el monitoreo:

   ```sh
   docker compose --profile pilot up --build -d
   ```

3. Revisa la salud de la API en `http://127.0.0.1:8000/health`, Grafana en `http://127.0.0.1:3000` y Prometheus en `http://127.0.0.1:9090`.
4. En Grafana abre el dashboard **Agente Yachay · Piloto**. Muestra errores HTTP y SSE, duración completa del chat, primer evento SSE, llamadas Anthropic, tokens, costo estimado, operaciones geográficas y solicitudes en vuelo.

## Gates antes de invitar usuarios

- **Datos documentales:** prepara y monta el corpus confidencial que usa el equipo; comprueba `GET /health` y exige `rag_index: "ready"`, `documents > 0` y `chunks > 0`. `status: "ok"` por sí solo solo confirma que la API y la base responden.
- **Claude:** si el piloto evaluará redacción con Anthropic, configura `ANTHROPIC_API_KEY` en el entorno privado, confirma que `/health` muestra `agent: true` y ejecuta una interacción real autorizada. Registra tokens y costo estimado en Grafana; la integración simulada no acredita una llamada real.
- **Carga:** repite `pilot_load.py` varias veces en el hardware de destino con datos y versión constantes. Define límites de error y p95 antes de abrir acceso; la primera ronda local es una línea de referencia, no un SLO ni un máximo de capacidad.
- **Mapas:** la prueba Playwright con backend real confirma la geometría y el trazado en MapLibre, pero simula las respuestas de teselas. Comprueba la disponibilidad de las imágenes Esri y OpenStreetMap desde la red donde correrá el piloto.

En la medición local del 23 de octubre de 2026, el API estaba sano pero devolvía `documents: 0`, `chunks: 0`, `rag_index: "empty"` y `agent: false`. No se hicieron llamadas Anthropic. Las verificaciones de carga y mapas documentadas para esa fecha no cuentan como validación del corpus ni del proveedor real.

El perfil solo publica Grafana y Prometheus en loopback. Grafana tiene desactivados el reporte de uso y las comprobaciones de actualizaciones externas. `/metrics` no debe quedar expuesto por el proxy público en una instalación externa. El colector usa métricas en memoria y la API debe seguir con un worker. Los locks advisory usan un pool aparte (`GEO_LOCK_POOL_SIZE`, por defecto 32) para que solicitudes en espera no retengan conexiones del pool de consultas.

## Medir concurrencia

Con la API ya levantada, ejecuta:

```sh
cd api
.venv/bin/python scripts/pilot_load.py --target http://127.0.0.1:8000 --users 1 5 10 20 --iterations 1
```

El caso por defecto busca **Plaza Las Manuelas**. Para cargar una ruta ya resuelta entre **Plaza Las Manuelas** y **Edificio SENESCYT**, usa `--scenario route`. Ambos casos usan una sesión aleatoria por solicitud y no necesitan Anthropic. El JSON de salida incluye tasa de error, throughput, p50/p95/p99, tiempo al primer evento SSE y deltas de solicitudes, tokens y costo leídos desde `/metrics`. Se puede guardar como evidencia de una ejecución:

```sh
.venv/bin/python scripts/pilot_load.py > pilot-load.json
```

La carga incluye las dependencias y el hardware del equipo donde corre Compose; anota CPU, memoria, versión del código, tamaño del corpus y versión de la base junto al resultado antes de comparar ejecuciones. No compares con un baseline que use datos o configuración distintos.

Para validar el flujo visual contra el API, inicia Compose con el API publicado en `127.0.0.1:8000` y ejecuta desde `web/`:

```sh
YACHAY_LIVE_E2E=1 npm run test:e2e
```

La prueba usa el API, PostgreSQL y pgRouting reales; intercepta las teselas externas con imágenes transparentes para mantener la prueba reproducible. Sin `YACHAY_LIVE_E2E=1`, Playwright omite ese caso y solo ejecuta la prueba de mapa simulada.

Para comprobar imágenes satelitales reales de Esri, ejecuta `YACHAY_LIVE_E2E=1 YACHAY_LIVE_ESRI_TILES=1 npm run test:e2e -- --grep 'real route'`. Chromium verificó HTTP 200 y capturó la ruta sobre la imagen. OSM permanece interceptado en Playwright; una solicitud individual devolvió un PNG válido. No automatices barridos ni paneos de teselas OSM: la [política oficial de teselas](https://operations.osmfoundation.org/policies/tiles/) prohíbe el uso de bots headless para forzar su carga.

Los escenarios predefinidos evitan Anthropic. Para una consulta personalizada, el script exige `--allow-anthropic`; úsalo solo si el servicio remoto está configurado con una clave y autorizas ese consumo. El costo que reporta es una estimación basada en la tabla de tarifas local, no el importe de factura.

## Métricas disponibles

`GET /metrics` expone métricas Prometheus de baja cardinalidad: no incluye pregunta, dirección IP, usuario, sesión ni identificadores de lugar. Los errores SSE aparecen separados porque el HTTP puede responder `200` antes de que falle el stream. El load runner calcula también la diferencia de contadores durante cada nivel de concurrencia.

La tabla de tarifas `ANTHROPIC_PRICING_USD_PER_MTOK_JSON` se expresa en USD por millón de tokens y admite tarifas de entrada, salida, escritura de caché y lectura de caché, por modelo y tamaño de contexto. Debe actualizarse cuando cambien modelo, región, contrato o precios.
