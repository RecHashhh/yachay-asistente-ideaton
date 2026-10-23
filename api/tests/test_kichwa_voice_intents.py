from contextlib import contextmanager
from app import procedures, rules


def test_kichwa_place_intent_and_suffix(monkeypatch):
    row = dict(id='library', name='Biblioteca', name_en='Library', uso=None, horario=None,
               lat=0.4, lon=-78.1, maps_url=None, aliases=['biblioteca'], fuente='test')
    class Connection:
        def execute(self, *args): return self
        def fetchall(self): return [row]
    @contextmanager
    def fake_connection(): yield Connection()
    monkeypatch.setattr(rules, 'conn', fake_connection)
    for text in ['Maypi biblioteca tiyan?', 'Maypita bibliotecaka?', 'Mayman biblioteca?']:
        assert rules.place_lookup(text).id == 'library'
    assert rules.place_lookup('Quiero cambiar carrera') is None


def test_kichwa_procedure_preserves_period_rules():
    item = {'id': 'change', 'periodo': '2026SEM02', 'triggers': ['cambio de carrera']}
    assert procedures.match('Imashina carrera cambiota rurani?', [item]) == item
    assert procedures.match('Imashina carrera tikrachina 2027?', [item]) is None
    assert procedures.match('Imashina biblioteca tiyan?', [item]) is None
