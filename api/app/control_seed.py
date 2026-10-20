"""Set de control inicial con preguntas reales sobre el corpus del Día 1.

`expect`: id(s) de documento separados por `|` (basta con citar uno), 'no_se' (debe responder "sin información"),
'aclaracion' (debe pedir precisar). El equipo debe revisar cada respuesta esperada contra el documento y ampliar el set a ≥100.
"""

import psycopg

SEED = [
    ("R01", "¿Cuándo es la recepción de solicitudes de cambio de carrera para 2026SEM02?", "es", "cambios_de_carrera_2026sem02"),
    ("R02", "When can I apply for a change of major for 2026SEM02?", "en", "cambios_de_carrera_2026sem02"),
    ("R03", "¿Cómo solicito una tercera matrícula?", "es", "instructivo_solicitud_de_tercera_matricula_2026sem02|informacion_terceras_matriculas_2026sem02"),
    ("R04", "How do I request a third enrollment?", "en", "instructivo_solicitud_de_tercera_matricula_2026sem02|informacion_terceras_matriculas_2026sem02"),
    ("R05", "¿Cómo me retiro de una carrera?", "es", "procedimiento_de_retiro_de_estudiantes_de_carrera_v4_0|instructivo_retiro_carrera_14_03_2025"),
    ("R06", "¿Qué necesito para reingresar a la universidad en 2026SEM02?", "es", "informacion_reingresos_2026sem02"),
    ("R07", "¿Cómo solicito un certificado académico?", "es", "procedimiento_de_emision_de_certificados_y_reposicion_de_titulos_v2_0"),
    ("R08", "¿Qué normas hay en las residencias universitarias?", "es", "reglamento_residencias"),
    ("R09", "What are the rules in the student residences?", "en", "reglamento_residencias"),
    ("R10", "¿Qué servicios ofrece la biblioteca?", "es", "guia_de_servicios_biblioteca|biblioteca"),
    ("R11", "¿Qué clubes estudiantiles hay?", "es", "clubes_estudiantiles_a67f1cc402"),
    ("R12", "What student clubs are there?", "en", "clubes_estudiantiles_a67f1cc402"),
    ("R13", "¿Cómo presento una demanda estudiantil a la FEYT?", "es", "representatividad_estudiantil_y_canales_de_participacion"),
    ("R14", "¿Cuántos representantes estudiantiles hay ante el Consejo Superior Universitario?", "es", "representatividad_estudiantil_y_canales_de_participacion|reglamento_general_de_funcionamiento_de_organos_de_cogobierno_rcsu_so_006_no_028"),
    ("R15", "¿Cómo cambio mi clave de D2L?", "es", "faq_registros_academicos"),
    ("R16", "¿Qué formato debe tener el trabajo de titulación de pregrado?", "es", "formato_entrega_trabajo_de_titulacion_pregrado"),
    ("R17", "¿Cómo aviso un siniestro o accidente para el seguro?", "es", "formulario_de_aviso_de_siniestro"),
    ("R18", "¿Cuándo empiezan las clases del período 2026SEM02?", "es", "calendario_academico_2026sem02"),
    ("R19", "When do classes start in 2026SEM02?", "en", "calendario_academico_2026sem02"),
    ("R20", "¿Cómo me cambio de otra universidad a Yachay Tech?", "es", "informacion_cambio_de_ies_2026sem02"),
    ("R21", "¿Qué servicios de bienestar universitario hay?", "es", "bienestar_universitario"),
    ("R22", "¿Cómo funciona el programa de inglés?", "es", "programa_de_ingles_42e9c20a72"),
    ("R23", "¿Qué hago para hacer prácticas preprofesionales?", "es", "practicas_pre_profesionales_06a972fc59|reglamento_de_regimen_academico_ces"),
    ("R24", "¿Dónde queda el aula A13?", "es", "distribucion_aulas"),
    ("R25", "Where is classroom B101?", "en", "distribucion_aulas"),
    ("R26", "¿Cuál es el horario de la biblioteca?", "es", "puntos_importantes_universidad"),
    ("R27", "¿Dónde queda el centro de salud?", "es", "puntos_importantes_universidad"),
    ("R35", "¿Qué tipos de becas ofrece Yachay Tech?", "es", "becas_tipos_y_requisitos|reglamento_de_becas_y_ayudas_economicas"),
    ("R36", "What are the requirements for the academic excellence scholarship?", "en", "becas_tipos_y_requisitos|reglamento_de_becas_y_ayudas_economicas"),
    ("R37", "¿A qué hora sale el bus de Ibarra a la universidad?", "es", "horario_de_buses_2026"),
    ("R38", "What time does the bus leave campus for Ibarra?", "en", "horario_de_buses_2026"),
    ("R39", "¿Cuánto cuesta la inscripción a la Maestría en Ciencia de Datos?", "es", "instructivo_de_postulacion"),
    ("R40", "¿Qué puntaje necesito para cambiarme a Computación?", "es", "cambios_de_carrera_2026sem02|informacion_cambio_de_ies_2026sem02"),
    ("R28", "¿Qué clima hará mañana en Urcuquí?", "es", "no_se"),
    ("R29", "Recomiéndame una película", "es", "no_se"),
    ("R30", "Tell me a joke", "en", "no_se"),
    ("R31", "¿Cuál es la contraseña del wifi del campus?", "es", "no_se"),
    ("R32", "Residencias", "es", "aclaracion"),
    ("R33", "labs", "en", "aclaracion"),
    ("R34", "matrícula", "es", "aclaracion"),
]


def seed_control(c: psycopg.Connection) -> None:
    for cid, q, lang, expect in SEED:
        c.execute(
            "INSERT INTO control_cases (id, q, lang, expect, source) VALUES (%s,%s,%s,%s,'equipo') ON CONFLICT (id) DO UPDATE SET q=EXCLUDED.q, lang=EXCLUDED.lang, expect=EXCLUDED.expect",
            (cid, q, lang, expect),
        )
    print(f"Set de control: {len(SEED)} preguntas reales.")
