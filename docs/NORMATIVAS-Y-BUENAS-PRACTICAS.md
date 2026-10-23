# Yachi: referencias normativas, controles aplicados y buenas prácticas

**Proyecto:** Asistente institucional Yachay Tech — Yachi.

**Fecha de revisión:** 22 de octubre de 2026.

**Alcance:** prototipo, código y evidencias de pruebas disponibles en el repositorio.

**Estado:** marco técnico de referencia y matriz de aplicación parcial; sin certificación ISO ni declaración de cumplimiento legal integral.

## 1. Declaración para compartir o presentar

> Yachi aplica buenas prácticas de ingeniería de software y controles técnicos de calidad, seguridad, privacidad y transparencia. El proyecto adopta como referencias ISO/IEC 25010:2023, ISO/IEC 27001:2022, ISO/IEC 27701:2025 e ISO/IEC 42001:2023 para organizar la evaluación y mejora de estos controles. Su aplicación se sustenta en código, pruebas y documentación trazables. En protección de datos, incorpora medidas orientadas a atender la LOPDP de Ecuador, sujetas a validación institucional y jurídica. La correspondencia documentada es parcial: no equivale a certificación ISO, implementación completa de sistemas de gestión ni acreditación de cumplimiento integral de la ley.

**Versión breve para una diapositiva:**

> Aplicamos controles verificables de calidad, seguridad, privacidad e IA responsable, tomando las normas ISO como referencias técnicas y la LOPDP como marco legal aplicable. Documentamos la evidencia y las brechas pendientes, sin afirmar certificaciones.

La adopción de estas referencias queda documentada a partir de esta revisión. No se atribuye retroactivamente a todas las decisiones anteriores del proyecto ni representa aprobación oficial de la universidad.

## 2. Qué significa aplicar estas referencias

Se distinguen tres niveles:

1. **Control implementado:** existe una medida concreta en el código y se identifica su evidencia. Por ejemplo, consultas SQL parametrizadas o vencimiento de sesiones.
2. **Referencia adoptada:** se utiliza un marco para organizar objetivos, riesgos y evaluaciones. La relación indicada en este documento es una interpretación técnica del equipo, sin evaluación exhaustiva de cláusulas.
3. **Conformidad integral o certificación:** requiere evidencia de todos los requisitos aplicables y, cuando se afirma certificación, el proceso correspondiente. Este documento no acredita ese nivel.

Las descripciones ISO se contrastaron con sus fichas oficiales públicas. No se presenta una auditoría del articulado completo de las normas ni una declaración de aplicabilidad formal de ISO/IEC 27001.

## 3. Referencias y aplicación en el proyecto

| Referencia | Propósito del marco | Aplicación concreta en Yachi | Alcance pendiente |
| --- | --- | --- | --- |
| [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) | Modelo para especificar y evaluar calidad de productos de software y TIC. | Pruebas de funciones, revisión de respuestas, manejo de errores, evaluación de interfaz y separación de componentes. | Completar objetivos medibles de calidad, pruebas de carga y evaluación de accesibilidad y uso con personas. |
| [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) | Requisitos de un sistema de gestión de seguridad de la información. | Acceso protegido al portal, sesiones con vencimiento, bitácora y límites de uso; secretos fuera del código versionado. | Gestión institucional de riesgos, políticas, responsabilidades, incidentes, continuidad y evaluación formal del sistema de gestión. |
| [ISO/IEC 27701:2025](https://www.iso.org/standard/27701) | Requisitos y orientación para gestionar privacidad y responsabilidades sobre datos personales. | Aviso de datos, reducción de identificadores en preguntas, reglas de conservación y retiro del consentimiento en el navegador. | Validar responsables, tratamientos, bases jurídicas, contratos, transferencias y procedimientos de ejercicio de derechos. |
| [ISO/IEC 42001:2023](https://www.iso.org/standard/42001) | Requisitos de un sistema de gestión de IA. | Declaración del uso de IA, fuentes en respuestas, pruebas de contenido, reportes de traducción y distinción entre borradores y contenido revisado. | Gobierno institucional de IA, responsables designados, gestión del ciclo de vida y seguimiento formal de riesgos. |

ISO/IEC 27001, 27701 y 42001 abarcan sistemas de gestión organizacionales: añadir controles al software no implementa por sí solo esos sistemas.

Como referencias complementarias se utilizan:

- **[OWASP Top 10 para aplicaciones con LLM e IA generativa, edición 2025](https://genai.owasp.org/llm-top-10/):** clasificación de riesgos para revisar exposición de datos, manipulación de instrucciones, información incorrecta y consumo de recursos. Los filtros y pruebas reducen riesgos; no garantizan inmunidad.
- **[WCAG 2.2 del W3C](https://www.w3.org/TR/WCAG22/):** referencia de accesibilidad para revisar teclado, foco, etiquetas, diálogos y movimiento. Las revisiones automatizadas y los recorridos actuales no acreditan conformidad completa con el nivel AA.

## 4. Matriz de controles y evidencias

Las rutas enlazan a archivos del repositorio. Su existencia permite revisar la implementación, pero no prueba por sí sola su eficacia en producción.

| ID | Práctica o control aplicado | Evidencia del proyecto | Relación técnica y límites |
| --- | --- | --- | --- |
| CAL-01 | Separación de interfaz, API, reglas, recuperación y voz. | [Frontend](../web/src/), [backend](../api/app/), [reglas](../api/app/rules.py). | Mantenibilidad y evaluación de calidad, relacionadas con ISO/IEC 25010. |
| CAL-02 | TypeScript en modo estricto y comprobación de tipos durante la compilación. | [tsconfig.json](../web/tsconfig.json), [package.json](../web/package.json). | Prevención de determinados errores; no demuestra ausencia de defectos. |
| CAL-03 | Validación de entradas y límites de longitud y formato. | [main.py](../api/app/main.py), [schemas.py](../api/app/schemas.py), [kichwa_speech.py](../api/app/kichwa_speech.py). | Controles de robustez; revisar cada nuevo endpoint. |
| CAL-04 | Pruebas de regresión, integración y navegación. | [Pruebas API](../api/tests/), [Playwright](../web/e2e/), [auditoría multilingüe](../api/scripts/audit_multilingual.py). | Calidad evaluada sobre casos y versiones concretas. |
| SEG-01 | Configuración y secretos mediante variables de entorno; exclusión de `.env` del repositorio. | [.gitignore](../.gitignore), [config.py](../api/app/config.py). | Reduce exposición accidental. No garantiza que nunca se haya filtrado un secreto ni sustituye su rotación. |
| SEG-02 | Parámetros separados de valores en consultas SQL. | [main.py](../api/app/main.py), [rules.py](../api/app/rules.py). | Mitigación de inyección SQL en las consultas revisadas. |
| SEG-03 | Autenticación administrativa, comparación segura de contraseña, hash del token, vencimiento y cierre de sesión. | [main.py](../api/app/main.py), [esquema de administración](../api/sql/03_admin.sql). | Controles de acceso relacionados con seguridad. La autenticación institucional y MFA son trabajo de despliegue pendiente. |
| SEG-04 | Límites por sesión/IP y bloqueo temporal de intentos fallidos de acceso. | [config.py](../api/app/config.py), [filters.py](../api/app/filters.py), [main.py](../api/app/main.py). | Reduce abuso y consumo descontrolado; no acredita resistencia completa frente a denegación de servicio. |
| SEG-05 | Registro de acciones administrativas. | [main.py](../api/app/main.py), [03_admin.sql](../api/sql/03_admin.sql). | Trazabilidad; falta evaluar protección, acceso y conservación de registros en el despliegue final. |
| PRI-01 | Aviso de uso de datos previo al chat y opción de retirar consentimiento. | [ConsentDialog.tsx](../web/src/components/ConsentDialog.tsx), [config.ts](../web/src/config.ts). | Implementado técnicamente, con contenido institucional y jurídico pendiente de validación. |
| PRI-02 | Reducción de determinados identificadores y tratamiento especial de mensajes sensibles. | [filters.py](../api/app/filters.py), [graph.py](../api/app/graph.py). | Los patrones no detectan todos los datos personales. No se acredita anonimización irreversible. |
| PRI-03 | Depuración programada de determinadas tablas y conservación limitada. | Función `purge` en [main.py](../api/app/main.py), [config.py](../api/app/config.py), [01_esquema.sql](../api/sql/01_esquema.sql). | Existen reglas técnicas; los plazos deben justificarse y verificarse en la configuración y operación finales. |
| PRI-04 | Audio Kichwa procesado por los modelos del servidor sin rutina de persistencia del audio en estos endpoints. | [kichwa_speech.py](../api/app/kichwa_speech.py), [kichwa_tts.py](../api/app/kichwa_tts.py). | Revisar también proxy, infraestructura y registros. ES/EN usan reconocimiento del navegador, con un flujo distinto. |
| IA-01 | Recuperación de documentos y presentación de fuentes; rutas de respuesta sin información suficiente. | [graph.py](../api/app/graph.py), [yachi_retriever.py](../api/app/yachi_retriever.py). | Trazabilidad y reducción de respuestas sin respaldo; una cita no garantiza relevancia ni exactitud. |
| IA-02 | Aclaraciones ante determinadas solicitudes ambiguas y conservación de seguimientos de trámites. | [rules.py](../api/app/rules.py), [test_clarifications.py](../api/tests/test_clarifications.py). | Evita adivinar algunas intenciones. La ampliación ES/EN fue verificada; Kichwa sigue pendiente. |
| IA-03 | Declaración de uso de IA y estado experimental de traducciones. | [DECLARACION-IA.md](DECLARACION-IA.md), [memoria lingüística](../api/app/kichwa.py). | Transparencia; mantener la documentación actualizada con las pruebas y revisiones posteriores. |
| IA-04 | Reportes de traducción separados del conocimiento aprobado. | [07_translation_reports.sql](../api/sql/07_translation_reports.sql), [TranslationReport.tsx](../web/src/components/TranslationReport.tsx). | Se reciben como pendientes de revisión; no equivalen a aprendizaje ni aprobación automática. |
| ACC-01 | Gestión de foco, diálogo de voz, teclado y alternativas de texto. | [VoiceMode.tsx](../web/src/components/VoiceMode.tsx), [ConsentDialog.tsx](../web/src/components/ConsentDialog.tsx), [speech.ts](../web/src/lib/speech.ts). | Referencia WCAG; requiere evaluación manual y con tecnologías de asistencia. |

## 5. Protección de datos personales: marco y situación

El marco legal es la **LOPDP de Ecuador**, su Reglamento General y la normativa secundaria de la SPDP aplicable al tratamiento. La ley contempla bases de legitimación, principios, información al titular, derechos y medidas de protección. La aceptación de un aviso no sustituye el análisis de las demás obligaciones. El artículo 12 regula la información al titular. Véanse el [texto de la ley publicado en gob.ec](https://www.gob.ec/sites/default/files/regulations/2025-01/01%20Ley%20Org%C3%A1nica%20de%20Protecci%C3%B3n%20de%20Datos%20Personales.pdf) y el [marco normativo de la SPDP](https://www.spdp.gob.ec/docs/proteccion-de-datos-personales/general/normativa/).

### Medidas observadas y brechas

| Aspecto del prototipo | Estado observado | Pendiente para su uso institucional |
| --- | --- | --- |
| Responsable y delegado | Los datos del aviso están marcados como provisionales en `config.ts`. | Confirmar identidad, contactos y responsabilidades con la universidad. No presentar un correo provisional como canal oficial validado. |
| Finalidad y base jurídica | El aviso describe finalidades y utiliza consentimiento como base declarada. | Validar la base correspondiente a cada tratamiento y cómo se acredita, incluida cualquier finalidad adicional. |
| Minimización | Se ocultan determinados patrones de datos personales antes de parte del procesamiento. | Revisar todos los canales, reportes, formularios y registros; el texto libre aún puede identificar personas. |
| Conservación | Configuración predeterminada de 365 días para determinados registros; consultas a oficinas con vencimiento de 90 días; depuración de bitácora administrativa a dos años. | Son decisiones del prototipo, no plazos impuestos por la LOPDP. Justificar necesidad, revisar excepciones y comprobar eliminación efectiva, copias y configuración desplegada. |
| Reportes de traducción | Tabla separada con fecha y estado pendiente de revisión. | Definir plazo, responsables, acceso y eliminación; no hay una depuración equivalente de esta tabla en `purge`. |
| Retiro del consentimiento | Borra determinados datos del navegador. | No equivale a borrar registros del servidor ni de proveedores; completar un procedimiento para solicitudes sobre esos datos. |
| Proveedor de IA y transferencias | El aviso contiene una afirmación contractual sobre tratamiento internacional y uso de datos. | Verificar contratos, destinatarios, ubicaciones y garantías antes de sostener esa afirmación como hecho. |
| Voz | Kichwa usa modelos del servidor; ES/EN, servicios del navegador. | Actualizar el aviso general para explicar ambos flujos. No afirmar que todo el audio se queda en el dispositivo. |
| Ejercicio de derechos | El aviso enumera derechos y propone un contacto. | Validar el canal y documentar recepción, verificación, respuesta y ejecución de solicitudes. |
| Seguridad operativa | Existen controles en el código. | Verificar HTTPS, acceso a base de datos, copias, restauración, gestión de secretos e incidentes en el entorno final. |

Estas brechas impiden presentar este documento como validación legal integral. El marco ISO voluntario tampoco sustituye las obligaciones legales aplicables al tratamiento real.

## 6. Cómo se aplica el marco durante el desarrollo

Para este prototipo se establece el siguiente procedimiento técnico de revisión:

1. **Identificar el cambio:** función afectada, datos tratados y riesgo introducido.
2. **Relacionarlo con controles:** usar los IDs de la matriz y explicar qué control se implementa o modifica.
3. **Verificarlo:** ejecutar pruebas adecuadas al cambio y registrar entorno, fecha, alcance y resultado. Para respuestas, revisar utilidad y fuentes además del resultado HTTP.
4. **Registrar límites:** distinguir resultados observados, simulaciones y aspectos no evaluados. Una traducción automática no se marca como validada por un hablante.
5. **Mantener las brechas:** cerrar un pendiente solo con evidencia y actualizar el aviso si cambia el tratamiento de datos.
6. **Revisar antes de desplegar:** confirmar las condiciones institucionales y operativas de la sección anterior. Una publicación de código en Git no representa autorización institucional para tratar datos.

Responsabilidades funcionales a asignar por el equipo: desarrollo mantiene los controles y pruebas; revisión técnica comprueba evidencias; revisión de contenido verifica fuentes y traducciones; la universidad determina responsables y validación jurídica. Este documento no designa cargos institucionales ni acredita que esas revisiones ya se hayan efectuado.

### Criterios de aceptación que pueden comprobarse

- Una solicitud genérica ES/EN obtiene aclaración; una consulta concreta y un seguimiento conservan su intención.
- Una ubicación utiliza coordenadas conocidas y ofrece un enlace válido; no se deducen recorridos accesibles de un plano esquemático.
- Una respuesta sin respaldo no inventa requisitos, fechas o montos; se revisa relevancia de las fuentes presentadas.
- Cancelar o salir de voz no reactiva una captura antigua ni mantiene pistas de micrófono activas.
- Los errores de conexión o guardado permiten recuperar la interacción sin mostrar una confirmación falsa.
- Los secretos y documentos confidenciales no se incorporan a commits ni evidencias públicas.
- Los cambios de datos personales incluyen revisión de aviso, conservación, acceso y eliminación.

Son criterios del proyecto para evaluar controles seleccionados; no son una transcripción de requisitos ISO.

## 7. Evidencia de pruebas y límites conocidos

Las verificaciones del 22 de octubre de 2026 incluyen:

- **Aclaraciones:** 30 casos nuevos; la suite del backend registró 107 pruebas aprobadas y una omitida. [Evidencia de recorrido real ES/EN](kichwa-alki-2026-10-22/prueba-aclaraciones.json).
- **Auditoría multilingüe:** 27 consultas reales de API y nueve desde la página; se registraron diferencias de calidad y cobertura. [Resultados API](kichwa-alki-2026-10-22/auditoria-multilingue.json), [recorrido real](kichwa-alki-2026-10-22/auditoria-chat-real.json).
- **Voz:** ciclos de navegador con reconocimiento, síntesis y respuestas simuladas; además, prueba real de síntesis y transcripción Kichwa con una frase sintética. [Ciclos](kichwa-alki-2026-10-22/auditoria-ciclo-voz.json), [audio real](kichwa-alki-2026-10-22/auditoria-audio-real.json).
- **Pendientes de producto:** Kichwa incompleto, cobertura de inasistencias y errores de transcripción. [Revisión funcional y brechas](kichwa-alki-2026-10-22/revision-funcional-multilingue.json).

Estos resultados corresponden al código, datos y entorno probados. No son porcentajes de cumplimiento normativo ni una garantía para otros despliegues. Las pruebas con voz sintética no validan pronunciación, comprensión de hablantes ni micrófono físico. Las respuestas institucionales completas de la auditoría se conservaron localmente fuera de Git.

## 8. Formulaciones que se pueden sostener

| Formulación | Evaluación |
| --- | --- |
| «Aplicamos consultas parametrizadas, validación de entradas, controles de sesión y pruebas de regresión». | Sostenible con los archivos y pruebas de la matriz. |
| «Adoptamos ISO/IEC 25010 como referencia para organizar nuestra evaluación de calidad». | Sostenible en el alcance técnico documentado aquí. |
| «Documentamos controles relacionados con seguridad, privacidad e IA responsable tomando ISO/IEC 27001, 27701 y 42001 como referencias». | Sostenible como correspondencia parcial, sin afirmar implementación completa de sistemas de gestión. |
| «Implementamos medidas orientadas a la protección de datos y tenemos pendientes de validación frente a la LOPDP». | Refleja el estado observado. |
| «Yachi está certificado ISO» o «cumple completamente todas estas normas». | No sustentado. |
| «Cumplimos integralmente la LOPDP», «todos los datos son anónimos» o «eliminar el chat borra todos los datos». | No sustentado por la implementación revisada. |
| «Las respuestas con citas siempre son correctas» o «el Kichwa está validado». | No sustentado; existen límites de contenido e idioma documentados. |

## 9. Fuentes y mantenimiento

Las fuentes oficiales están enlazadas en las secciones 3 y 5; fueron consultadas el 22 de octubre de 2026. La evidencia de implementación es propia del proyecto. Mantener separados ambos tipos de respaldo: una ficha ISO explica el marco; el código y las pruebas permiten examinar nuestros controles.

Este documento se actualiza cuando cambian los flujos de datos, modelos, proveedores, autenticación, plazos o pruebas. Antes de reutilizarlo como declaración institucional, deben validarse responsables, alcance y pendientes con las áreas competentes.
