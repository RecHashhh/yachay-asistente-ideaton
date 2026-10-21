/**
 * Archivo de calendario (.ics, RFC 5545) para "Añadir al calendario": lo abren Google Calendar, Outlook y Apple Calendar.
 * Se genera en el navegador; no necesita backend ni cuentas.
 */

export interface Deadline {
  title: string;
  /** Fecha de inicio (yyyy-mm-dd), evento de día completo. */
  start: string;
  /** Último día incluido (yyyy-mm-dd). Si falta, dura un día. */
  end?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
const ymd = (iso: string) => iso.replaceAll('-', '');
const nextDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function deadlineIcs(d: Deadline, description: string): string {
  for (const date of [d.start, d.end ?? d.start]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date');
  }
  if (d.end && d.end < d.start) throw new Error('Invalid calendar range');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yachay Tech//Yachi//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@yachi.yachaytech.edu.ec`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(d.start)}`,
    // En eventos de día completo DTEND es exclusivo: el día siguiente al último.
    `DTEND;VALUE=DATE:${ymd(nextDay(d.end ?? d.start))}`,
    `SUMMARY:${esc(d.title)}`,
    `DESCRIPTION:${esc(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(d.title)}`, 'TRIGGER:-P1D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldLine).join('\r\n');
}

/** RFC 5545: máximo 75 octetos por línea, sin partir caracteres UTF-8. */
function foldLine(line: string): string {
  let out = '', bytes = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) { out += '\r\n '; bytes = 1; }
    out += char; bytes += length;
  }
  return out;
}

export function downloadIcs(d: Deadline, description: string) {
  const blob = new Blob([deadlineIcs(d, description)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${d.title.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
