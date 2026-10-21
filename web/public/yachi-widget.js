/*!
 * Widget del asistente Yachi para incrustar en cualquier página (estilo Messenger).
 *
 *   <script src="https://ASISTENTE/yachi-widget.js" data-lang="es" defer></script>
 *
 * Atributos opcionales:
 *   data-host   URL donde vive el asistente (por defecto, la misma de este script)
 *   data-lang   es | en | qu  (por defecto, el idioma del navegador)
 *   data-greet  texto del globo de bienvenida ("" para no mostrarlo)
 *
 * El chat corre en un iframe (#/embed): la página anfitriona no ve la conversación ni puede alterar el asistente.
 */
(function () {
  if (window.__yachiWidget) return;
  window.__yachiWidget = true;

  var me = document.currentScript;
  var host = (me && me.dataset.host) || (me ? new URL(me.src).origin : location.origin);
  var lang = (me && me.dataset.lang) || ((navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es');
  var greet = me && me.dataset.greet !== undefined ? me.dataset.greet : lang === 'en' ? 'Hi! Need help with a procedure?' : '¡Hola! ¿Te ayudo con algún trámite?';
  var BLUE = '#27618E';

  var css = '' +
    '.yw-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;background:' + BLUE + ';box-shadow:0 6px 20px rgba(20,22,40,.25);cursor:pointer;z-index:2147483000;display:grid;place-items:center;transition:transform .2s cubic-bezier(.2,.8,.2,1)}' +
    '.yw-btn:hover{transform:scale(1.06)}.yw-btn:focus-visible{outline:3px solid #06B0EE;outline-offset:3px}' +
    '.yw-btn svg,.yw-btn img{width:44px;height:44px;transition:transform .25s,opacity .2s}' +
    '.yw-btn .yw-x{position:absolute;opacity:0;transform:rotate(-90deg);width:24px;height:24px}' +
    '.yw-open .yw-btn .yw-face{opacity:0;transform:scale(.5)}.yw-open .yw-btn .yw-x{opacity:1;transform:none}' +
    '.yw-panel{position:fixed;right:20px;bottom:92px;width:400px;height:min(640px,calc(100vh - 120px));border-radius:16px;overflow:hidden;box-shadow:0 12px 48px rgba(20,22,40,.28);z-index:2147483000;background:#fff;opacity:0;transform:translateY(16px) scale(.96);transform-origin:bottom right;pointer-events:none;transition:opacity .22s,transform .28s cubic-bezier(.2,.8,.2,1)}' +
    '.yw-open .yw-panel{opacity:1;transform:none;pointer-events:auto}' +
    '.yw-panel iframe{width:100%;height:100%;border:0;display:block}' +
    '.yw-greet{position:fixed;right:90px;bottom:34px;max-width:240px;background:#fff;color:#14161f;font:500 14px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:14px 14px 4px 14px;box-shadow:0 6px 20px rgba(20,22,40,.18);z-index:2147483000;cursor:pointer;opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}' +
    '.yw-greet.show{opacity:1;transform:none}.yw-open .yw-greet{display:none}' +
    '.yw-dot{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#06B0EE;border:2px solid #fff}.yw-open .yw-dot,.yw-seen .yw-dot{display:none}' +
    '@media (max-width:520px){.yw-panel{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0}.yw-open .yw-btn{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.yw-btn,.yw-panel,.yw-greet{transition:none}}';

  var face = document.createElement('img');
  face.className = 'yw-face';
  face.src = host + '/favicon.svg';
  face.alt = '';
  face.setAttribute('aria-hidden', 'true');
  var x = '<svg class="yw-x" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var root = document.createElement('div');
  root.className = 'yw-root';
  var style = document.createElement('style');
  style.textContent = css;
  var btn = document.createElement('button');
  btn.className = 'yw-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', lang === 'en' ? 'Open assistant' : 'Abrir asistente');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = x + '<span class="yw-dot"></span>';
  btn.prepend(face);
  var panel = document.createElement('div');
  panel.className = 'yw-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Yachi');
  var bubble = document.createElement('div');
  bubble.className = 'yw-greet';
  bubble.textContent = greet;

  var iframe = null;
  function open() {
    if (!iframe) {
      // Se carga recién al abrir: no pesa en la página anfitriona hasta que alguien lo usa.
      iframe = document.createElement('iframe');
      iframe.title = 'Asistente Yachi';
      iframe.allow = 'microphone; clipboard-write; display-capture';
      iframe.src = host + '/#/embed?lang=' + encodeURIComponent(lang);
      panel.appendChild(iframe);
    }
    root.classList.add('yw-open', 'yw-seen');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', lang === 'en' ? 'Close assistant' : 'Cerrar asistente');
    try { sessionStorage.setItem('yw-seen', '1'); } catch (e) {}
    setTimeout(function () { iframe && iframe.focus(); }, 300);
  }
  function close() {
    root.classList.remove('yw-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', lang === 'en' ? 'Open assistant' : 'Abrir asistente');
    btn.focus();
  }
  btn.addEventListener('click', function () { root.classList.contains('yw-open') ? close() : open(); });
  bubble.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('yw-open')) close(); });
  window.addEventListener('message', function (e) {
    if (e.origin === host && e.data && e.data.type === 'yachi:close') close();
  });

  root.appendChild(style);
  root.appendChild(panel);
  root.appendChild(bubble);
  root.appendChild(btn);
  document.body.appendChild(root);

  var seen = false;
  try { seen = sessionStorage.getItem('yw-seen') === '1'; } catch (e) {}
  if (seen) root.classList.add('yw-seen');
  else if (greet) setTimeout(function () { bubble.classList.add('show'); }, 2500);
})();
