/**
 * Datos de marca. PROVISIONALES: reemplázalos con el nombre oficial de la mascota y el manual de marca de Yachay Tech.
 * El arte de la mascota vive en components/Mascot.tsx.
 */
export const BRAND = {
  university: 'Yachay Tech',
  mascotName: 'Yachi',
  tagline: 'Asistente institucional con IA',
  /** Versión del aviso de datos. Súbela cuando cambie el texto para volver a pedir la aceptación. */
  consentVersion: '2026-10b',
  contact: 'secretaria@yachaytech.edu.ec',
};

/**
 * Datos del aviso de privacidad (LOPDP, art. 12). TODOS POR CONFIRMAR con el área legal y el delegado de protección de datos
 * de la universidad antes de publicar: son una propuesta para el prototipo.
 */
export const PRIVACY = {
  controller: 'Universidad de Investigación de Tecnología Experimental Yachay',
  address: 'Hacienda San José s/n y Proyecto Yachay, San Miguel de Urcuquí, Imbabura, Ecuador',
  phone: '(06) 299 9100',
  email: 'secretaria@yachaytech.edu.ec',
  dpoEmail: 'protecciondedatos@yachaytech.edu.ec',
  retention: 'Las preguntas anónimas se conservan 12 meses para estadísticas y luego se eliminan. Los adjuntos no se guardan después de responder.',
  retentionEn: 'Anonymous questions are kept for 12 months for statistics and then deleted. Attachments are not stored after the answer.',
  transfer: 'Las preguntas se procesan con un proveedor de modelos de lenguaje con servidores en Estados Unidos, bajo contrato que impide usarlas para entrenar sus modelos.',
  transferEn: 'Questions are processed by a language model provider with servers in the United States, under a contract that forbids using them to train its models.',
};
