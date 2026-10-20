import { findPlace, placeName } from './campus';
import type { ChatRequest, DocMeta, Procedure, PublicDoc, Source, StreamEvent, Topic, Trend, Unknown, UploadInput } from './types';

/**
 * Simulador del backend para trabajar el frontend sin servidor.
 * TODO el contenido es DE EJEMPLO: no es información oficial de la universidad.
 * Se reemplaza al conectar el backend con los documentos reales del Día 1.
 */

type Lang = ChatRequest['lang'];
type L = { es: string; en: string };
const pick = (l: L, lang: Lang) => (lang === 'en' ? l.en : l.es);

export const topics: Topic[] = [
  { id: 'tramites', name: 'Trámites académicos', description: 'Cambio de carrera, inasistencias, certificados, homologaciones', nameEn: 'Academic procedures', descriptionEn: 'Change of major, absences, certificates, course transfers' },
  { id: 'academico', name: 'Calendario académico', description: 'Semestres, exámenes, feriados', nameEn: 'Academic calendar', descriptionEn: 'Terms, exams, holidays' },
  { id: 'becas', name: 'Becas y ayudas', description: 'Tipos de beca, requisitos, renovación', nameEn: 'Scholarships and aid', descriptionEn: 'Scholarship types, requirements, renewal' },
  { id: 'campus', name: 'Campus y ubicaciones', description: 'Aulas, laboratorios, salas de estudio, residencias', nameEn: 'Campus and locations', descriptionEn: 'Classrooms, labs, study rooms, residences' },
  { id: 'representacion', name: 'Representación estudiantil', description: 'Consejos, representantes, canales de participación', nameEn: 'Student representation', descriptionEn: 'Councils, representatives, participation channels' },
  { id: 'admision', name: 'Admisión y matrícula', description: 'Requisitos, fechas, valores', nameEn: 'Admission and enrollment', descriptionEn: 'Requirements, dates, fees' },
];

const now = () => new Date().toISOString();

export const docs: DocMeta[] = [
  { id: 'd1', title: 'Calendario académico 2026-2027', topicId: 'academico', kind: 'pdf', version: 'v2', docDate: '2026-08-12', origin: 'web', url: 'https://yachaytech.edu.ec/calendario-academico/', uploadedAt: '2026-08-14T10:00:00Z', uploadedBy: 'secretaria@yachaytech.edu.ec', status: 'indexado', chunks: 38, sizeKb: 412, history: [{ version: 'v1', docDate: '2026-06-02', replacedAt: '2026-08-14T10:00:00Z' }] },
  { id: 'd2', title: 'Reglamento de becas', topicId: 'becas', kind: 'pdf', version: '2025-3', docDate: '2025-11-20', origin: 'web', url: 'https://yachaytech.edu.ec/normativa/', uploadedAt: '2026-01-09T15:20:00Z', uploadedBy: 'bienestar@yachaytech.edu.ec', status: 'indexado', chunks: 64, sizeKb: 890 },
  { id: 'd3', title: 'Aranceles y valores de matrícula', topicId: 'admision', kind: 'xlsx', version: 'v1', docDate: '2026-07-01', origin: 'interno', uploadedAt: '2026-07-03T09:00:00Z', uploadedBy: 'financiero@yachaytech.edu.ec', status: 'indexado', chunks: 12, sizeKb: 96 },
  { id: 'd4', title: 'Horarios y ubicaciones de servicios', topicId: 'campus', kind: 'csv', version: 'v4', docDate: '2026-09-28', origin: 'interno', uploadedAt: '2026-09-29T08:30:00Z', uploadedBy: 'admin@yachaytech.edu.ec', status: 'indexado', chunks: 9, sizeKb: 14 },
  { id: 'd5', title: 'Guía de trámites estudiantiles', topicId: 'tramites', kind: 'pdf', version: 'v1', docDate: '2026-03-15', origin: 'web', url: 'https://yachaytech.edu.ec/normativa/', uploadedAt: '2026-03-20T11:00:00Z', uploadedBy: 'secretaria@yachaytech.edu.ec', status: 'indexado', chunks: 27, sizeKb: 350 },
  { id: 'd6', title: 'Reglamento de régimen académico', topicId: 'tramites', kind: 'pdf', version: '2026-1', docDate: '2026-02-10', origin: 'web', url: 'https://yachaytech.edu.ec/normativa/', uploadedAt: '2026-02-12T09:00:00Z', uploadedBy: 'secretaria@yachaytech.edu.ec', status: 'indexado', chunks: 112, sizeKb: 1480 },
  { id: 'd7', title: 'Reglamento de residencias universitarias', topicId: 'campus', kind: 'pdf', version: 'v3', docDate: '2026-05-04', origin: 'web', url: 'https://yachaytech.edu.ec/normativa/', uploadedAt: '2026-05-06T10:00:00Z', uploadedBy: 'bienestar@yachaytech.edu.ec', status: 'indexado', chunks: 31, sizeKb: 420 },
  { id: 'd8', title: 'Procedimiento de uso y reserva de laboratorios', topicId: 'campus', kind: 'pdf', version: 'v2', docDate: '2026-04-18', origin: 'interno', uploadedAt: '2026-04-20T14:00:00Z', uploadedBy: 'laboratorios@yachaytech.edu.ec', status: 'indexado', chunks: 18, sizeKb: 210 },
  { id: 'd9', title: 'Representantes estudiantiles 2026', topicId: 'representacion', kind: 'xlsx', version: 'v1', docDate: '2026-09-01', origin: 'web', url: 'https://yachaytech.edu.ec/normativa/', uploadedAt: '2026-09-02T12:00:00Z', uploadedBy: 'secretaria@yachaytech.edu.ec', status: 'indexado', chunks: 6, sizeKb: 22 },
];

export const trends: Trend[] = [
  { query: '¿Cómo hago un cambio de carrera?', topicId: 'tramites', count: 431, delta: 41 },
  { query: '¿Cómo justifico una inasistencia?', topicId: 'tramites', count: 318, delta: 17 },
  { query: '¿Cómo solicito una residencia?', topicId: 'campus', count: 254, delta: 33 },
  { query: '¿Dónde hay una sala de estudio?', topicId: 'campus', count: 188, delta: 54 },
  { query: '¿Quiénes son mis representantes estudiantiles?', topicId: 'representacion', count: 142, delta: 12 },
  { query: '¿Cómo reservo un laboratorio?', topicId: 'campus', count: 121, delta: 9 },
  { query: '¿Cuándo empiezan las clases del próximo semestre?', topicId: 'academico', count: 97, delta: -4 },
];

export const trendsEn: Record<string, string> = {
  '¿Cómo hago un cambio de carrera?': 'How do I change my major?',
  '¿Cómo justifico una inasistencia?': 'How do I justify an absence?',
  '¿Cómo solicito una residencia?': 'How do I apply for student housing?',
  '¿Dónde hay una sala de estudio?': 'Where is a study room?',
  '¿Quiénes son mis representantes estudiantiles?': 'Who are my student representatives?',
  '¿Cómo reservo un laboratorio?': 'How do I book a lab?',
  '¿Cuándo empiezan las clases del próximo semestre?': 'When does next semester start?',
};

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Cancelado', 'AbortError')); }, { once: true });
});

const src = (id: string, locator: string, snippet: string): Source => {
  const d = docs.find((x) => x.id === id)!;
  const page = Number(locator.match(/p[áa]g\. (\d+)/)?.[1]) || undefined;
  return { docId: d.id, title: d.title, version: d.version, docDate: d.docDate, locator, snippet, url: d.url, page: d.kind === 'pdf' ? page : undefined, origin: d.origin };
};

interface Proc { title: L; summary: L; office: L; placeId?: string; duration?: L; documents: L[]; steps: { title: L; detail?: L }[]; doc: string; locator: string; snippet: string }

interface Entry {
  id: string;
  match: RegExp;
  text: L;
  doc?: string; locator?: string; snippet?: string;
  procedure?: Proc;
  map?: string;
  follow: L[];
}

const secretaria = (lang: Lang) => ({ office: lang === 'en' ? "Registrar's Office" : 'Secretaría General', email: 'secretaria@yachaytech.edu.ec', placeId: 'admisiones' });

/** Base de conocimiento de ejemplo. Orden = prioridad. */
const KB: Entry[] = [
  {
    id: 'cambio-carrera', match: /(cambi\w* de carrera|cambiar(me)? de carrera|change (my )?(major|career|program))/,
    text: { es: 'Este es el procedimiento para **cambiar de carrera**. Solo se puede pedir una vez y dentro del plazo del calendario académico.', en: 'This is how to **change your major**. You can only request it once, within the academic calendar deadline.' },
    procedure: {
      title: { es: 'Cambio de carrera', en: 'Change of major' },
      summary: { es: 'Pasar de tu carrera actual a otra carrera de grado de la universidad, con homologación de materias aprobadas.', en: 'Move from your current major to another undergraduate program, transferring the courses you passed.' },
      office: { es: 'Secretaría General', en: "Registrar's Office" }, placeId: 'admisiones',
      duration: { es: '10 a 15 días hábiles', en: '10 to 15 business days' },
      documents: [
        { es: 'Solicitud de cambio de carrera (formulario F-SG-03)', en: 'Change of major request (form F-SG-03)' },
        { es: 'Récord académico actualizado', en: 'Updated academic transcript' },
        { es: 'Copia de cédula o pasaporte', en: 'Copy of ID or passport' },
      ],
      steps: [
        { title: { es: 'Revisa el plazo', en: 'Check the deadline' }, detail: { es: 'Se recibe en las dos primeras semanas del periodo.', en: 'Requests are received during the first two weeks of the term.' } },
        { title: { es: 'Llena el formulario F-SG-03', en: 'Fill in form F-SG-03' }, detail: { es: 'Indica la carrera de destino y el motivo.', en: 'State the target major and your reason.' } },
        { title: { es: 'Entrégalo en Secretaría General', en: 'Submit it at the Registrar office' }, detail: { es: 'Con el récord académico y tu documento de identidad.', en: 'Along with your transcript and ID.' } },
        { title: { es: 'Espera la resolución', en: 'Wait for the decision' }, detail: { es: 'La Escuela de destino revisa cupos y homologación.', en: 'The target School reviews seats and course transfer.' } },
        { title: { es: 'Matricúlate en la nueva carrera', en: 'Enroll in the new major' } },
      ],
      doc: 'd6', locator: 'pág. 18, art. 42', snippet: 'El cambio de carrera podrá solicitarse por una sola ocasión, dentro de las dos primeras semanas del periodo académico…',
    },
    follow: [{ es: '¿Dónde queda Secretaría?', en: 'Where is the Registrar office?' }, { es: '¿Cuándo empiezan las clases?', en: 'When do classes start?' }],
  },
  {
    id: 'inasistencia', match: /(justific\w*.*(falta|inasistencia)|inasistencia|falt[eé] a clase|justify (an )?absence|missed (a )?class|absence)/,
    text: { es: 'Para **justificar una inasistencia** tienes 3 días hábiles desde que te reincorporas.', en: 'To **justify an absence** you have 3 business days after you return.' },
    procedure: {
      title: { es: 'Justificación de inasistencia', en: 'Absence justification' },
      summary: { es: 'Validar faltas por enfermedad, calamidad doméstica o representación institucional.', en: 'Excuse absences due to illness, family emergency or institutional representation.' },
      office: { es: 'Bienestar Estudiantil', en: "Student Welfare Office" }, placeId: 'enfermeria',
      duration: { es: '3 días hábiles', en: '3 business days' },
      documents: [
        { es: 'Certificado médico o documento que respalde la causa', en: 'Medical certificate or supporting document' },
        { es: 'Solicitud dirigida al docente de la materia', en: 'Request addressed to the course professor' },
      ],
      steps: [
        { title: { es: 'Reúne el respaldo', en: 'Gather the supporting document' }, detail: { es: 'Certificado médico validado por el centro de salud de la universidad.', en: 'Medical certificate validated by the campus health center.' } },
        { title: { es: 'Valídalo en Bienestar Estudiantil', en: 'Get it validated at Student Welfare' } },
        { title: { es: 'Envía la solicitud al docente', en: 'Send the request to the professor' }, detail: { es: 'Dentro de 3 días hábiles desde tu reincorporación.', en: 'Within 3 business days after you return.' } },
        { title: { es: 'Coordina la recuperación de evaluaciones', en: 'Arrange any make-up assessments' } },
      ],
      doc: 'd6', locator: 'pág. 24, art. 57', snippet: 'Las inasistencias podrán justificarse dentro de los tres días hábiles siguientes a la reincorporación del estudiante…',
    },
    follow: [{ es: '¿Dónde queda Bienestar?', en: 'Where is Student Welfare?' }],
  },
  {
    id: 'residencia', match: /(solicit\w* (una )?residencia|residencia universitaria|acceder a (una )?residencia|apply for (student )?housing|housing|dorm application)/,
    text: { es: 'Las **residencias** se asignan por convocatoria cada periodo, priorizando a estudiantes de otras provincias.', en: '**Student housing** is assigned through a call each term, prioritizing students from other provinces.' },
    procedure: {
      title: { es: 'Solicitud de residencia', en: 'Student housing application' },
      summary: { es: 'Postular a un cupo en las residencias universitarias del campus.', en: 'Apply for a place in the on-campus residences.' },
      office: { es: 'Bienestar Estudiantil', en: "Student Welfare Office" }, placeId: 'residencias',
      duration: { es: 'Resultados en 2 semanas', en: 'Results in 2 weeks' },
      documents: [
        { es: 'Formulario de postulación', en: 'Application form' },
        { es: 'Ficha socioeconómica', en: 'Socioeconomic form' },
        { es: 'Certificado de domicilio', en: 'Proof of address' },
      ],
      steps: [
        { title: { es: 'Espera la convocatoria', en: 'Wait for the call' }, detail: { es: 'Se publica al cierre de matrículas.', en: 'Published when enrollment closes.' } },
        { title: { es: 'Postula en línea con tus documentos', en: 'Apply online with your documents' } },
        { title: { es: 'Entrevista con Bienestar Estudiantil', en: 'Interview with Student Welfare' } },
        { title: { es: 'Firma el acta de compromiso y recibe tu habitación', en: 'Sign the agreement and get your room' } },
      ],
      doc: 'd7', locator: 'pág. 5, art. 8', snippet: 'La asignación de plazas se realizará mediante convocatoria pública, priorizando a estudiantes cuyo domicilio se encuentre fuera de la provincia…',
    },
    follow: [{ es: '¿Dónde quedan las residencias?', en: 'Where are the residences?' }],
  },
  {
    id: 'laboratorio', match: /(reserv\w* (un |el )?laboratorio|book (a )?lab|reserve (a )?lab)/,
    text: { es: 'Los **laboratorios** se reservan con al menos 48 horas de anticipación y con el aval de un docente.', en: '**Labs** must be booked at least 48 hours in advance, with a professor\'s approval.' },
    procedure: {
      title: { es: 'Reserva de laboratorio', en: 'Lab booking' },
      summary: { es: 'Usar un laboratorio fuera del horario de clases para prácticas o proyectos.', en: 'Use a lab outside class hours for practice or projects.' },
      office: { es: 'Coordinación de Laboratorios', en: "Lab Coordination Office" }, placeId: 'laboratorios',
      duration: { es: 'Respuesta en 24 horas', en: 'Answer within 24 hours' },
      documents: [
        { es: 'Formulario de reserva con aval del docente', en: 'Booking form approved by a professor' },
        { es: 'Certificado del curso de seguridad en laboratorios', en: 'Lab safety course certificate' },
      ],
      steps: [
        { title: { es: 'Pide el aval de tu docente', en: "Get your professor's approval" } },
        { title: { es: 'Envía el formulario con 48 h de anticipación', en: 'Send the form 48 h in advance' } },
        { title: { es: 'Recibe la confirmación por correo', en: 'Receive the confirmation by email' } },
        { title: { es: 'Presenta tu carné al técnico del laboratorio', en: 'Show your student ID to the lab technician' } },
      ],
      doc: 'd8', locator: 'pág. 3, sección 4', snippet: 'Toda reserva deberá solicitarse con un mínimo de 48 horas de anticipación y contar con el aval de un docente responsable…',
    },
    follow: [{ es: '¿Dónde quedan los laboratorios?', en: 'Where are the labs?' }],
  },
  {
    id: 'representacion', match: /(representa\w* estudiant\w*|mis representantes|consejo estudiantil|student (council|representative)s?|who represents)/,
    text: {
      es: 'La **representación estudiantil** 2026 está conformada así:\n\n- **Consejo Superior Universitario**: 2 representantes estudiantiles.\n- **Consejo de cada Escuela**: 1 representante por Escuela.\n- **Asociación de Estudiantes**: directiva elegida por votación.\n\nPuedes escribirles a representacion@yachaytech.edu.ec o acercarte a su oficina.',
      en: 'The 2026 **student representation** is:\n\n- **University Board**: 2 student representatives.\n- **Each School Council**: 1 representative per School.\n- **Student Association**: board elected by vote.\n\nYou can email representacion@yachaytech.edu.ec or visit their office.',
    },
    doc: 'd9', locator: 'hoja Representantes, filas 2 a 9', snippet: 'Consejo Superior Universitario | Representante estudiantil principal | periodo 2026-2027',
    map: 'representacion',
    follow: [{ es: '¿Cómo puedo ser representante?', en: 'How can I become a representative?' }],
  },
  {
    id: 'becas', match: /(beca|scholarship)/,
    text: {
      es: 'Según el reglamento vigente hay tres tipos de beca:\n\n- **Excelencia académica**: promedio igual o mayor a 9/10.\n- **Situación socioeconómica**: con informe de Bienestar Estudiantil.\n- **Deportiva y cultural**: por representación institucional.\n\nPara **renovarla** debes aprobar todas las materias del periodo.',
      en: 'Under the current rules there are three scholarship types:\n\n- **Academic excellence**: GPA of 9/10 or higher.\n- **Socioeconomic need**: with a Student Welfare report.\n- **Sports and culture**: for representing the university.\n\nTo **renew** it you must pass every course of the term.',
    },
    doc: 'd2', locator: 'pág. 7, art. 12', snippet: 'Las becas se renuevan por periodo académico siempre que el estudiante apruebe la totalidad de asignaturas…',
    follow: [{ es: '¿Dónde queda Bienestar?', en: 'Where is Student Welfare?' }],
  },
  {
    id: 'calendario', match: /(clases|semestre|calendario|examen|feriado|semester|classes start|calendar|exam)/,
    text: {
      es: 'El próximo periodo académico empieza el **lunes 2 de marzo de 2027**:\n\n- Matrículas ordinarias: 9 al 20 de febrero.\n- Exámenes parciales: semana del 20 de abril.\n- Fin de clases: 10 de julio.',
      en: 'The next term starts on **Monday, March 2, 2027**:\n\n- Regular enrollment: February 9 to 20.\n- Midterms: week of April 20.\n- Last day of classes: July 10.',
    },
    doc: 'd1', locator: 'pág. 2', snippet: 'Inicio de clases periodo 2027-1: 02/03/2027…',
    follow: [{ es: '¿Cómo hago un cambio de carrera?', en: 'How do I change my major?' }],
  },
];

const OUT_OF_DOMAIN = /(clima|fútbol|futbol|receta|chiste|bitcoin|presidente|película|weather|football|recipe|joke|movie|crypto)/;

export interface Answer {
  entryId: string | null;
  text: string;
  sources: Source[];
  procedure?: Procedure;
  unknown?: Unknown;
  map?: string;
  link?: { label: string; href: string };
  follow: string[];
}

/** Lógica de respuesta del simulador. Se usa también para el set de control (Admin → Validación). */
export function answerFor(q: string, lang: Lang): Answer {
  const t = q.toLowerCase();
  const isEn = lang === 'en';
  if (OUT_OF_DOMAIN.test(t)) {
    return { entryId: null, text: '', sources: [], unknown: { reason: 'fuera_de_dominio' }, follow: topTrends(lang, 3) };
  }
  if (/(qu[ée] documentos|cu[áa]les (son los )?documentos|qu[ée] informaci[óo]n tienes|qu[ée] sabes|what documents|which documents|what do you know|documentos (disponibles|tienes|hay))/.test(t)) {
    const list = publicDocs();
    const web = list.filter((d) => d.origin === 'web').length;
    const head = isEn
      ? `I answer from **${list.length} official documents** (${web} published on the university website, ${list.length - web} internal):`
      : `Respondo con **${list.length} documentos oficiales** (${web} publicados en la página web de la universidad y ${list.length - web} internos):`;
    const lines = topics
      .map((tp) => ({ tp, n: list.filter((d) => d.topicId === tp.id).length }))
      .filter((x) => x.n > 0)
      .map(({ tp, n }) => `- ${isEn ? tp.nameEn ?? tp.name : tp.name}: ${n}`)
      .join('\n');
    return {
      entryId: 'inventario', text: `${head}\n\n${lines}`, sources: [],
      link: { label: isEn ? 'See all documents' : 'Ver todos los documentos', href: '#/documentos' },
      follow: topTrends(lang, 2),
    };
  }
  for (const e of KB) {
    if (!e.match.test(t)) continue;
    const sources = e.doc ? [src(e.doc, e.locator!, e.snippet!)] : [];
    let procedure: Procedure | undefined;
    if (e.procedure) {
      const p = e.procedure;
      const s = src(p.doc, p.locator, p.snippet);
      sources.push(s);
      procedure = {
        title: pick(p.title, lang), summary: pick(p.summary, lang), office: pick(p.office, lang), placeId: p.placeId,
        duration: p.duration && pick(p.duration, lang), documents: p.documents.map((d) => pick(d, lang)),
        steps: p.steps.map((x) => ({ title: pick(x.title, lang), detail: x.detail && pick(x.detail, lang) })), source: s,
      };
    }
    return { entryId: e.id, text: pick(e.text, lang), sources, procedure, map: e.map, follow: e.follow.map((f) => pick(f, lang)) };
  }
  const place = findPlace(t);
  if (place && /(dónde|donde|llegar|ubica|queda|hay|mapa|where|how do i get|find|located)/.test(t)) {
    return {
      entryId: `lugar:${place.id}`,
      text: isEn ? `**${placeName(place, 'en')}** is marked on the map. From the main gate, follow the footpath and the arrow to the building.` : `**${place.name}** está marcada en el mapa. Desde la entrada principal, sigue el camino peatonal y la flecha hasta el edificio.`,
      sources: [src('d4', 'hoja Ubicaciones, fila 4', `${place.name}: lunes a viernes, 08:00 a 18:00.`)],
      map: place.id,
      follow: topTrends(lang, 2),
    };
  }
  return { entryId: null, text: '', sources: [], unknown: { reason: 'sin_fuente', contact: secretaria(lang) }, follow: topTrends(lang, 3) };
}

const topTrends = (lang: Lang, n: number) => trends.slice(0, n).map((x) => (lang === 'en' ? trendsEn[x.query] ?? x.query : x.query));

export async function* mockChat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const t0 = performance.now();
  const en = req.lang === 'en';
  const a = answerFor(req.message, req.lang);
  if (req.attachments?.length) {
    yield { type: 'status', label: en ? `Reading ${req.attachments.length} attachment(s)` : `Leyendo ${req.attachments.length} adjunto(s)` };
    await wait(500, signal);
  }
  yield { type: 'status', label: en ? 'Searching official documents' : 'Buscando en los documentos oficiales' };
  await wait(450, signal);
  if (a.unknown) {
    yield { type: 'status', label: en ? 'Checking relevance' : 'Comprobando relevancia' };
    await wait(300, signal);
    yield { type: 'unknown', item: a.unknown };
    yield { type: 'suggestions', items: a.follow };
    yield { type: 'done', messageId: crypto.randomUUID(), latencyMs: Math.round(performance.now() - t0) };
    return;
  }
  if (a.sources.length) {
    yield { type: 'status', label: `${en ? 'Reading' : 'Leyendo'} ${a.sources[0]!.title}` };
    await wait(350, signal);
  }
  if (a.map) yield { type: 'tool', name: 'mostrar_en_mapa', input: { destino: a.map, origen: 'entrada' } };
  const parts = a.text.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < parts.length;) {
    const n = 1 + Math.floor(Math.random() * 3);
    yield { type: 'token', text: parts.slice(i, i + n).join('') };
    i += n;
    await wait(22 + Math.random() * 30, signal);
  }
  if (a.procedure) yield { type: 'procedure', item: a.procedure };
  if (a.link) yield { type: 'link', ...a.link };
  if (a.sources.length) yield { type: 'sources', items: dedupe(a.sources) };
  yield { type: 'suggestions', items: a.follow };
  yield { type: 'done', messageId: crypto.randomUUID(), latencyMs: Math.round(performance.now() - t0) };
}

const dedupe = (s: Source[]) => s.filter((x, i) => s.findIndex((y) => y.docId === x.docId && y.locator === x.locator) === i);

// ---------- Set de control para validar veracidad ----------

export interface ControlCase {
  id: string;
  q: string;
  lang: Lang;
  /** Documento que debe citar, o 'no_se' si la respuesta correcta es no responder. */
  expect: string;
}

/** Preguntas de control de ejemplo. El set real se arma con los documentos del Día 1 (mínimo 100, ver README). */
export const controlSet: ControlCase[] = [
  { id: 'C01', q: '¿Cómo hago un cambio de carrera?', lang: 'es', expect: 'd6' },
  { id: 'C02', q: 'How do I change my major?', lang: 'en', expect: 'd6' },
  { id: 'C03', q: 'Me enfermé, ¿cómo justifico una inasistencia?', lang: 'es', expect: 'd6' },
  { id: 'C04', q: 'How do I justify an absence?', lang: 'en', expect: 'd6' },
  { id: 'C05', q: '¿Cómo solicito una residencia universitaria?', lang: 'es', expect: 'd7' },
  { id: 'C06', q: 'How do I apply for student housing?', lang: 'en', expect: 'd7' },
  { id: 'C07', q: '¿Cómo reservo un laboratorio para mi proyecto?', lang: 'es', expect: 'd8' },
  { id: 'C08', q: 'Can I book a lab on Saturday?', lang: 'en', expect: 'd8' },
  { id: 'C09', q: '¿Quiénes son mis representantes estudiantiles?', lang: 'es', expect: 'd9' },
  { id: 'C10', q: 'Who is on the student council?', lang: 'en', expect: 'd9' },
  { id: 'C11', q: '¿Dónde hay una sala de estudio?', lang: 'es', expect: 'd4' },
  { id: 'C12', q: 'Where is the library?', lang: 'en', expect: 'd4' },
  { id: 'C13', q: '¿Dónde quedan las residencias?', lang: 'es', expect: 'd4' },
  { id: 'C14', q: '¿Qué becas hay?', lang: 'es', expect: 'd2' },
  { id: 'C15', q: 'When does the next semester start?', lang: 'en', expect: 'd1' },
  { id: 'C21', q: '¿Qué documentos tienes?', lang: 'es', expect: 'inventario' },
  { id: 'C16', q: '¿Cuál es el sueldo del rector?', lang: 'es', expect: 'no_se' },
  { id: 'C17', q: '¿Qué clima hará mañana en Urcuquí?', lang: 'es', expect: 'no_se' },
  { id: 'C18', q: 'Tell me a joke', lang: 'en', expect: 'no_se' },
  { id: 'C19', q: '¿Puedo llevar mascotas a la residencia?', lang: 'es', expect: 'no_se' },
  { id: 'C20', q: '¿Cuánto cuesta el parqueadero?', lang: 'es', expect: 'no_se' },
];

export interface ControlResult extends ControlCase {
  got: string;
  ok: boolean;
  /** Respondió con contenido sin citar ninguna fuente: se cuenta como alucinación. */
  hallucination: boolean;
  ms: number;
}

export async function runControl(onProgress?: (done: number) => void): Promise<ControlResult[]> {
  const out: ControlResult[] = [];
  for (const c of controlSet) {
    const t0 = performance.now();
    const a = answerFor(c.q, c.lang);
    await wait(60);
    const got = a.unknown ? 'no_se' : a.entryId === 'inventario' ? 'inventario' : a.sources.map((s) => s.docId).join(',');
    const ok = c.expect === 'no_se' ? !!a.unknown : c.expect === 'inventario' ? a.entryId === 'inventario' : a.sources.some((s) => s.docId === c.expect);
    out.push({ ...c, got, ok, hallucination: !a.unknown && a.sources.length === 0 && a.entryId !== 'inventario', ms: Math.round(performance.now() - t0) + 620 });
    onProgress?.(out.length);
  }
  return out;
}

/** Lo que cualquier usuario puede ver: solo documentos indexados y vigentes, sin quién los subió. */
export const publicDocs = (): PublicDoc[] =>
  docs.filter((d) => d.status === 'indexado').map(({ id, title, topicId, kind, version, docDate, origin, url }) => ({ id, title, topicId, kind, version, docDate, origin, url }));

export async function mockUpload(input: UploadInput, onProgress: (p: number) => void): Promise<DocMeta> {
  for (let p = 0; p <= 100; p += 10) { onProgress(p); await wait(90); }
  const prev = input.replaces ? docs.find((d) => d.id === input.replaces) : undefined;
  const doc: DocMeta = {
    id: prev?.id ?? crypto.randomUUID().slice(0, 8),
    title: input.title, topicId: input.topicId, version: input.version, docDate: input.docDate,
    origin: input.origin, url: input.url,
    kind: input.file.name.split('.').pop()!.toLowerCase() as DocMeta['kind'],
    uploadedAt: now(), uploadedBy: 'admin@yachaytech.edu.ec', status: 'procesando', chunks: 0,
    sizeKb: Math.max(1, Math.round(input.file.size / 1024)),
    history: prev ? [{ version: prev.version, docDate: prev.docDate, replacedAt: now() }, ...(prev.history ?? [])] : undefined,
  };
  if (prev) docs.splice(docs.indexOf(prev), 1, doc); else docs.unshift(doc);
  setTimeout(() => { doc.status = 'indexado'; doc.chunks = Math.max(3, Math.round(doc.sizeKb / 12)); }, 3500);
  return doc;
}
