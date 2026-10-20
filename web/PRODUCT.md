# Product

## Register

product

## Users

Estudiantes de Yachay Tech (pregrado y posgrado), en especial estudiantes nuevos y de intercambio que no dominan del todo el español. Llegan con una pregunta concreta y apuro: cómo hacer un trámite (cambio de carrera, justificar una inasistencia, pedir una residencia, reservar un laboratorio), dónde queda un lugar del campus o quién los representa. Lo usan desde el celular entre clases o desde la página web de la universidad, sin haber leído instrucciones.

Segundo usuario: personal administrativo (Secretaría, Bienestar, Laboratorios) que sube y versiona los documentos oficiales en el portal de administración.

## Product Purpose

Un asistente conversacional que centraliza los procedimientos oficiales de la universidad y responde solo con documentos verificados, citando documento, versión y fecha, y diciendo "no sé" cuando no hay fuente. Éxito: el estudiante resuelve su duda en una conversación, sin ir a una oficina ni escribir un correo, y puede comprobar de dónde sale cada dato.

Contexto: prototipo para el Reto 1 del Ideatón Yachay Open Science Week 2026, evaluado por rigor, calidad técnica, mitigación de alucinaciones, UX y bilingüismo, costo computacional y uso documentado de IA.

## Brand Personality

Cercano, claro, confiable. La mascota habla como un compañero de años superiores que sabe dónde está todo, pero nunca inventa: cada dato con su fuente. Minimalista y directo, sin adornos que distraigan de la respuesta. Las micro-interacciones (texto que aparece, mascota que piensa) dan calidez y sensación de respuesta inmediata, no espectáculo.

## Anti-references

- Chatbot genérico de IA: morado, degradados, brillos, "sparkles" por todas partes; que se note hecho con IA.
- Portal universitario saturado: menús enormes, banners, muros de texto; justo el problema que el asistente viene a resolver.

## Design Principles

1. **La fuente es parte de la respuesta.** Documento, versión, fecha y fragmento siempre a un clic; el "no sé" es una respuesta digna, no un error.
2. **Primer uso sin instrucciones.** Lo que se puede preguntar se ve (tendencias, sugerencias), no se explica.
3. **Pasos, no párrafos.** Un trámite se muestra como lista ordenada con documentos y lugar, que el estudiante puede ir marcando.
4. **Dos idiomas de verdad.** Inglés con la misma calidad que el español, incluidos nombres de temas, oficinas y lugares.
5. **Calidez con propósito.** La mascota y el movimiento comunican estado (buscando, respondiendo), nunca decoran.

## Accessibility & Inclusion

WCAG 2.2 AA. Público diverso: estudiantes de intercambio (idioma), uso en celular con una mano, lectores de pantalla. Respetar `prefers-reduced-motion`, contraste AA en tema claro y oscuro, todo operable con teclado, estados anunciados a lectores de pantalla (respuesta en curso, errores). Dictado por voz como alternativa a escribir.
