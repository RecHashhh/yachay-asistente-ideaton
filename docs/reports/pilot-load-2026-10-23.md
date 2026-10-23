# Medición inicial del piloto · 2026-10-23

## Entorno y método

- Ejecución real dentro de Docker Compose, con API Python 3.12, PostgreSQL/PostGIS y `pgRouting` del proyecto.
- Catálogo cargado: 102 lugares, 676 aristas, 4 componentes peatonales y 6 vehiculares.
- API: un worker Uvicorn, pool SQL de 8 conexiones y pool dedicado a advisory locks configurado en 32.
- Una ronda por nivel: 1, 5, 10 y 20 sesiones independientes. Se leyó el stream SSE completo.
- Caso de ubicación: «¿Dónde queda Plaza Las Manuelas?»; caso de ruta: «Desde Plaza Las Manuelas a Edificio SENESCYT».
- Se exigió `map.marker` en búsqueda y una geometría LineString/MultiLineString de al menos dos coordenadas en cada ruta.
- Se midió el delta de `/metrics` antes y después de cada nivel. No se usaron llamadas reales a Anthropic.

## Ubicación: Plaza Las Manuelas

| Sesiones | Éxitos | Errores | Latencia total p95 | Primer SSE p95 | Solicitudes/s |
|---:|---:|---:|---:|---:|---:|
| 1 | 1/1 | 0% | 98 ms | 91 ms | 10.19 |
| 5 | 5/5 | 0% | 173 ms | 165 ms | 28.30 |
| 10 | 10/10 | 0% | 286 ms | 271 ms | 34.70 |
| 20 | 20/20 | 0% | 600 ms | 569 ms | 32.89 |

## Ruta: Plaza Las Manuelas → Edificio SENESCYT

| Sesiones | Éxitos con geometría | Errores | Latencia total p95 | Primer SSE p95 | Solicitudes/s |
|---:|---:|---:|---:|---:|---:|
| 1 | 1/1 | 0% | 88 ms | 78 ms | 11.39 |
| 5 | 5/5 | 0% | 223 ms | 214 ms | 22.30 |
| 10 | 10/10 | 0% | 510 ms | 493 ms | 19.54 |
| 20 | 20/20 | 0% | 1,154 ms | 1,123 ms | 17.18 |

### Repetición de ruta a 20 sesiones

Se repitió el escenario de ruta tres veces por usuario con 20 sesiones concurrentes (60 solicitudes en total): **60/60 correctas**, tasa de error **0%**, latencia p50 **1.312 s**, p95 **2.027 s**, p99 **2.061 s**, primer SSE p95 **1.699 s** y throughput **14.48 solicitudes/s**. Los eventos incluyeron `map.route`; las métricas registraron 0 llamadas Anthropic, 0 tokens, costo estimado $0 y 0 errores SSE. La p95 mayor que en la ronda inicial refleja la muestra ampliada; ambas son mediciones locales de un worker, sin CPU/RAM capturadas.

Además, se ejecutó el seguimiento real «Plaza Las Manuelas hasta SENESCYT» → «El edificio» en la misma sesión. Llegaron `map.ambiguity` y luego `map.route`; el seguimiento preservó el origen y devolvió geometría de ruta. No hubo error SSE.

Después del último reinicio del API se repitió ese seguimiento: 1/1 conversación correcta, 120 ms de latencia total, 63 ms al primer SSE, 41 coordenadas en la geometría de ruta, cero errores SSE y cero llamadas/tokens/costo Anthropic. Se observaron `map.ambiguity` antes de `map.route` en el mismo stream.

También se calculó contra el catálogo y grafo reales la ruta Plaza Las Manuelas → Parada SENESCYT: 1/1 correcta, evento `map.route`, geometría de 40 coordenadas, 115 ms total y cero llamadas/tokens/costo Anthropic.

Las dos pruebas Playwright pasaron en Chromium. La prueba `renders a real route after choosing an ambiguous destination` corrió con Vite, el API real y el grafo PostgreSQL/PostGIS/pgRouting. Verificó `map.ambiguity` → selección de Edificio SENESCYT → `map.route`, los marcadores de origen/destino, que MapLibre cargó y renderizó la capa `geo-route-line`, y que la línea apareció en la captura sin errores de navegador. También cambió la vista entre Satélite y Calles. En la ejecución `YACHAY_LIVE_ESRI_TILES=1`, Chromium recibió HTTP 200 y la captura mostró la ruta sobre imágenes Esri reales. OSM permaneció interceptado en Playwright por su política contra pruebas headless que fuerzan la carga de teselas; una solicitud individual a su endpoint devolvió un PNG válido. La disponibilidad de OSM se comprobó por respuesta HTTP individual, no mediante paneo automatizado.

## Anthropic y errores

En las rondas de búsqueda y ruta, los deltas de llamadas Anthropic, tokens y costo estimado fueron `0`. En el seguimiento ambiguo también fueron `0`; las dos respuestas SSE de la conversación sí se contaron. Los estados HTTP fueron 200 y el contador de errores SSE se mantuvo en cero.

Esta es la primera medición de referencia, con una sola ronda por tamaño. Sirve como humo de concurrencia del Compose local, no como SLO ni como prueba de capacidad máxima. No se calcula ahorro: no hay un baseline equivalente previo. El tamaño del bundle del mapa en la compilación Vite fue 1,075 kB sin gzip y produjo el aviso de chunk >500 kB.

Los resultados describen esta máquina y esta imagen local; repite varias rondas en el hardware de despliegue y registra CPU/RAM antes de fijar umbrales.
