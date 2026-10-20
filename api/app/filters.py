"""Filtros de entrada y salida del chat.

Referencias: OWASP Top 10 for LLM Applications 2025 (LLM01 inyección de instrucciones, LLM02 datos sensibles,
LLM07 filtración del prompt, LLM09 desinformación, LLM10 consumo sin límite), NIST AI 600-1 (perfil de IA generativa),
UNESCO 2023 (IA generativa en educación: no discriminar, derivar a personas en temas de bienestar) y LOPDP de Ecuador
(minimización y conservación limitada).

Principios:
- Primero la seguridad de la persona: una crisis o una denuncia de acoso nunca se trata como insulto ni se bloquea.
- Una grosería dentro de una pregunta real no impide responderla; solo el insulto sin consulta recibe el aviso de respeto.
- Hay términos que nunca se filtran (identidad, salud sexual, salud mental) para no discriminar ni impedir consultas a Bienestar.
- Las listas viven en la tabla filter_terms y se editan desde el Portal; DEFAULT_TERMS es la semilla y el respaldo.
"""

import re
import time
import unicodedata
from dataclasses import dataclass, field

# Categorías: crisis, denuncia, manipulacion, profanidad, fuera_de_dominio, permitido.
# Formato de cada término: palabras separadas por espacio; "*" al final de una palabra = cualquier terminación.
DEFAULT_TERMS: dict[str, list[str]] = {
    "crisis": [
        "suicid*", "matarme", "quitarme la vida", "acabar con mi vida", "no quiero vivir", "quiero morir*", "me quiero morir",
        "hacerme dano", "lastimarme", "cortarme las venas", "autolesion*", "no vale la pena vivir",
        "kill myself", "end my life", "want to die", "self harm", "hurt myself",
    ],
    "denuncia": [
        "acoso", "acosa*", "acosad*", "acosan", "acosaron", "hostig*", "abus*", "violencia", "violento", "violacion", "violaron",
        "agredi*", "agresion*", "me pego", "me pegaron", "me golpe*", "amenaz*", "discrimin*", "bullying", "ciberacoso",
        "tocamiento*", "chantaj*", "me insult*", "me grit*", "me trata mal", "me tratan mal", "me humill*",
        "harass*", "assault*", "abuse*", "threat*", "bully*", "stalk*", "discriminat*",
    ],
    "manipulacion": [
        "ignora las instrucciones", "ignora tus instrucciones", "ignora todas las instrucciones", "ignora las reglas", "ignora tus reglas",
        "olvida tus instrucciones", "olvida las instrucciones", "olvida tus reglas", "prompt del sistema", "tu prompt", "tus instrucciones",
        "modo desarrollador", "ahora eres", "actua como", "haz de cuenta que eres",
        "ignore previous instructions", "ignore all previous instructions", "ignore your instructions", "ignore the instructions",
        "disregard previous instructions", "system prompt", "your instructions", "developer mode", "jailbreak", "you are now", "act as",
    ],
    "profanidad": [
        "chupala", "chupalo", "chupame", "chupamela", "verga*", "mamaverga", "puta", "putas", "puto", "putamadre", "hijueputa", "hijo de puta", "hdp",
        "mierda*", "idiota*", "estupid*", "imbecil*", "pendej*", "cabron*", "marica", "maricon*", "carajo", "culo", "cojud*", "huevon*", "huevona*",
        "huevada*", "malparid*", "gonorrea", "chucha", "chuchatumadre", "zorra", "longo",
        "fuck*", "shit*", "bitch*", "asshole", "stupid", "idiot*", "moron", "retard*",
    ],
    "fuera_de_dominio": [
        "clima de hoy", "clima manana", "como esta el clima", "que clima", "pronostico del tiempo", "va a llover", "weather", "forecast",
        "chiste", "cuentame un chiste", "joke", "bitcoin", "cripto*", "crypto*", "horoscopo", "horoscope", "signo zodiacal",
        "netflix", "pelicula", "peliculas", "movie", "movies", "receta de cocina", "recipe", "resultado del partido", "marcador del partido",
    ],
    # Nunca se filtran: si coinciden, se retiran del texto antes de buscar groserías o temas fuera del ámbito.
    "permitido": [
        "indio", "india", "indigena*", "afro*", "montubi*", "gay", "lesbiana*", "trans", "transgenero", "lgbt*", "sexual*", "sexo",
        "vih", "its", "aborto", "anticoncept*", "condon*", "drogas", "alcohol", "salud mental", "depresion", "ansiedad", "embarazo",
    ],
}

LEET = str.maketrans({"@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", "$": "s", "5": "s", "7": "t"})


def moderation_text(q: str) -> str:
    """Texto normalizado para comparar: sin tildes, con "put@"→"puta", "p u t a"→"puta" y "mierdaaa"→"mierda"."""
    s = unicodedata.normalize("NFKD", q).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\S+", lambda t: t.group(0).translate(LEET) if re.search(r"[a-z]", t.group(0)) and re.search(r"[@4310!$57]", t.group(0)) else t.group(0), s)
    s = re.sub(r"\s{2,}", "  ", s)  # el doble espacio separa palabras deletreadas ("q u i e r o  m a t a r m e")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\b(?:[a-z] ){2,}[a-z]\b", lambda m: m.group(0).replace(" ", ""), s)  # letras sueltas
    s = re.sub(r"(.)\1+", r"\1", s)  # repeticiones (también colapsa "ll", "rr": se aplica igual a los términos)
    return re.sub(r"\s+", " ", s).strip()


def _term_regex(terms: list[str]) -> re.Pattern | None:
    parts = []
    for t in terms:
        words = []
        for w in moderation_text(t.replace("*", " STAR ")).replace(" star", "*").split():
            words.append(re.escape(w.rstrip("*")) + (r"\w*" if w.endswith("*") else ""))
        if words:
            parts.append(r"\s".join(words))
    return re.compile(r"\b(?:" + "|".join(sorted(parts, key=len, reverse=True)) + r")\b") if parts else None


@dataclass
class Compiled:
    pats: dict[str, re.Pattern | None] = field(default_factory=dict)


def compile_terms(terms: dict[str, list[str]]) -> Compiled:
    return Compiled({k: _term_regex(v) for k, v in terms.items()})


_cache: tuple[float, Compiled] | None = None


def invalidate() -> None:
    global _cache
    _cache = None


def current() -> Compiled:
    """Listas activas de la base (se recargan cada 60 s o al editarlas en el Portal). Sin base: las de DEFAULT_TERMS."""
    global _cache
    if _cache and time.time() - _cache[0] < 60:
        return _cache[1]
    terms: dict[str, list[str]] = {k: [] for k in DEFAULT_TERMS}
    try:
        from .db import conn
        with conn() as c:
            for r in c.execute("SELECT category, term FROM filter_terms WHERE active").fetchall():
                terms.setdefault(r["category"], []).append(r["term"])
        if not any(terms.values()):
            terms = DEFAULT_TERMS
    except Exception:
        terms = DEFAULT_TERMS
    comp = compile_terms(terms)
    _cache = (time.time(), comp)
    return comp


# Palabras que no cuentan como contenido de una consulta (para saber si un mensaje es solo un insulto).
FILLER = {"de", "la", "el", "los", "las", "un", "una", "y", "o", "a", "en", "que", "por", "para", "con", "me", "mi", "se", "es", "lo", "al", "del",
          "te", "tu", "vos", "eres", "sos", "esta", "este", "eso", "esa", "muy", "mas", "tan", "bien", "re", "ya", "pues", "ve", "oe", "ole", "jaja",
          "yachi", "bot", "chatbot", "asistente", "the", "you", "are", "your", "is", "a", "an", "so", "such", "what", "this", "lol", "jeje"}


# Grosería contada por quien la recibió: se trata como denuncia (en el texto ya normalizado, con letras repetidas colapsadas).
REPORTED = re.compile(r"\b(me|nos|le|les) (dijo|dijeron|dice|dicen|lamo|lamaron|lama|laman|grito|gritaron|trato|trataron|escribio|escribieron|puso|pusieron)\b"
                      r"|\b(caled me|told me|said to me)\b")


@dataclass
class Verdict:
    kind: str | None  # crisis, denuncia, manipulacion, respeto, fuera_de_dominio o None (consulta normal)
    clean: str        # pregunta para buscar (sin groserías)
    sensitive: bool = False  # no se guarda el texto (LOPDP: datos de salud o de terceros)
    matched: str | None = None


def classify(q: str, comp: Compiled | None = None) -> Verdict:
    comp = comp or current()
    m = moderation_text(q)
    p = comp.pats
    if p.get("permitido"):
        m = p["permitido"].sub(" ", m)
    hit = lambda k: (p.get(k) and p[k].search(m))  # noqa: E731
    # Texto para buscar: las palabras originales sin las groserías (la búsqueda necesita tildes y letras dobles).
    no_prof = lambda: " ".join(w for w in q.split() if not (p.get("profanidad") and p["profanidad"].search(moderation_text(w)))) or q  # noqa: E731
    if x := hit("crisis"):
        return Verdict("crisis", q, True, x.group(0))
    if x := hit("denuncia"):
        return Verdict("denuncia", no_prof(), True, x.group(0))
    if x := hit("manipulacion"):
        return Verdict("manipulacion", q, False, x.group(0))
    if x := hit("profanidad"):
        if REPORTED.search(m):  # "mi profesor me dijo p***": la persona cuenta lo que le pasó, no insulta
            return Verdict("denuncia", no_prof(), True, x.group(0))
        rest = [w for w in p["profanidad"].sub(" ", m).split() if w not in FILLER and len(w) > 2]
        if len(rest) <= 2:
            return Verdict("respeto", q, True, x.group(0))
        # Pregunta real con una grosería ("¿dónde queda la p*** biblioteca?"): se responde sin la grosería.
        return Verdict(None, no_prof(), False, x.group(0))
    if x := hit("fuera_de_dominio"):
        return Verdict("fuera_de_dominio", q, False, x.group(0))
    return Verdict(None, q, False)


# ------------------------------------------------------------- datos personales (LOPDP, OWASP LLM02)

PII = [
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[correo omitido]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[número omitido]"),                         # tarjeta o RUC
    (re.compile(r"(?<!\w)\+?593[\s-]?\(?\d\)?(?:[\s-]?\d){7,8}\b"), "[teléfono omitido]"),
    (re.compile(r"\b\d{9}-?\d\b"), "[cédula omitida]"),                                   # cédula o celular 09…
    (re.compile(r"(?<!\w)\(?0[2-7]\)?[\s-]?\d(?:[\s-]?\d){6}\b"), "[teléfono omitido]"),  # fijo con código de provincia
    (re.compile(r"\b(?:pasaporte|passport)\s*(?:n[°ºo.]*\s*)?[A-Z0-9]{6,12}\b", re.I), "[pasaporte omitido]"),
]


def redact(text: str) -> str:
    for pat, rep in PII:
        text = pat.sub(rep, text)
    return text


# ------------------------------------------------------------- verificación de la respuesta (OWASP LLM09)

_NUM = re.compile(r"\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?")
_URL = re.compile(r"https?://[^\s)\]]+|www\.[^\s)\]]+")
_MAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _canon_num(s: str) -> str:
    s = re.sub(r"[.,]0{1,2}$", "", s)
    return re.sub(r"[.,]", "", s)


def unsupported_facts(answer: str, sources: str) -> list[str]:
    """Correos, enlaces y cifras (2+ dígitos) de la respuesta que no aparecen en los fragmentos usados."""
    src_low = sources.lower()
    src_nums = {_canon_num(n) for n in _NUM.findall(sources)}
    src_digits = re.sub(r"\D", "", sources)
    out = []
    for e in _MAIL.findall(answer):
        if e.lower().rstrip(".") not in src_low:
            out.append(e)
    for u in _URL.findall(answer):
        if u.lower().rstrip(".,") not in src_low:
            out.append(u)
    no_links = _URL.sub(" ", _MAIL.sub(" ", answer))
    for n in _NUM.findall(no_links):
        c = _canon_num(n)
        if len(c) >= 2 and c not in src_nums and c not in src_digits:
            out.append(n)
    return out


# ------------------------------------------------------------- límite de uso (OWASP LLM10)

_hits: dict[str, list[float]] = {}


def allow(key: str, limit: int, window_s: int) -> bool:
    """Ventana deslizante en memoria (un proceso). Con varias instancias: mover a la base o a Redis."""
    now = time.time()
    q = [t for t in _hits.get(key, []) if now - t < window_s]
    if len(q) >= limit:
        _hits[key] = q
        return False
    q.append(now)
    _hits[key] = q
    if len(_hits) > 50_000:  # limpieza simple para no crecer sin fin
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 86_400]:
            _hits.pop(k, None)
    return True
