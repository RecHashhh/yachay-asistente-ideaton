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
    await page.route('**/speech/capabilities', route => route.fulfill({ json: { kichwaAsr: true } }));
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
    const spoken = await page.evaluate(async () => {
      const module = await import('/src/lib/speech.ts');
      let calls = 0;
      speechSynthesis.getVoices = () => [{ lang: 'es-EC', name: 'Spanish', voiceURI: 'spanish' }];
      speechSynthesis.speak = () => { calls++; };
      await module.speak('alli puncha', 'qu', { rate: 1, autoListen: false });
      return { calls, voices: module.voicesFor('qu').length };
    });
    assert.deepEqual(spoken, { calls: 0, voices: 0 }, 'Spanish voices must not impersonate Kichwa');
    await page.goto(url + '#/voz?lang=qu');
    await page.getByText(/Voz Kichwa experimental/).waitFor();
    assert.deepEqual(errors, []);
    console.log('Kichwa microphone: bounded WAV, editable transcript, no auto-send, voice notice: OK (mock inference).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
