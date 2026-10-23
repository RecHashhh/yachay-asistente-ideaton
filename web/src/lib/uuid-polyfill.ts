// crypto.randomUUID solo existe en contextos seguros (https o localhost). Al abrir la app por la IP de la red local
// (http://192.168.x.x) no está disponible y la app no arrancaba; getRandomValues sí funciona en ese contexto.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: () => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6]! & 0x0f) | 0x40; // versión 4
      b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 4122
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  });
}

export {};
