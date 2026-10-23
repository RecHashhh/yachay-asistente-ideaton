import { expect, it } from 'vitest';
import { freshSuggestions } from './suggestions';

it('excludes asked questions despite accents, punctuation and spacing', () => {
  expect(freshSuggestions(['¿Cómo pido una beca?', '  COMO pido una BECA ', '¿Dónde queda Bienestar?', 'Dónde queda bienestar!'], ['Como pido una beca'])).toEqual(['¿Dónde queda Bienestar?']);
});

it('keeps distinct followups and caps the visible choices', () => {
  expect(freshSuggestions(['¿Qué documentos necesito?', '¿Cuál es el plazo?', '¿Dónde se entrega?', '¿Hay costo?'], [])).toHaveLength(3);
  expect(freshSuggestions(['  ', '!!!'], [])).toEqual([]);
});
