// A real browser records a synthetic tone followed by silence; inference is mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yachi-silence-'));
  const file = path.join(folder, 'speech-and-silence.wav');
  const samples = 16000 * 5;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < 12800; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 16000) * 9000), 44 + i * 2);
  fs.writeFileSync(file, wav);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`] });
  try {
    const page = await browser.newPage({ permissions: ['microphone'] });
    await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
    await page.route('**/speech/capabilities', route => route.fulfill({ json: { kichwaAsr: true, kichwaTts: true } }));
    let audioSeconds = 0;
    await page.route('**/speech/transcribe', route => {
      audioSeconds = (route.request().postDataBuffer().length - 44) / 32000;
      return route.fulfill({ json: { text: 'alli puncha' } });
    });
    await page.goto('http://127.0.0.1:5180/#/voz?lang=qu');
    await page.getByRole('button', { name: 'Rimayta kallarina', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#voice-q')?.value === 'alli puncha', null, { timeout: 12000 });
    assert.ok(audioSeconds > 0.8 && audioSeconds < 5, `Expected silence endpoint, recorded ${audioSeconds} s`);
    assert.equal(await page.locator('.voice-status').innerText(), 'Kikinta uyankapakmi kani.');
    assert.doesNotMatch(await page.locator('.voice-stage').innerText(), /Listo|Presiona espacio|Edita la transcripción|Enviar/);
    console.log(`Automatic silence endpoint: ${audioSeconds.toFixed(2)} s recorded, editable transcript, no manual stop: OK.`);
  } finally { await browser.close(); fs.unlinkSync(file); fs.rmdirSync(folder); }
})().catch(error => { console.error(error); process.exit(1); });
