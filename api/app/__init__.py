"""Backend del asistente Yachay Tech."""

import sys
from pathlib import Path

# Mapas/ vive en la raíz del repositorio (en Docker se copia a /app/Mapas): se agrega a la ruta para correr la API desde api/.
_ROOT = Path(__file__).resolve().parents[2]
if (_ROOT / "Mapas").is_dir() and str(_ROOT) not in sys.path:
    sys.path.append(str(_ROOT))
