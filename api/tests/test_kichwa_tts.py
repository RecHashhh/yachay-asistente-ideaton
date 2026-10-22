import io
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import kichwa_tts as tts


def test_synthesis_contract(monkeypatch):
    app = FastAPI()
    app.include_router(tts.router, prefix='/speech')
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b'\x00\x00' * 16000)
    received = []
    monkeypatch.setattr(tts, 'available', lambda: True)
    def fake(text):
        received.append(text)
        return buffer.getvalue()
    monkeypatch.setattr(tts, 'synthesize', fake)
    with TestClient(app) as client:
        for text in ['', '   ', 'x' * 401]:
            assert client.post('/speech/synthesize', json={'text': text}).status_code == 422
        response = client.post('/speech/synthesize', json={'text': '  Im analla.  '})
        assert response.status_code == 200
        assert response.headers['content-type'] == 'audio/wav'
        assert response.headers['cache-control'] == 'no-store'
        assert response.headers['x-voice-language'] == 'quw'
        assert received == ['Im analla.']
        with wave.open(io.BytesIO(response.content)) as wav:
            assert wav.getframerate() == 16000
        monkeypatch.setattr(tts, 'available', lambda: False)
        assert client.post('/speech/synthesize', json={'text': 'Imanalla'}).status_code == 503


def test_synthesis_errors(monkeypatch):
    app = FastAPI()
    app.include_router(tts.router, prefix='/speech')
    monkeypatch.setattr(tts, 'available', lambda: True)
    def failure(_text):
        raise RuntimeError('private internal detail')
    monkeypatch.setattr(tts, 'synthesize', failure)
    with TestClient(app) as client:
        response = client.post('/speech/synthesize', json={'text': 'Imanalla'})
        assert response.status_code == 503
        assert 'private internal detail' not in response.text
