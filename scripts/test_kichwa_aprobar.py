import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('kichwa_approval', Path(__file__).with_name('kichwa-aprobar.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Approval(unittest.TestCase):
    def row(self, **updates):
        # Marcador sintético: prueba el contrato, no es una propuesta lingüística.
        return {'clave': 'hello', 'es': 'Hola, soy {name}.', 'kichwa_revisado': 'PRUEBA {name}', 'aprobada': 'si', 'revisado_por': 'Revisor de prueba', 'fecha': '2026-10-22', **updates}

    def test_pending_draft_is_never_imported(self):
        self.assertEqual(module.validate([self.row(aprobada='no')], {'hello': 'Hola, soy {name}.'}), {})

    def test_missing_or_repeated_variable_is_rejected(self):
        for text in ['PRUEBA', 'PRUEBA {name} {name}', 'PRUEBA {otro}']:
            with self.assertRaises(ValueError):
                module.validate([self.row(kichwa_revisado=text)], {'hello': 'Hola, soy {name}.'})

    def test_stale_source_or_missing_review_is_rejected(self):
        for row, source in [(self.row(), 'Nuevo saludo {name}'), (self.row(revisado_por=''), 'Hola, soy {name}.'), (self.row(fecha='ayer'), 'Hola, soy {name}.')]:
            with self.assertRaises(ValueError):
                module.validate([row], {'hello': source})

    def test_reviewed_text_passes_and_duplicates_fail(self):
        self.assertEqual(module.validate([self.row()], {'hello': 'Hola, soy {name}.'}), {'hello': 'PRUEBA {name}'})
        with self.assertRaises(ValueError):
            module.validate([self.row(), self.row()], {'hello': 'Hola, soy {name}.'})


if __name__ == '__main__':
    unittest.main()
