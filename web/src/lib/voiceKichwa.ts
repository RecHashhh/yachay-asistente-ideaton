import { BRAND } from '../config';

/** Requested experimental UI drafts. Not certified translations or human-approved pairs. */
export const kichwaVoice = {
  title: `${BRAND.mascotName}pa rimay`,
  start: 'Rimayta kallarina',
  startHint: 'Munashpaka Yachiwan rimay.',
  welcome: `Imanalla. Ñuka shutika ${BRAND.mascotName}. Uyarishka kipaka tapuy.`,
  help: 'Yachaywasipa ruraykunamanta, kamachikunamanta, yanapaykunamanta, kuskakunamantapash tapuyta ushanki. Rimankapak ␣ ñitiy. Kutin uyanapak R ñitiy; katinkapak N ñitiy; llukshinkapak Escape ñitiy.',
  listening: 'Kikinta uyani…', thinking: 'Yachaywasipa killkakunapi maskani…',
  speaking: 'Yachika rimakun…', idle: 'Kikinta uyankapakmi kani.',
  talk: 'Rimana', stop: 'Harkana', exit: 'Rimaymanta llukshina',
  notHeard: 'Kikinta mana uyashkanichu. Kutin ruray.',
  noStt: 'Kay navegador rimayta mana chaskinchu. Kaypi tapuyta killkay.',
  micDenied: 'Microfonota llamkachinkapak sakita rikuy.',
  typed: 'Shinallatak tapuyta killkay', send: 'Kachana',
  pii: 'Kikinpa willayta anchuchishkani.', noSteps: 'Kay kutichipi ruray ñankuna mana tiyanchu.',
  lastStep: 'Chayka puchukay ruraymi karka.', firstStep: 'Kallari ruraypimi kanki.',
  speed: 'Rimaypa utkayay', voice: 'Rimay', auto: 'Tukuchishpa kutin uyana',
  bye: 'Rimaymanta llukshikuni.', slower: 'Allimanta rimasha.', faster: 'Ashtawan utkalla rimasha.',
  you: 'Kikin', yachi: BRAND.mascotName,
};

export const kichwaVoiceLabels = {
  info: 'Rimaymanta willay', settings: 'Rimayta allichina', closePanel: 'Wichkana',
  transcribing: 'Rimayta killkakuni…',
  editTranscript: 'Uyarishka killkata allichiy, mana kashpaka tapuyta Kichwapi killkay.',
  naturalSpeech: 'Sapanlla rimay. Microfonopa ñitinawan kutichita harkayta ushanki.',
  recordingNote: 'Chinlla kakpika rimayta japina tukurin. Ama yallinkapak: 15 segundokama. Yachika rimayta rurashpa mana wakaychinchu. Manarak kachashpa killkata rikuy.',
  voiceNote: 'Kayka Tenamanta (Ecuador) shina rimaymi kan, chayta taripakunchik. Alli rimashkata Kichwa rimakkunawan rikunarakmi kan.',
  browserNote: 'Kay navegador rimayta chaskin. Rimayta tukuchishpaka samay.',
  defaultVoice: 'Kikinmanta akllashka rimay', ttsUnavailable: 'Kay navegador rimayta mana uyachiyta ushanchu.',
  tryVoice: 'Kichwa rimayta uyana', tenaVoice: 'Tenamanta Kichwa', unavailable: 'mana tiyan',
  omittedData: '[kikinpa willay anchuchishka]', voiceError: 'Rimayta mana uyachiyta ushashkachu. Kutin ruray.',
};

export const voiceLabels = {
  es: {
    info: 'Información del modo voz', settings: 'Configuración de voz', closePanel: 'Cerrar panel',
    transcribing: 'Transcribiendo…', editTranscript: 'Edita la transcripción o escribe tu consulta en Kichwa.',
    naturalSpeech: 'Habla con naturalidad. Puedes interrumpir la respuesta con el botón del micrófono.',
    recordingNote: 'La grabación termina al detectar silencio. Límite de seguridad: 15 segundos. El audio se procesa en Yachi y no se guarda. Revisa la transcripción antes de enviarla.',
    voiceNote: 'Voz experimental de Tena (Ecuador); la pronunciación está pendiente de validación.',
    browserNote: 'El reconocimiento utiliza el servicio de tu navegador. Haz una pausa al terminar para cerrar tu turno.',
    defaultVoice: 'Predeterminada del sistema', ttsUnavailable: 'Este navegador no puede leer en voz alta.',
    tryVoice: 'Probar voz Kichwa', tenaVoice: 'Kichwa de Tena', unavailable: 'no disponible',
    omittedData: '[dato omitido]', voiceError: 'No se pudo reproducir la voz. Intenta de nuevo.',
  },
  en: {
    info: 'Voice information', settings: 'Voice settings', closePanel: 'Close panel',
    transcribing: 'Transcribing…', editTranscript: 'Edit the transcript or write your question in Kichwa.',
    naturalSpeech: 'Speak naturally. You can interrupt the answer using the microphone button.',
    recordingNote: 'Recording ends after silence. Safety limit: 15 seconds. Yachi processes the audio without storing it. Review the transcript before sending.',
    voiceNote: 'Experimental Tena (Ecuador) voice; pronunciation needs validation.',
    browserNote: 'Speech recognition uses your browser’s service. Pause when you finish speaking to end your turn.',
    defaultVoice: 'System default', ttsUnavailable: 'Speech output is not available in this browser.',
    tryVoice: 'Try Kichwa voice', tenaVoice: 'Tena Kichwa', unavailable: 'unavailable',
    omittedData: '[removed]', voiceError: 'Could not play the voice. Please try again.',
  },
  qu: kichwaVoiceLabels,
};
