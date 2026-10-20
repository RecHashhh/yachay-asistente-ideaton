"""Temas, audiencia y metadatos que el corpus no trae y se derivan del documento."""

import re

TOPICS = [
    ("tramites", "Trámites académicos", "Cambio de carrera, retiro, terceras matrículas, reingresos, certificados, titulación",
     "Academic procedures", "Change of major, withdrawal, third enrollment, re-entry, certificates, graduation"),
    ("academico", "Calendario académico", "Fechas de carrera, nivelación, posgrado e intersemestral",
     "Academic calendar", "Dates for undergraduate, leveling, graduate and intersession terms"),
    ("bienestar", "Bienestar y becas", "Becas, salud, prevención, clubes, seguros",
     "Welfare and scholarships", "Scholarships, health, prevention, clubs, insurance"),
    ("campus", "Campus y ubicaciones", "Aulas, laboratorios, biblioteca, residencias, servicios",
     "Campus and locations", "Classrooms, labs, library, residences, services"),
    ("representacion", "Representación estudiantil", "FEYT, cogobierno, canales de participación",
     "Student representation", "Student federation, co-governance, participation channels"),
    ("admision", "Admisión y oferta académica", "Postulación, carreras, escuelas, posgrado, inglés",
     "Admission and programs", "Application, majors, schools, graduate programs, English"),
    ("normativa", "Normativa general", "LOES, estatuto, código de ética, transparencia",
     "General regulations", "Higher education law, statute, code of ethics, transparency"),
    ("investigacion", "Investigación", "Proyectos, ética en investigación, lineamientos",
     "Research", "Projects, research ethics, guidelines"),
    ("institucional", "Institucional", "Planes, vinculación, autoevaluación, personal académico",
     "Institutional", "Plans, outreach, self-assessment, academic staff"),
]

# (patrón sobre doc_id, tema). El primero que coincide gana.
_TOPIC_RULES = [
    (r"calendario", "academico"),
    (r"cambio|retiro|tercera|reingreso|cambio_de_ies|certificados|titulacion|faq_registros|medico_tratando|practicas|regimen_academico|instructivo_de_postulacion", "tramites"),
    (r"beca|bienestar|prevencion|riesgos_psicosociales|siniestro|clubes", "bienestar"),
    (r"residencia|conoce_el_campus|biblioteca|servicios|mapa|aulas|puntos_importantes|higiene_y_seguridad", "campus"),
    (r"representatividad|cogobierno|eleccion_del_representante", "representacion"),
    (r"oferta_academica|posgrado|escuela_de|acerca_de|estudiantes|programa_de_ingles", "admision"),
    (r"investigacion|ceish|lineamentos|proyectos", "investigacion"),
    (r"loes|estatuto|codigo_de_etica|normativa|lotaip|asesoria_juridica", "normativa"),
    (r"pedi|autoevaluacion|vinculacion|escalafon|distribucion_del_tiempo", "institucional"),
]

# Documentos para personal (docentes, investigadores, gestión): se usan, pero con menos prioridad que los de estudiantes.
_PERSONAL = r"escalafon|distribucion_del_tiempo|gestion_de_proyectos|formulario_de_gestion|ceish|lineamentos_de_investigacion|autoevaluacion|pedi_|plan_integral_de_vinculacion|lotaip|asesoria_juridica|higiene_y_seguridad|eleccion_del_representante_principal"
_GENERAL = r"loes|estatuto|codigo_de_etica|cogobierno|investigacion_e0|vinculacion_3498|bases_ii_convocatoria"


def topic_for(doc_id: str) -> str:
    for pat, tid in _TOPIC_RULES:
        if re.search(pat, doc_id):
            return tid
    return "normativa"


def audiencia_for(doc_id: str) -> str:
    if re.search(_PERSONAL, doc_id):
        return "personal"
    if re.search(_GENERAL, doc_id):
        return "general"
    return "estudiantes"


def version_for(doc_id: str, title: str, periodo: str) -> str:
    """Versión explícita del nombre (V4.0, v2_0) o, si no hay, el período de vigencia."""
    m = re.search(r"\bv(\d+)[._](\d+)\b", doc_id, re.I) or re.search(r"\bV(\d+)\.(\d+)\b", title)
    if m:
        return f"v{m.group(1)}.{m.group(2)}"
    return periodo or "vigente"


def acceso_for(fuente: str, url: str) -> str:
    if "sharepoint.com" in (url or ""):
        return "institucional"  # requiere iniciar sesión con cuenta de la universidad
    if fuente == "web" and (url or "").startswith("http"):
        return "publico"
    return "interno"


def kind_for(archivo: str, url: str) -> str:
    s = (archivo or url or "").lower()
    for k in ("pdf", "xlsx", "csv"):
        if s.endswith(k) or f".{k}" in s:
            return k
    return "web" if (url or "").startswith("http") else "pdf"
