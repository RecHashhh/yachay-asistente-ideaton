import copy
import unittest
from datetime import date
from unittest.mock import patch
from types import SimpleNamespace
from app import procedures
from app import graph


def example():
    data = {'title': 'Guía sintética', 'summary': 'Resumen verificado de prueba.', 'office': 'Oficina de ejemplo', 'duration': None,
            'documents': ['Documento de ejemplo'], 'steps': [{'title': 'Primero', 'detail': 'Paso sintético.'}],
            'deadlines': [{'title': 'Convocatoria de ejemplo', 'start': '2026-01-01', 'end': '2026-01-20'}]}
    return {'id': 'test', 'doc_id': 'd1', 'periodo': '2026SEM01', 'triggers': ['cambio de carrera'], 'data': {'es': data, 'en': {**data, 'title': 'Example guide'}},
            'evidence': [{'field': field, 'chunk_id': 'd1#1', 'quote': 'Texto de prueba'} for field in ['summary', 'office', 'documents[0]', 'steps[0]']]}


class ProcedureUtility(unittest.TestCase):
    def test_followup_retains_procedure_but_not_new_subject(self):
        p = example()
        with patch.object(procedures, '_all', return_value=[p]):
            history = [{'role': 'user', 'content': 'Cómo hago un cambio de carrera'}]
            self.assertEqual(procedures.resolve('¿Y los documentos?', history)['id'], 'test')
            self.assertEqual(procedures.resolve('What documents do I need?', history)['id'], 'test')
            self.assertEqual(procedures.resolve('¿Y cuánto tarda?', history)['id'], 'test')
            self.assertEqual(procedures.resolve('How long does it take?', history)['id'], 'test')
            self.assertIsNone(procedures.resolve('¿Y los requisitos de la beca?', history))
            self.assertIsNone(procedures.resolve('¿Dónde queda la biblioteca?', history))

    def test_old_topic_not_resurrected_after_subject_change(self):
        with patch.object(procedures, '_all', return_value=[example()]):
            history = [{'role': 'user', 'content': 'cambio de carrera'}, {'role': 'user', 'content': 'Cómo uso el wifi'}]
            self.assertIsNone(procedures.resolve('y los requisitos', history))

    def test_explicit_other_period_does_not_match_old_call(self):
        p = example()
        self.assertIsNone(procedures.match('cambio de carrera 2027', [p]))
        self.assertIsNone(procedures.match('cambio de carrera 2026SEM02', [p]))
        self.assertEqual(procedures.match('cambio de carrera 2026SEM01', [p])['id'], 'test')

    def test_dates_and_content_are_not_mutated(self):
        p = example(); before = copy.deepcopy(p)
        card, _ = procedures.card(p, 'es', date(2026, 10, 20))
        self.assertTrue(card['deadlinesPast'])
        self.assertEqual(p, before)
        card2, _ = procedures.card(p, 'es', date(2026, 1, 10))
        self.assertFalse(card2.get('deadlinesPast', False))

    def test_revision_shared_between_languages_but_changes_with_content(self):
        p = example(); es, _ = procedures.card(p, 'es'); en, _ = procedures.card(p, 'en')
        self.assertEqual(es['revision'], en['revision'])
        p['data']['es']['steps'][0]['detail'] = 'Otro paso'
        changed, _ = procedures.card(p, 'es')
        self.assertNotEqual(es['revision'], changed['revision'])

    def test_missing_fields_are_not_invented(self):
        card, _ = procedures.card(example(), 'es')
        self.assertIn('no especifica', procedures.followup_answer(card, 'y la duracion', 'es'))
        self.assertIn('no especifica', procedures.followup_answer(card, 'y el costo', 'es'))
        self.assertIn('no recoge', procedures.followup_answer(card, 'y el correo', 'es'))

    def test_quote_changes_disable_evidence(self):
        self.assertEqual(procedures.verify([example()], {'d1#1': 'Texto de prueba'}), [])
        self.assertTrue(procedures.verify([example()], {'d1#1': 'Documento reemplazado'}))

    def test_empty_quote_or_unanchored_contact_is_rejected(self):
        p = example(); p['evidence'][0]['quote'] = ''
        self.assertTrue(procedures.verify([p], {'d1#1': 'Texto de prueba'}))
        p = example(); p['data']['es']['contacts'] = [{'label': 'Inventado', 'email': 'no@example.invalid'}]
        self.assertTrue(procedures.verify([p], {'d1#1': 'Texto de prueba'}))


class AttendanceRelevance(unittest.IsolatedAsyncioTestCase):
    async def test_council_absence_is_not_a_class_absence_procedure(self):
        events = []
        hit = SimpleNamespace(doc_id='ejemplo', texto='Consejo: informar a secretaría la inasistencia justificada.', cos=0.9, fts=1, topic_id='academico', title='Ejemplo sintético')
        with patch.object(graph, 'hybrid', return_value=[hit]), patch.object(graph, 'get_stream_writer', return_value=events.append):
            result = await graph.retrieve({'question': 'Cómo justifico una inasistencia', 'lang': 'es', 'history': []})
            self.assertEqual(result['kind'], 'sin_fuente')
            self.assertTrue(any(e['type'] == 'unknown' for e in events))

    async def test_explicit_council_query_keeps_its_domain(self):
        events = []
        hit = SimpleNamespace(doc_id='ejemplo', texto='Consejo: informar a secretaría la inasistencia justificada.', cos=0.9, fts=1, topic_id='academico', title='Ejemplo sintético')
        with patch.object(graph, 'hybrid', return_value=[hit]), patch.object(graph, 'get_stream_writer', return_value=events.append):
            result = await graph.retrieve({'question': 'Cómo justifico una inasistencia al CSU', 'lang': 'es', 'history': []})
            self.assertEqual(result['hits'], [hit])


if __name__ == '__main__':
    unittest.main()
