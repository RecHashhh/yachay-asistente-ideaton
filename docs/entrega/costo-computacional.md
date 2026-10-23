# Costo computacional de Yachi: estimación, medición y reducción

Documento de trabajo del equipo. Reúne la estimación analítica, el costo medido con el sistema real, las optimizaciones aplicadas y las medidas propuestas. Las cifras de la pestaña **Portal → Costo** salen de la misma tabla (`llm_usage`) y se actualizan solas; este documento fija las mediciones usadas en el paper y en la presentación.

## 1. Resumen

| Escenario | USD por consulta | Modelo al mes | Total al mes |
|---|---|---|---|
| Estimación analítica (calculadora) | 0,0003 | 6 | 54 |
| Medido, línea base (22-10-2026) | 0,0047 | 76 | 124 |
| Medido, optimizado (23-10-2026, versión integrada) | 0,0025 | 41 | 89 |

Proyección con 540 consultas diarias (1.800 estudiantes × 0,3 consultas) y un servidor de USD 48 al mes. El costo del modelo nunca supera el tope configurado en `ANTHROPIC_BUDGET_USD`: al alcanzarlo, el chat sigue funcionando en modo sin modelo.

## 2. Precios usados

| Concepto | Valor | Fuente |
|---|---|---|
| Claude Haiku 5.5, entrada | USD 0,10 por millón de tokens | platform.claude.com/docs/en/about-claude/pricing (20-10-2026) |
| Claude Haiku 5.5, salida | USD 0,50 por millón de tokens | ídem |
| Lectura de caché de prompt | 10 % del precio de entrada | ídem |
| Escritura de caché de prompt | 125 % del precio de entrada | ídem |
| Servidor 4 vCPU / 8 GB (API, PostgreSQL + pgvector, embeddings locales) | USD 48 al mes | digitalocean.com/pricing/droplets (20-10-2026) |

Los embeddings se calculan en el servidor con un modelo local de 384 dimensiones, por lo que buscar no tiene costo por llamada.

## 3. Estimación analítica

C = C_infra + 30 · S · q · (1 − h) · c_m + C_caché

| Supuesto | Valor |
|---|---|
| S, estudiantes | 1.800 |
| q, consultas por estudiante al día | 0,3 |
| h, consultas resueltas sin modelo | 0,3 |
| c_m, costo por consulta con modelo | una llamada con 4 fragmentos de 500 tokens, 400 de historial y 300 de respuesta |
| Resultado | USD 0,0003 por consulta, USD 54 al mes |

El supuesto de una sola llamada por consulta resultó incorrecto: la arquitectura real hace varias llamadas (sección 4).

## 4. Medición de la línea base

**Método.** Se ejecutó el set de control (preguntas reales de trámites, normativa, servicios y lugares, en español e inglés) contra el sistema completo con la clave activa. Cada llamada al modelo registró sus tokens de entrada, salida y caché en `llm_usage`. El costo por consulta es el gasto total dividido entre todas las consultas procesadas, incluidas las que no llaman al modelo.

**Resultado (22-10-2026, 109 consultas):**

| Componente | Llamadas | Tokens de entrada | Tokens de salida | Lectura de caché | Costo USD | Parte del gasto |
|---|---|---|---|---|---|---|
| Agente (elegir documentos y buscar) | 259 | 4.185.008 | 52.514 | 0 | 0,4448 | 87 % |
| Redacción de la respuesta | 83 | 479.156 | 9.633 | 0 | 0,0647 | 13 % |
| **Total** | 342 | 4.664.164 | 62.147 | 0 | **0,5095** | 100 % |

- Costo por consulta: **USD 0,0047** (USD 0,0061 por respuesta redactada con modelo).
- El 24 % de las consultas se respondió sin llamar al modelo (lugares, guías de trámite, aclaraciones, fuera del ámbito).
- El agente hace en promedio 2,4 llamadas por consulta con modelo, con unos 16.000 tokens de entrada cada una.

**Diagnóstico.** En cada paso el agente reenvía el catálogo completo de 75 documentos (unos 11.000 tokens, con URL, tipo y descripciones largas) y la caché no se aprovechaba.

## 5. Optimizaciones aplicadas

| Medida | Qué cambia | Efecto sobre la exactitud |
|---|---|---|
| Catálogo compacto | El agente recibe solo id, título, descripción de hasta 200 caracteres y vigencia: unos 6.200 tokens en lugar de 11.000 | No cambia las fuentes consultadas ni los fragmentos que se le entregan al modelo |
| Caché de prompt en el ciclo del agente | Lo ya enviado en un paso se relee en el siguiente al 10 % del precio | Ninguno |
| Registro y tope del clasificador de intención | El clasificador que decide si la consulta es de mapa o de documentos se cuenta en el costo y respeta el tope | Ninguno |

**Resultado (23-10-2026, 119 consultas):**

| Componente | Llamadas | Tokens de entrada | Lectura de caché | Costo USD |
|---|---|---|---|---|
| Agente (elegir documentos y buscar) | 271 | 1.723.592 | 1.346.905 | 0,2136 |
| Redacción de la respuesta | 87 | 512.258 | 3.208 | 0,0692 |
| Clasificador de intención | 93 | 92.201 | 0 | 0,0146 |
| **Total** | 451 | 2.328.051 | 1.350.113 | **0,2975** |

- Costo por consulta: **USD 0,0025** (reducción de 47 % respecto de la línea base).
- Exactitud de la misma corrida: **91,6 % (109/119, versión integrada con clasificador de intención, mapas y correos; inglés 26/26)**.

## 6. Proyección mensual

| Escenario | Consultas al día | USD por consulta | Modelo al mes | Total al mes |
|---|---|---|---|---|
| Estimado, normal | 540 | 0,0003 | 6 | 54 |
| Medido línea base, normal | 540 | 0,0047 | 76 | 124 |
| Medido línea base, matrículas (×4) | 2.160 | 0,0047 | 303 | 351 |
| Medido optimizado, normal | 540 | 0,0025 | 41 | 89 |
| Medido optimizado, matrículas (×4) | 2.160 | 0,0025 | 162 | 210 |

## 7. Medidas propuestas para seguir bajando el costo

Ordenadas por ahorro esperado frente a esfuerzo. Ninguna está aplicada todavía; cada una debe medirse con el set de control antes de darla por buena.

| Medida | Cómo funciona | Ahorro esperado | Riesgo |
|---|---|---|---|
| Catálogo fijo en el prompt del sistema | El catálogo deja de ser resultado de una herramienta y pasa al prompt del sistema con caché: se comparte entre estudiantes durante 5 minutos y se elimina una llamada por consulta | Alto | Bajo; requiere ajustar las pruebas del agente |
| Saltar el agente en preguntas claras | Si la búsqueda directa devuelve un fragmento con similitud alta, se redacta sin pasar por el agente | Alto en preguntas sencillas | Medio; puede bajar la exactitud en preguntas de varias partes |
| Caché de respuestas frecuentes | Las preguntas de tendencia se responden con la última respuesta verificada mientras sus documentos sigan vigentes | Medio | Bajo, si se invalida al cambiar un documento |
| Más guías de trámite | Cada trámite convertido en guía se responde sin modelo | Medio | Bajo; requiere curaduría |
| Bajar el máximo de llamadas del agente (6 a 4) | Limita las búsquedas repetidas | Bajo | Medio |

## 8. Cómo repetir la medición

1. Con la clave activa, abrir **Portal → Validación** y pulsar «Evaluar».
2. Al terminar, **Portal → Costo** muestra el gasto real, el costo por consulta y la proyección mensual con los supuestos de la calculadora.
3. Para el detalle por componente: `SELECT source, count(*), sum(input_tokens), sum(cache_tokens), sum(output_tokens), sum(cost_usd) FROM llm_usage WHERE at >= '<inicio>' GROUP BY source;`

## 9. Pendientes

- Repetir la medición en la infraestructura de despliegue y con preguntas reales de estudiantes (el set de control tiene más preguntas de documentos que el uso típico, donde abundan lugares y guías sin costo).
- Cotizar el servidor con TIC de la universidad.
- Medir la medida «catálogo fijo en el prompt del sistema».
