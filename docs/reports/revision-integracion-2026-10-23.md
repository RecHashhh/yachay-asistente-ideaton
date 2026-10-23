# Cierre de integración — 23 de octubre de 2026

Se revisaron los registros locales de Claude y su copia `ci-adopcion`, los cambios pendientes de presentación en kichwa y los aportes de `origin/main`. Se integraron las mejoras del Portal (Inicio, guías, historial de validación y consumo), las rutas geográficas y la telemetría. La copia de trabajo de Claude permanece independiente.

## Correcciones

- Las sugerencias aparecen en la última respuesta, sin preguntas ya realizadas ni duplicados por tildes, signos o espacios. Las sugerencias personales respetan el idioma seleccionado.
- Las tarjetas y seguimientos en kichwa conservan el original español. Se rechazan traducciones con números, correos, enlaces o estructura alterados; si la traducción falla se conserva el texto fuente. No se cambian revisiones, acciones, fechas ni evidencia. El consumo de traducción se registra y respeta el interruptor y presupuesto.
- El clasificador de intención respeta el presupuesto y registra tokens. El catálogo del agente conserva identificadores, títulos y vigencias con descripciones de hasta 200 caracteres; no se reduce el contenido de las fuentes consultadas.
- La búsqueda de mapas busca nombres antes de usar una categoría aproximada: «Bloque A» ya no se trata únicamente como «bloque». Se actualizaron los nombres de prueba al OSM vigente.
- Las pruebas asíncronas funcionan también en Windows. Mapas vuelve a ser un requisito obligatorio del CI.
- El informe distingue la estimación inicial del costo y la extrapolación de la medición reportada por Claude. No se atribuye un ahorro nuevo al catálogo sin medirlo.

## Validación local

| Comprobación | Resultado |
| --- | --- |
| Backend, `python -m pytest -q` | 183 pasan; 1 omitida |
| Filtros, `python -m app.filter_cases` | 113/113 correctos |
| Frontend, `npm test` | 36 pasan; 5 omitidas que requieren integración |
| Frontend, tipos y build | Correctos |
| Navegador Chrome | Mapa y sugerencias correctos; prueba de rutas con stack real omitida por configuración |
| Mapas, Linux + PostGIS/pgRouting en base aislada | 56 pasan |

Las pruebas de traducción usan respuestas simuladas: verifican integridad y fallback, no calidad lingüística. La validación humana del kichwa y una nueva medición de exactitud y costo con el catálogo compacto siguen siendo evaluaciones posteriores; no se presenta una medición nueva ni una aprobación lingüística.
