// Fake microphone + intercepted inference: checks UI transport, not recognition quality.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
    await page.route('**/speech/capabilities', route => route.fulfill({ json: { kichwaAsr: true, kichwaTts: true } }));
    let syntheses = 0;
    const wav = Buffer.alloc(44 + 3200);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(3200, 40);
    await page.route('**/speech/synthesize', route => {
      const payload = route.request().postDataJSON();
      assert.ok(payload.text.length > 0 && payload.text.length <= 400);
      syntheses++;
      return route.fulfill({ contentType: 'audio/wav', body: wav });
    });
    let requests = 0;
    await page.route('**/speech/transcribe', async route => {
      const data = route.request().postDataBuffer();
      assert.equal(data.toString('ascii', 0, 4), 'RIFF');
      assert.equal(data.readUInt32LE(24), 16000);
      assert.equal(data.readUInt16LE(22), 1);
      assert.ok(data.length <= 484140);
      requests++;
      await route.fulfill({ json: { text: 'alli puncha', lang: 'qu', experimental: true } });
    });
    const url = process.env.KICHWA_TEST_URL || 'http://127.0.0.1:5180/';
    await page.goto(url + '#/?lang=qu');
    const mic = page.locator('.composer .mic');
    await mic.click();
    await page.waitForTimeout(1800);
    await mic.click();
    await page.waitForFunction(() => document.querySelector('#ask')?.value === 'alli puncha');
    assert.equal(requests, 1);
    assert.equal(await page.locator('.msg.user').count(), 0, 'Must not send the transcript automatically');
    await mic.click();
    await page.getByRole('button', { name: 'Sakina', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#ask')?.disabled);
    assert.equal(requests, 1, 'Cancelled recording must not be uploaded');
    assert.equal(await page.locator('#ask').inputValue(), 'alli puncha');
    const spoken = await page.evaluate(async () => {
      const module = await import('/src/lib/speech.ts');
      let calls = 0;
      speechSynthesis.getVoices = () => [{ lang: 'es-EC', name: 'Spanish', voiceURI: 'spanish' }];
      speechSynthesis.speak = () => { calls++; };
      await module.speak('alli puncha', 'qu', { rate: 1, autoListen: false });
      return { calls, voices: module.voicesFor('qu').length };
    });
    assert.deepEqual(spoken, { calls: 0, voices: 0 }, 'Spanish voices must not impersonate Kichwa');
    assert.equal(syntheses, 1, 'Without a native OS voice, play the server Kichwa waveform');
    await page.goto(url + '#/voz?lang=qu');
    await page.getByRole('button', { name: 'Rimayta allichina', exact: true }).click();
    await page.getByRole('button', { name: 'Kichwa rimayta uyana', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.voice-stage .chip')?.disabled);
    assert.equal(syntheses, 2);
    assert.deepEqual(errors, []);
    console.log('Kichwa: bounded recording, cancellation, editable transcript, server WAV playback and voice preview: OK (mock inference).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
