"""Respuestas deterministas, sin modelo: fuera de dominio, aclaraciones, aulas y lugares (datos exactos de los Excel)."""

import re
import unicodedata
from dataclasses import dataclass

from .db import conn

OUT_OF_DOMAIN = re.compile(
    r"\b(clima|tiempo hara|futbol|receta|chiste|bitcoin|cripto|pelicula|serie|horoscopo|wifi|contrasena del wifi|weather|football|recipe|joke|movie|crypto|horoscope)\b"
)

CLARIFY = [
    (re.compile(r"(residenc|housing|dorm|residence)"),
     {"es": "¿Qué necesitas saber de las residencias?", "en": "What do you need to know about student housing?"},
     [{"es": "¿Qué normas hay en las residencias universitarias?", "en": "What are the rules in the student residences?"},
      {"es": "¿Dónde quedan las residencias?", "en": "Where are the residences?"}]),
    (re.compile(r"(laborator|\blabs?\b)"),
     {"es": "¿Qué necesitas de los laboratorios?", "en": "What do you need about the labs?"},
     [{"es": "¿Qué normas de seguridad hay en los laboratorios?", "en": "What are the lab safety rules?"},
      {"es": "¿Dónde quedan los laboratorios?", "en": "Where are the labs?"}]),
    (re.compile(r"(matricul|enrol)"),
     {"es": "¿Te refieres a las fechas, a una tercera matrícula o a otra cosa?", "en": "Do you mean dates, a third enrollment or something else?"},
     [{"es": "¿Cuándo son las matrículas del período 2026SEM02?", "en": "When is enrollment for 2026SEM02?"},
      {"es": "¿Cómo solicito una tercera matrícula?", "en": "How do I request a third enrollment?"}]),
    (re.compile(r"^(tramites?|procedimientos?|procedures?|ayuda|help)$"),
     {"es": "¿Qué trámite necesitas hacer?", "en": "Which procedure do you need?"},
     [{"es": "¿Cómo pido un cambio de carrera?", "en": "How do I change my major?"},
      {"es": "¿Cómo solicito una tercera matrícula?", "en": "How do I request a third enrollment?"},
      {"es": "¿Cómo me retiro de una carrera?", "en": "How do I withdraw from my major?"},
      {"es": "¿Cómo solicito un certificado académico?", "en": "How do I request an academic certificate?"}]),
]

# Conversación sin consulta: se responde sin buscar (si no, "hola" trae el fragmento menos malo del corpus).
GREET = re.compile(
    r"^(hola+|holi+s?|ola|buen[oa]s?( (dias|tardes|noches))?|saludos|hey|hi|hello|good (morning|afternoon|evening)|imanalla|alli (puncha|chishi|tuta)"
    r"|que tal|como estas|yachi)( (hola|yachi|que tal|como estas|como vas))*$"
)
THANKS = re.compile(
    r"^(muchas |mil )?(gracias|grax|thanks?( you)?|thx|ok|okay|okey|vale|listo|perfecto|genial|chevere|de acuerdo|entendido|yupaychani"
    r"|adios|chao|bye|hasta luego|nos vemos)( (muchas gracias|gracias|yachi|thanks|bye))*$"
)
PROFANITY = re.compile(
    r"\b(chupa(la|lo|me|mela)|verga\w*|puta\w*|puto|mierda\w*|hijueputa|hdp|idiota|estupid\w*|imbecil\w*|pendej\w*|cabron\w*|marica|maricon\w*"
    r"|carajo|culo|cojud\w*|huev[oa]n\w*|malparid\w*|fuck\w*|shit\w*|bitch\w*|asshole|stupid|idiot)\b"
)
GREET_PREFIX = re.compile(r"^(hola+|buen[oa]s?( (dias|tardes|noches))?|hey|hi|hello|imanalla|yachi)( yachi)? ")

START_OPTIONS = [
    {"es": "¿Cuándo es la recepción de solicitudes de cambio de carrera para 2026SEM02?", "en": "When can I apply for a change of major for 2026SEM02?"},
    {"es": "¿Cómo solicito una tercera matrícula?", "en": "How do I request a third enrollment?"},
    {"es": "¿Qué becas ofrece la universidad?", "en": "What scholarships does the university offer?"},
    {"es": "¿Cuál es el horario de la biblioteca?", "en": "What are the library opening hours?"},
]
SMALLTALK = {
    "saludo": {"es": "¡Hola! Soy Yachi, el asistente de Yachay Tech. Respondo con los documentos oficiales sobre trámites, normativa, servicios y lugares del campus. ¿En qué te ayudo?",
               "en": "Hi! I'm Yachi, Yachay Tech's assistant. I answer from official documents about procedures, regulations, services and campus places. How can I help?"},
    "cierre": {"es": "¡Con gusto! Si tienes otra consulta sobre la universidad, aquí estoy.",
               "en": "You're welcome! If you have another question about the university, I'm here."},
    "respeto": {"es": "Prefiero que mantengamos un trato respetuoso. Estoy para ayudarte con trámites, normativa, servicios y lugares de la universidad. ¿Qué necesitas?",
                "en": "Let's keep it respectful. I'm here to help with university procedures, regulations, services and places. What do you need?"},
    "vacio": {"es": "No entendí la consulta. ¿Sobre qué trámite, norma o lugar de la universidad quieres saber?",
              "en": "I didn't get that. Which university procedure, rule or place do you want to know about?"},
}
STOP = {"de", "la", "el", "los", "las", "un", "una", "y", "o", "a", "en", "que", "por", "para", "con", "me", "mi", "se", "es", "lo", "al", "del",
        "the", "a", "an", "of", "to", "and", "or", "in", "on", "is", "it", "my", "i", "me", "you", "si", "no", "ya", "pues", "bueno", "eh", "ah", "mmm"}

WHERE = re.compile(r"(donde|ubica|queda|llego|llegar|horario|abre|cierra|mapa|where|located|find|hours|open|close|how do i get)")
ROOM = re.compile(r"\b([A-Z]{1,3}\d{2,3}|JBY\d|AT\d{2})\b")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def out_of_domain(q: str) -> bool:
    return bool(OUT_OF_DOMAIN.search(norm(q)))


def smalltalk(q: str, lang: str) -> dict | None:
    """Saludo, despedida, insulto o texto sin contenido: respuesta fija con opciones para empezar (sin buscar ni gastar tokens)."""
    n = norm(q)
    if PROFANITY.search(n):
        kind = "respeto"
    elif not n or GREET.match(n):
        kind = "saludo" if n else "vacio"
    elif THANKS.match(n):
        kind = "cierre"
    elif not [w for w in n.split() if w not in STOP and (len(w) > 2 or w.isdigit())]:
        kind = "vacio"
    else:
        return None
    k = "en" if lang == "en" else "es"
    opts = [] if kind == "cierre" else [o[k] for o in START_OPTIONS]
    return {"kind": kind, "question": SMALLTALK[kind][k], "options": opts}


def strip_greeting(q: str) -> str:
    """"Hola, ¿cómo cambio de carrera?" → "¿cómo cambio de carrera?" (el saludo no debe pesar en la búsqueda)."""
    n = norm(q)
    m = GREET_PREFIX.match(n + " ")
    if not m or len(n.split()) <= len(m.group(0).split()):
        return q
    words = q.split()
    return " ".join(words[len(m.group(0).split()):]) or q


def clarify(q: str, lang: str) -> dict | None:
    n = norm(q)
    if len(n.split()) > 3:
        return None
    for pat, question, options in CLARIFY:
        if pat.search(n):
            k = "en" if lang == "en" else "es"
            return {"question": question[k], "options": [o[k] for o in options]}
    return None


@dataclass
class Place:
    id: str
    name: str
    name_en: str | None
    uso: str | None
    horario: str | None
    lat: float
    lon: float
    maps_url: str | None
    fuente: str
    extra: str = ""


def room_lookup(q: str) -> tuple[Place, str] | None:
    m = ROOM.search(q.upper())
    if not m:
        return None
    with conn() as c:
        r = c.execute(
            "SELECT r.code, r.zona, r.ubicacion, r.lat, r.lon, r.coord_compartida, p.id AS pid, p.name, p.name_en, p.maps_url "
            "FROM rooms r LEFT JOIN places p ON p.id = r.place_id WHERE r.code = %s",
            (m.group(1),),
        ).fetchone()
    if not r or r["lat"] is None:
        return None
    pl = Place(r["pid"] or r["code"], r["name"] or r["zona"], r["name_en"], "Aula", None, r["lat"], r["lon"], r["maps_url"], "distribucion_aulas",
               extra=f"{r['code']}|{r['ubicacion']}|{'compartida' if r['coord_compartida'] else 'propia'}")
    return pl, r["code"]


def place_lookup(q: str) -> Place | None:
    n = f" {norm(q)} "
    if not WHERE.search(n):
        return None
    with conn() as c:
        rows = c.execute("SELECT id, name, name_en, uso, horario, lat, lon, maps_url, aliases, fuente FROM places").fetchall()
    best = None
    for r in rows:
        names = [norm(r["name"])] + [norm(a) for a in r["aliases"]] + ([norm(r["name_en"])] if r["name_en"] else [])
        for nm in names:
            if nm and f" {nm} " in n and (best is None or len(nm) > best[0]):
                best = (len(nm), r)
    if not best:
        return None
    r = best[1]
    return Place(r["id"], r["name"], r["name_en"], r["uso"], r["horario"], r["lat"], r["lon"], r["maps_url"], r["fuente"])
