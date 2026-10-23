"""Las pruebas no usan la base real: el tope de gasto parte en 0 y el uso del modelo no se registra.

Sin esto, `usage.budget_ok()` no encuentra la base y, por prudencia, apaga el modelo; las pruebas que simulan
respuestas de Claude tomarían el camino sin modelo. Las pruebas del tope (test_usage.py) reemplazan `spent` por su cuenta.
"""

import pytest

from app import usage


@pytest.fixture(autouse=True)
def _usage_sin_base(monkeypatch):
    monkeypatch.setattr(usage, "spent", lambda: 0.0)
    monkeypatch.setattr(usage, "record", lambda *a, **k: None)
