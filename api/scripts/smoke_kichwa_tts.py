"""Generate a public synthetic greeting through the same API as the UI."""
import io
import json
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]

if __name__ == '__main__':
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    text = 'Imanalla. Ñuka shutika Yachi.'
    request = urllib.request.Request('http://127.0.0.1:8000/speech/synthesize',
                                    data=json.dumps({'text': text}).encode(),
                                    headers={'Content-Type': 'application/json'})
    started = time.monotonic()
    response = opener.open(request, timeout=180)
    raw = response.read()
    with wave.open(io.BytesIO(raw)) as wav:
        rate, channels = wav.getframerate(), wav.getnchannels()
        seconds = wav.getnframes() / rate
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2')
    assert rate == 16000 and channels == 1 and seconds > 0.2 and np.abs(pcm.astype(float)).max() > 0
    output = ROOT / 'web/public/voices/yachi-kichwa-demo.wav'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    report = {'model': 'facebook/mms-tts-quw', 'revision': '110330c764f39caf92839747412afcb98a0c8f79',
              'creator': 'Meta', 'license': 'CC-BY-NC-4.0', 'variant': 'Kichwa de Tena, Ecuador',
              'experimental': True, 'text': text, 'status': response.status,
              'audioSeconds': round(seconds, 2), 'generationSeconds': round(time.monotonic() - started, 2),
              'sampleRate': rate, 'channels': channels, 'bytes': len(raw), 'audibleWaveform': True,
              'pronunciationValidatedByNativeSpeaker': False}
    report_path = ROOT / 'docs/kichwa-alki-2026-10-22/prueba-voz-kichwa.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True))
