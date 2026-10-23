"""Synthetic TTS -> ASR transport check, not a human-speech quality benchmark."""
import io
import json
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np
import soundfile as sf

if __name__ == '__main__':
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    text = 'Imanalla. Ñuka shutika Yachi.'
    started = time.monotonic()
    request = urllib.request.Request('http://127.0.0.1:8000/speech/synthesize',
        data=json.dumps({'text': text}).encode(), headers={'Content-Type': 'application/json'})
    with opener.open(request, timeout=120) as response:
        audio = response.read()
        content_type = response.headers.get('Content-Type')
    tts_seconds = round(time.monotonic() - started, 2)
    samples, rate = sf.read(io.BytesIO(audio))
    samples = np.interp(np.arange(round(len(samples) * 16000 / rate)) * rate / 16000,
                        np.arange(len(samples)), samples)
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    started = time.monotonic()
    request = urllib.request.Request('http://127.0.0.1:8000/speech/transcribe',
        data=output.getvalue(), headers={'Content-Type': 'audio/wav'})
    with opener.open(request, timeout=150) as response:
        transcript = json.load(response)['text']
    result = {'scope': 'Synthetic voice round trip; no microphone or native-speaker validation.',
              'input': text, 'transcript': transcript, 'exactMatch': text.casefold() == transcript.casefold(),
              'ttsBytes': len(audio), 'contentType': content_type, 'ttsSeconds': tts_seconds,
              'asrSeconds': round(time.monotonic() - started, 2)}
    path = Path(__file__).resolve().parents[2] / 'docs/kichwa-alki-2026-10-22/auditoria-audio-real.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))
