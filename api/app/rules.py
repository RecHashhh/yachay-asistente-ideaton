"""Respuestas deterministas, sin modelo: fuera de dominio, aclaraciones, aulas y lugares (datos exactos de los Excel)."""

import re
import unicodedata
from dataclasses import dataclass

from . import filters
from .db import conn

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
    "manipulacion": {"es": "Solo respondo con los documentos oficiales de la universidad y no puedo cambiar estas reglas. ¿Qué trámite, norma o lugar necesitas?",
                     "en": "I only answer from the university's official documents and cannot change these rules. Which procedure, rule or place do you need?"},
    "confesionario": {"es": "El Confesionario es una página de Facebook de estudiantes, no un canal oficial de Yachay Tech: Yachi no publica ni lee confesiones. Si quieres plantear una queja, una sugerencia o una denuncia por un canal oficial, puedes hacerlo ante la FEYT o en Bienestar Universitario.",
                      "en": "The Confesionario is a students' Facebook page, not an official Yachay Tech channel: Yachi does not post or read confessions. To raise a complaint, suggestion or report through an official channel, contact the FEYT or Student Wellbeing."},
    "vacio": {"es": "No entendí la consulta. ¿Sobre qué trámite, norma o lugar de la universidad quieres saber?",
              "en": "I didn't get that. Which university procedure, rule or place do you want to know about?"},
}
CONFESIONARIO = re.compile(r"\bconfesionario|\bconfesion(es)? anonimas?")
CONFESIONARIO_OPTIONS = [
    {"es": "¿Cómo presento una demanda estudiantil a la FEYT?", "en": "How do I submit a student request to the FEYT?"},
    {"es": "¿Qué canales de participación estudiantil hay?", "en": "What student participation channels are there?"},
    {"es": "¿Qué servicios ofrece Bienestar Universitario?", "en": "What services does Student Wellbeing offer?"},
]

STOP = {"de", "la", "el", "los", "las", "un", "una", "y", "o", "a", "en", "que", "por", "para", "con", "me", "mi", "se", "es", "lo", "al", "del",
        "the", "a", "an", "of", "to", "and", "or", "in", "on", "is", "it", "my", "i", "me", "you", "si", "no", "ya", "pues", "bueno", "eh", "ah", "mmm"}

WHERE = re.compile(r"(donde|ubica|queda|llego|llegar|horario|abre|cierra|mapa|where|located|find|hours|open|close|how do i get)")
ROOM = re.compile(r"\b([A-Z]{1,3}\d{2,3}|JBY\d|AT\d{2})\b")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def _chat_norm(q: str) -> str:
    return re.sub(r"(.)\1{2,}", r"\1", norm(q))  # "hooolaaa" → "hola"; no toca "ll" ni "rr"


def smalltalk(q: str, lang: str, kind: str | None = None) -> dict | None:
    """Saludo, despedida, texto sin contenido o mensaje fijo de triage: respuesta sin buscar ni gastar tokens."""
    n = _chat_norm(q)
    if kind is None:
        if not n:
            kind = "vacio"
        elif GREET.match(n):
            kind = "saludo"
        elif THANKS.match(n):
            kind = "cierre"
        elif CONFESIONARIO.search(n):
            kind = "confesionario"
        elif not [w for w in n.split() if w not in STOP and (len(w) > 2 or w.isdigit())]:
            kind = "vacio"
        else:
            return None
    k = "en" if lang == "en" else "es"
    opts = {"cierre": [], "confesionario": CONFESIONARIO_OPTIONS}.get(kind, START_OPTIONS)
    return {"kind": kind, "question": SMALLTALK[kind][k], "options": [o[k] for o in opts]}


@dataclass
class Triage:
    route: str          # crisis, smalltalk, salud, ood, denuncia, normal
    question: str       # texto para buscar (sin saludo ni groserías, datos personales ocultos)
    kind: str | None = None
    sensitive: bool = False


def triage(q: str, lang: str) -> Triage:
    """Orden: datos personales → crisis → denuncia → manipulación → insulto → síntoma de salud → charla → fuera del ámbito → consulta."""
    q = filters.redact(q)
    v = filters.classify(q)
    if v.kind == "crisis":
        return Triage("crisis", q, "crisis", True)
    if v.kind == "denuncia":
        return Triage("denuncia", strip_greeting(v.clean), "denuncia", True)
    if v.kind in ("manipulacion", "respeto"):
        return Triage("smalltalk", q, v.kind, v.sensitive)
    if v.kind == "salud":
        return Triage("salud", q, "salud", True)
    s = smalltalk(v.clean, lang)
    if s:
        return Triage("smalltalk", q, s["kind"])
    if v.kind == "fuera_de_dominio":
        return Triage("ood", q, "fuera_de_dominio")
    return Triage("normal", strip_greeting(v.clean))


def strip_greeting(q: str) -> str:
    """"Hola, ¿cómo cambio de carrera?" → "¿cómo cambio de carrera?" (el saludo no debe pesar en la búsqueda)."""
    n = _chat_norm(q)
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


ORIGIN = re.compile(r"\b(desde|from)\s+(?:el |la |los |las |the )?(.+?)(?=\s+(?:hasta|hacia|al|a la|a|to)\s|$)")


def split_origin(q: str) -> tuple[str, Place | None]:
    """"¿Cómo llego a la biblioteca desde el rectorado?" → (pregunta sin el origen, Rectorado)."""
    n = norm(q)
    m = ORIGIN.search(n)
    if not m:
        return q, None
    origin = place_lookup(m.group(2), need_intent=False)
    return (n[: m.start()] + " " + n[m.end():]).strip(), origin


def place_by_id(pid: str) -> Place | None:
    with conn() as c:
        r = c.execute("SELECT id, name, name_en, uso, horario, lat, lon, maps_url, fuente FROM places WHERE id = %s", (pid,)).fetchone()
    if not r:
        return None
    return Place(r["id"], r["name"], r["name_en"], r["uso"], r["horario"], r["lat"], r["lon"], r["maps_url"], r["fuente"])


def place_lookup(q: str, need_intent: bool = True) -> Place | None:
    n = f" {norm(q)} "
    if need_intent and not WHERE.search(n):
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
