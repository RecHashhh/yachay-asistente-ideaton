"""Oficina a la que derivar cuando no hay información oficial.

Solo contactos institucionales (no personales) que aparecen en el corpus; cada uno indica su documento de origen.
Se elige por palabras de la pregunta; si ninguna coincide, por el tema del documento más cercano; si no, Secretaría General.
Antes (solo por tema) "¿cómo me conecto al wifi?" derivaba a la FEYT porque el fragmento más cercano era de representación.
"""

import re

from .rules import norm

# id → (oficina es, oficina en, correo, teléfono, documento de origen)
OFFICES: dict[str, tuple[str, str, str | None, str | None, str]] = {
    "academico": ("Dirección de Servicios Académicos", "Academic Services Office", "soporteacademico@yachaytech.edu.ec", None,
                  "procedimiento_de_retiro_de_estudiantes_de_carrera_v4_0"),
    "bienestar": ("Dirección de Bienestar Universitario", "Student Wellbeing Office", "bienestarestudiantil@yachaytech.edu.ec", "(06) 2 999 500 ext. 2503",
                  "bienestar_universitario"),
    "salud": ("Centro Médico (Bienestar Universitario)", "Medical Center (Student Wellbeing)", "centromedico@yachaytech.edu.ec", "(06) 2 999 500 ext. 2505",
              "bienestar_universitario"),
    "psicologia": ("Psicología (Bienestar Universitario)", "Psychology service (Student Wellbeing)", "psicologia@yachaytech.edu.ec", None, "bienestar_universitario"),
    "becas": ("Trabajo Social (Bienestar Universitario)", "Social Work (Student Wellbeing)", "trabajosocial@yachaytech.edu.ec", "(06) 2 999 500 ext. 2713",
              "bienestar_universitario"),
    "residencias": ("Promoción de la Vida Comunitaria (Bienestar Universitario)", "Community Life (Student Wellbeing)", "vidacomunitaria@yachaytech.edu.ec", None,
                    "bienestar_universitario"),
    "derechos": ("Consejería de Derechos (Bienestar Universitario)", "Rights Counselling (Student Wellbeing)", "consejeriadederechos@yachaytech.edu.ec", None,
                 "bienestar_universitario"),
    "biblioteca": ("Biblioteca", "Library", "bibliotecayachaytech@yachaytech.edu.ec", "(06) 2 999 500 ext. 2517", "biblioteca"),
    "posgrado": ("Posgrados", "Graduate Studies", "posgrados@yachaytech.edu.ec", None, "posgrado_e842f9ffba"),
    "ingles": ("Programa de Inglés", "English Program", "english@yachaytech.edu.ec", None, "programa_de_ingles_42e9c20a72"),
    "vinculacion": ("Vinculación con la Sociedad", "Community Outreach", "vinculacion@yachaytech.edu.ec", None, "plan_integral_de_vinculacion_con_la_sociedad_uitey_2024_2027"),
    "tic": ("Dirección de Tecnologías de la Información y Comunicación", "Information Technology Office", None, None, "pedi_yachay_tech_2026_2029"),
    "representacion": ("Federación de Estudiantes de Yachay Tech (FEYT)", "Yachay Tech Student Federation (FEYT)", None, None,
                       "representatividad_estudiantil_y_canales_de_participacion"),
    "general": ("Secretaría General", "General Secretariat", None, None, ""),
}

# Palabras de la pregunta (sin tildes) → oficina. El orden importa: lo más específico primero.
KEYWORDS: list[tuple[str, re.Pattern]] = [(k, re.compile(p)) for k, p in [
    ("tic", r"\b(wifi|wi fi|internet|red inalambrica|correo institucional|contrasena|clave|d2l|brightspace|plataforma|sistema academico|cuenta institucional|password|email account)\b"),
    ("psicologia", r"\b(psicolog\w*|salud mental|ansiedad|depresion|estres|mental health)\b"),
    ("derechos", r"\b(acoso|violencia|discrimina\w*|harass\w*|abuso)\b"),
    ("salud", r"\b(medic\w*|enfermer\w*|salud|doctor|dentista|odontolog\w*|dispensario|vacuna\w*|health|clinic|dentist)\b"),
    ("becas", r"\b(becas?|ayudas? economicas?|scholarships?|financial aid)\b"),
    ("residencias", r"\b(residencias?|dormitorio\w*|housing|dorms?|vida comunitaria)\b"),
    ("biblioteca", r"\b(bibliotecas?|libros?|prestamo de libros|library|books?)\b"),
    ("posgrado", r"\b(posgrados?|maestria\w*|doctorado\w*|postgrad\w*|master\w*|phd)\b"),
    ("ingles", r"\b(ingles|english|toefl|suficiencia)\b"),
    ("vinculacion", r"\b(vinculacion|practicas comunitarias|servicio comunitario|outreach)\b"),
    ("representacion", r"\b(feyt|federacion|representante\w*|cogobierno|elecciones estudiantiles)\b"),
    ("academico", r"\b(matricula\w*|retiro|retirarme|certificado\w*|record|notas|calificacion\w*|cambio de carrera|tercera|reingreso|titulo|titulacion|"
                  r"enrol\w*|withdraw\w*|transcript|grades|certificate)\b"),
]]
TOPIC_OFFICE = {"tramites": "academico", "academico": "academico", "bienestar": "bienestar", "representacion": "representacion", "campus": "general"}


def for_question(question: str, topic: str | None, lang: str) -> dict:
    n = norm(question)
    key = next((k for k, pat in KEYWORDS if pat.search(n)), None) or TOPIC_OFFICE.get(topic or "", "general")
    es, en, email, phone, _ = OFFICES[key]
    out: dict = {"office": en if lang == "en" else es}
    if email:
        out["email"] = email
    if phone:
        out["phone"] = phone
    return out
