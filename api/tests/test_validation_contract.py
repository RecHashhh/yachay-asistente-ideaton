"""Contratos HTTP aislados: sin claves, sin modelo y sin modificar la base real."""
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient
from app import main


class ValidationContract(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)  # sin contexto: no inicia pools/modelos
        main.app.dependency_overrides[main.admin] = lambda: 'prueba@example.invalid'

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_invalid_imports_do_not_touch_storage(self):
        with patch.object(main, 'conn') as conn:
            for body in ({'cases': []}, {'cases': [{'id': 'a', 'q': 'test', 'lang': 'fr', 'expect': 'no_se'}]}):
                self.assertEqual(self.client.put('/admin/validation/cases', json=body).status_code, 422)
            duplicate = {'id': 'a', 'q': 'test', 'lang': 'es', 'expect': 'no_se'}
            self.assertEqual(self.client.put('/admin/validation/cases', json={'cases': [duplicate, duplicate]}).status_code, 400)
            conn.assert_not_called()

    def test_valid_import_uses_one_transaction(self):
        calls = []
        class Connection:
            def execute(self, sql, params=None):
                calls.append((sql, params))
        @contextmanager
        def transaction():
            yield Connection()
        with patch.object(main, 'conn', transaction), patch.object(main, 'audit') as audit:
            case = {'id': 'T1', 'q': 'Pregunta de ejemplo', 'lang': 'es', 'expect': 'no_se'}
            response = self.client.put('/admin/validation/cases', json={'cases': [case]})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['total'], 1)
            self.assertTrue(calls[0][0].startswith('LOCK'))
            self.assertEqual(calls[-1][1], ('T1', 'Pregunta de ejemplo', 'es', 'no_se'))
            audit.assert_called_once()

    def test_import_requires_authentication(self):
        main.app.dependency_overrides.clear()
        response = self.client.put('/admin/validation/cases', json={'cases': [{'id': 'a', 'q': 'q', 'expect': 'no_se'}]})
        self.assertEqual(response.status_code, 401)

    def test_attachment_is_rejected_before_graph_or_storage(self):
        with patch.object(main.graph, 'run') as run:
            response = self.client.post('/chat', json={'sessionId': 'test', 'message': 'Consulta', 'attachments': [{'name': 'test.pdf'}]})
            self.assertEqual(response.status_code, 400)
            run.assert_not_called()

    def test_inquiry_admin_requires_authentication(self):
        main.app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/admin/inquiries').status_code, 401)
        self.assertEqual(self.client.patch('/admin/inquiries/YT-TEST', json={'status': 'resuelta'}).status_code, 401)

    def test_inquiry_rejects_invalid_status(self):
        with patch.object(main, 'conn') as conn:
            self.assertEqual(self.client.patch('/admin/inquiries/YT-TEST', json={'status': 'invalid'}).status_code, 422)
            conn.assert_not_called()


if __name__ == '__main__':
    unittest.main()
