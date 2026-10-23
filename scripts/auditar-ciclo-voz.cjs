// Deterministic browser audit: native recognition/TTS and model responses are simulated.
// Kichwa still uses real browser microphone capture with a fake microphone device.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = { docId: 'audit', title: 'Synthetic source', snippet: '', version: 'v1', url: 'https://example.edu/audit.pdf' };
const procedure = { title: 'Synthetic procedure', summary: 'Official test summary.', office: 'Test office', documents: ['Test document'], steps: [{ title: 'First official action', detail: 'First detail.' }, { title: 'Second official action', detail: 'Second detail.' }], source };
const labels = {
  es: { map: 'Abrir ubicación en Google Maps', next: 'Siguiente paso', previous: 'Paso anterior', repeat: 'Repetir', all: 'Escuchar todos los pasos', answer: 'Ver respuesta en el chat', source: 'Abrir documento fuente', send: 'Enviar' },
  en: { map: 'Open location in Google Maps', next: 'Next step', previous: 'Previous step', repeat: 'Repeat', all: 'Hear all steps', answer: 'View answer in chat', source: 'Open source document', send: 'Send' },
  qu: { map: 'Google Mapspi kuskata rikuna', next: 'Katina', previous: 'Ñawpa ruray', repeat: 'Kutin uyana', all: 'Tukuy ruraykunata uyana', answer: 'Rimanakuypi kutichita rikuna', source: 'Killkashka pankata kichana', send: 'Kachana' },
};
const wav = Buffer.alloc(3244);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(3200, 40);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const results = [];
  try {
    for (const lang of ['es', 'en', 'qu']) {
      const page = await browser.newPage({ permissions: ['microphone'], viewport: { width: lang === 'qu' ? 390 : 1280, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('yt-consent-2026-10c', '1');
        localStorage.setItem('yt-voice', JSON.stringify({ rate: 1, autoListen: true }));
        window.__spoken = [];
        window.__holdVoice = false;
        window.__failNext = false;
        window.__tracks = [];
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async options => {
          const stream = await getUserMedia(options);
          window.__tracks.push(...stream.getTracks());
          return stream;
        };
        window.__sr = { instances: [], active: 0, maxActive: 0, starts: 0 };
        class Recognition {
          running = false;
          constructor() { window.__sr.instances.push(this); }
          start() {
            this.running = true; window.__sr.active++; window.__sr.starts++;
            window.__sr.maxActive = Math.max(window.__sr.active, window.__sr.maxActive);
            if (window.__failNext) { window.__failNext = false; queueMicrotask(() => { this.release(); this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }); }
          }
          release() { if (this.running) { this.running = false; window.__sr.active--; } }
          stop() { this.release(); setTimeout(() => this.onend?.(), 40); }
          abort() { this.release(); /* no event: cancellation must settle anyway */ }
          emit(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.stop(); }
        }
        window.SpeechRecognition = window.webkitSpeechRecognition = Recognition;
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
          getVoices: () => [{ name: 'Test ES', lang: 'es-EC', voiceURI: 'es' }, { name: 'Test EN', lang: 'en-US', voiceURI: 'en' }],
          addEventListener() {}, removeEventListener() {}, cancel() {},
          speak(utterance) { window.__spoken.push(utterance.text); if (!window.__holdVoice) setTimeout(() => utterance.onend?.(), 5); },
        } });
      });
      let calls = 0;
      let delayAnswer = false;
      let failKichwa = false;
      let failSynthesis = false;
      await page.route('**/__yachi_api/**', route => route.fulfill({ json: [] }));
      await page.route('**/speech/capabilities', route => route.fulfill({ json: { kichwaAsr: true, kichwaTts: true } }));
      await page.route('**/speech/transcribe', route => route.fulfill({ status: failKichwa ? 503 : 200, json: failKichwa ? { detail: 'unavailable' } : { text: 'audit question' } }));
      await page.route('**/speech/synthesize', async route => {
        const text = route.request().postDataJSON().text;
        await page.evaluate(text => window.__spoken.push(text), text);
        if (failSynthesis) return route.fulfill({ status: 503, json: { detail: 'synthetic failure' } });
        if (await page.evaluate(() => window.__holdVoice)) await sleep(400);
        await route.fulfill({ contentType: 'audio/wav', body: wav }).catch(() => undefined);
      });
      await page.route('**/__yachi_api/chat', async route => {
        calls++;
        if (delayAnswer) await sleep(400);
        const events = calls === 1 ? [
          { type: 'token', text: 'Synthetic library location.' },
          { type: 'map', payload: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-78.1, 0.4] }, properties: { id: 'audit-library', name: 'Synthetic library', role: 'destination' } }] } },
        ] : [{ type: 'token', text: 'Synthetic procedure.' }, { type: 'procedure', item: procedure }, { type: 'sources', items: [source] }];
        events.push({ type: 'done', messageId: 'audit-' + calls });
        await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') }).catch(() => undefined);
      });
      await page.goto(`http://127.0.0.1:5180/#/voz?lang=${lang}`);
      const main = page.locator('.voice-main');
      await main.click();
      await page.locator('.voice-main.listening').waitFor();
      if (lang !== 'qu') {
        await page.evaluate(() => { window.__holdVoice = true; window.__sr.instances.at(-1).emit('Where is the library?'); });
      } else {
        await page.waitForTimeout(1300); await main.click();
        await page.locator('#voice-q').waitFor();
        await page.evaluate(() => { window.__holdVoice = true; });
        await page.locator('.voice').getByRole('button', { name: labels[lang].send, exact: true }).click();
      }
      const map = page.getByRole('link', { name: labels[lang].map, exact: false });
      await map.waitFor();
      assert.match(await map.getAttribute('href'), /google\.com\/maps\/search.*0.4,-78.1/);
      await page.locator('.voice-main.speaking').waitFor();
      await main.click(); // Interrupt a held answer and immediately listen again.
      await page.locator('.voice-main.listening').waitFor();
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.voice-main.listening').count(), 1);
      if (lang !== 'qu') {
        assert.equal(await page.evaluate(() => window.__sr.active), 1);
        await page.evaluate(() => { window.__sr.instances[0].emit('late stale result'); });
        await page.waitForTimeout(80);
        assert.equal(calls, 1);
        await main.click(); // End empty turn.
        await page.locator('.voice-main.idle').waitFor();
        await page.evaluate(() => { window.__failNext = true; });
        await main.click();
        await page.getByRole('alert').waitFor();
        await page.locator('.voice-main.idle').waitFor();
        assert.equal(await page.evaluate(() => window.__sr.active), 0);
        await main.click();
        await page.locator('.voice-main.listening').waitFor();
        await page.evaluate(() => { window.__holdVoice = false; window.__sr.instances.at(-1).emit('Explain the procedure'); });
      } else {
        await page.waitForTimeout(1000); await main.click();
        await page.locator('#voice-q').waitFor();
        await page.evaluate(() => { window.__holdVoice = false; });
        await page.locator('.voice').getByRole('button', { name: labels[lang].send, exact: true }).click();
      }
      await page.locator('.voice-step-controls').waitFor();
      await page.waitForFunction(() => window.__spoken.some(text => text.includes('First official action')));
      await page.getByRole('button', { name: labels[lang].next, exact: true }).click();
      await page.waitForFunction(() => window.__spoken.some(text => text.includes('Second official action')));
      assert.match(await page.locator('.voice-step-controls p').innerText(), /2\/2/);
      await page.getByRole('button', { name: labels[lang].previous, exact: true }).click();
      assert.match(await page.locator('.voice-step-controls p').innerText(), /1\/2/);
      await page.getByRole('button', { name: labels[lang].next, exact: true }).press('n');
      await page.waitForFunction(() => document.querySelector('.voice-step-controls p')?.textContent.includes('2/2'));
      assert.equal(await page.getByRole('link', { name: labels[lang].source, exact: true }).getAttribute('href'), source.url);
      assert.equal(calls, 2);
      await page.getByRole('button', { name: labels[lang].all, exact: true }).click();
      assert.match(await page.locator('.voice-said').innerText(), /First official action/);
      assert.match(await page.locator('.voice-said').innerText(), /Second official action/);
      if (process.env.VOICE_SCREENSHOT_DIR) await page.locator('.voice').screenshot({ path: `${process.env.VOICE_SCREENSHOT_DIR}/yachi-voice-${lang}.png` });
      if (lang !== 'qu') assert.equal(await page.evaluate(() => window.__sr.maxActive), 1);
      // Reopening a completed procedure initializes controls without autoplay.
      await page.getByRole('button', { name: labels[lang].answer, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.voice'));
      const beforeReopen = await page.evaluate(() => window.__spoken.length);
      await page.locator('.voice-btn').click();
      await page.locator('.voice-step-controls').waitFor();
      assert.match(await page.locator('.voice-step-controls p').innerText(), /1\/2/);
      assert.equal(await page.evaluate(() => window.__spoken.length), beforeReopen);
      await page.getByRole('button', { name: labels[lang].next, exact: true }).click();
      assert.match(await page.locator('.voice-step-controls p').innerText(), /2\/2/);
      // A delayed model response must not start speech after cancel.
      delayAnswer = true;
      await page.locator('.voice-type-toggle').click();
      await page.locator('#voice-q').fill('Another synthetic procedure question');
      const beforeCancel = await page.evaluate(() => window.__spoken.length);
      await page.locator('.voice').getByRole('button', { name: labels[lang].send, exact: true }).click();
      await page.locator('.voice-main.thinking').waitFor();
      await main.click();
      await page.locator('.voice-main.idle').waitFor();
      await page.waitForTimeout(550);
      assert.equal(await page.evaluate(() => window.__spoken.length), beforeCancel, 'Cancelled response must not be spoken');
      assert.equal(await page.evaluate(() => window.__sr.active), 0);
      if (lang === 'qu') {
        failKichwa = true;
        await main.click(); await page.locator('.voice-main.listening').waitFor();
        await page.waitForTimeout(1000); await main.click();
        await page.getByRole('alert').waitFor();
        await page.locator('.voice-main.idle').waitFor();
        failKichwa = false;
        await page.getByRole('button', { name: 'Rimayta allichina', exact: true }).click();
        failSynthesis = true;
        await page.getByRole('button', { name: 'Kichwa rimayta uyana', exact: true }).click();
        await page.getByRole('alert').waitFor();
        await page.locator('.voice-main.idle').waitFor();
        failSynthesis = false;
        await page.getByLabel('Manarak kachashpa killkata rikuna', { exact: true }).uncheck();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-voice')).reviewKichwa), false);
        await page.getByRole('button', { name: 'Wichkana', exact: true }).click();
        await main.click(); await page.locator('.voice-main.listening').waitFor();
        await page.waitForTimeout(1000); await main.click();
        await page.locator('.voice-main.thinking').waitFor();
        assert.equal(await page.locator('#voice-q').count(), 0, 'Hands-free Kichwa should send without a separate form');
        await main.click(); await page.locator('.voice-main.idle').waitFor();
        await page.waitForTimeout(550);
        assert.equal(calls, 4);
      }
      await main.click();
      await page.locator('.voice-main.listening').waitFor();
      await page.getByRole('button', { name: labels[lang].answer, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.voice'));
      assert.equal(await page.evaluate(() => window.__sr.active), 0);
      assert.equal(await page.evaluate(() => window.__tracks.every(track => track.readyState === 'ended')), true);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('msg-ai')), true);
      assert.deepEqual(errors, []);
      results.push({ lang, mapLink: true, interruptionRecovered: true, procedureSteps: true, allSteps: true, keyboardNext: true, sourceLink: true, cancelledAnswerNotSpoken: true, errorsRecoverable: true, optionalKichwaHandsFree: lang === 'qu', microphoneReleasedOnExit: true, focusRestored: true, existingAnswerSteps: true, maxNativeMicrophones: await page.evaluate(() => window.__sr.maxActive), simulatedModel: true });
      await page.close();
    }
    fs.writeFileSync('docs/kichwa-alki-2026-10-22/auditoria-ciclo-voz.json', JSON.stringify({ results, scope: 'Browser interaction audit using simulated model/STT/TTS; not a native-speaker assessment.' }, null, 2) + '\n');
    console.log('Voice audit passed:', results);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
