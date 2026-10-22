import io
import wave

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import kichwa_speech as speech


def wav(seconds=1, rate=16000, channels=1):
    data = io.BytesIO()
    with wave.open(data, 'wb') as stream:
        stream.setnchannels(channels)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(b'\x00\x00' * rate * channels * seconds)
    return data.getvalue()


@pytest.mark.parametrize('data', [b'not audio', wav(rate=8000), wav(channels=2), wav(seconds=16), wav(seconds=0)], ids=['invalid', 'rate', 'stereo', 'too-long', 'empty'])
def test_reject_unsupported_audio(data):
    with pytest.raises(ValueError):
        speech.decode_wav(data)


def test_pcm_shape():
    samples = speech.decode_wav(wav())
    assert samples.shape == (16000,)
    assert samples.max() == 0


def test_api(monkeypatch):
    app = FastAPI()
    app.include_router(speech.router)
    monkeypatch.setattr(speech, 'available', lambda: True)
    monkeypatch.setattr(speech, 'transcribe', lambda samples: 'alli puncha')
    with TestClient(app) as client:
        assert client.post('/speech/transcribe', content=wav()).status_code == 415
        assert client.post('/speech/transcribe', content=b'bad', headers={'Content-Type': 'audio/wav'}).status_code == 422
        assert client.post('/speech/transcribe', content=b'x' * (speech.MAX_BYTES + 1), headers={'Content-Type': 'audio/wav'}).status_code == 413
        result = client.post('/speech/transcribe', content=wav(), headers={'Content-Type': 'audio/wav'})
        assert result.json()['text'] == 'alli puncha'
        assert client.get('/speech/capabilities').json()['audioStored'] is False
        monkeypatch.setattr(speech, 'available', lambda: False)
        assert client.post('/speech/transcribe', content=wav(), headers={'Content-Type': 'audio/wav'}).status_code == 503
