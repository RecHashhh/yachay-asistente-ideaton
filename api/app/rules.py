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

WHERE = re.compile(r"(donde|ubica|queda|llego|llegar|horario|abre|cierra|mapa|where|located|find|hours|open|close|how do i get)")
ROOM = re.compile(r"\b([A-Z]{1,3}\d{2,3}|JBY\d|AT\d{2})\b")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def out_of_domain(q: str) -> bool:
    return bool(OUT_OF_DOMAIN.search(norm(q)))


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
