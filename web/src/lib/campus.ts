import type { PlaceId } from './types';

/**
 * Lugares del campus en coordenadas del viewBox del mapa (0 0 1000 640).
 * PROVISIONAL: es un plano esquemático. Al recibir el SVG oficial:
 *   1. Reemplaza CampusBase en components/CampusMap.tsx por el SVG (mismo viewBox o ajusta VIEWBOX).
 *   2. Actualiza x/y de cada lugar con el centro de su edificio.
 * El modelo solo conoce los `id` y los `aliases`; nunca coordenadas (así el prompt es corto y no inventa posiciones).
 */
export const VIEWBOX = { w: 1000, h: 640 };

export interface Place {
  id: PlaceId;
  name: string;
  nameEn: string;
  x: number;
  y: number;
  aliases: string[];
}

export const PLACES: Place[] = [
  { id: 'entrada', name: 'Entrada principal', nameEn: "Main gate", x: 90, y: 560, aliases: ['garita', 'puerta', 'ingreso', 'main gate', 'entrance'] },
  { id: 'admisiones', name: 'Admisiones y Registro', nameEn: "Admissions & Registrar", x: 250, y: 470, aliases: ['secretaría', 'secretaria', 'registro', 'admisiones', 'admissions', 'registrar'] },
  { id: 'rectorado', name: 'Rectorado', nameEn: "Rector's office", x: 300, y: 330, aliases: ['administración', 'rector'] },
  { id: 'biblioteca', name: 'Biblioteca', nameEn: "Library", x: 500, y: 250, aliases: ['libros', 'library'] },
  { id: 'sala-estudio', name: 'Sala de estudio', nameEn: "Study room", x: 650, y: 140, aliases: ['sala de estudio', 'salas de estudio', 'study room', 'study rooms'] },
  { id: 'aulas', name: 'Bloque de aulas', nameEn: "Classroom building", x: 650, y: 360, aliases: ['aula', 'aulas', 'clases', 'classroom', 'classrooms'] },
  { id: 'laboratorios', name: 'Laboratorios', nameEn: "Laboratories", x: 800, y: 230, aliases: ['lab', 'labs', 'laboratorio', 'laboratorios', 'laboratory'] },
  { id: 'comedor', name: 'Comedor', nameEn: "Dining hall", x: 520, y: 470, aliases: ['cafetería', 'almuerzo', 'comida', 'cafeteria', 'dining'] },
  { id: 'residencias', name: 'Residencias', nameEn: "Residences", x: 860, y: 500, aliases: ['residencia', 'residencias', 'dormitorios', 'dorm', 'dorms', 'residence'] },
  { id: 'deportes', name: 'Canchas y coliseo', nameEn: "Sports fields & arena", x: 700, y: 560, aliases: ['coliseo', 'gimnasio', 'canchas', 'gym'] },
  { id: 'enfermeria', name: 'Bienestar y enfermería', nameEn: "Student welfare & health", x: 380, y: 560, aliases: ['salud', 'médico', 'bienestar', 'enfermería', 'health', 'welfare'] },
  { id: 'representacion', name: 'Representación estudiantil', nameEn: "Student representation", x: 140, y: 380, aliases: ['representación estudiantil', 'representante', 'representantes', 'asociación de estudiantes', 'consejo estudiantil', 'student council', 'student representative'] },
];

export const placeById = (id: PlaceId) => PLACES.find((p) => p.id === id);
/** Nombre del lugar en el idioma de la interfaz. */
export const placeName = (p: Place, lang: string) => (lang === 'en' ? p.nameEn : p.name);

/** Busca un lugar por nombre o alias como palabra completa (lo usa el simulador; el backend real lo hace con el modelo). */
export function findPlace(text: string): Place | undefined {
  const t = ` ${text.toLowerCase().replace(/[¿?¡!.,;:]/g, ' ')} `;
  const has = (w: string) => t.includes(` ${w.toLowerCase()} `);
  return PLACES.find((p) => has(p.name) || has(p.nameEn) || p.aliases.some(has));
}
