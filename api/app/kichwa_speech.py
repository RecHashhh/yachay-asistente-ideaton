"""Optional, local Killkan ASR. Audio stays in memory; no chat or training side effects."""
import asyncio
import io
import importlib.util
import os
import threading
import wave
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from . import kichwa_tts

MODEL_ID = 'ctaguchi/killkan_asr'
REVISION = '2d00fbbb610ea6f7579d3a008cfe6aa4fbb95251'
MODEL_DIR = Path(__file__).resolve().parents[1] / 'models' / 'killkan-asr'
MAX_SECONDS = 15
MAX_BYTES = 44 + 16000 * 2 * MAX_SECONDS + 4096
router = APIRouter(prefix='/speech', tags=['speech'])
router.include_router(kichwa_tts.router)
_processor = None
_model = None
_lock = threading.Lock()
_active = asyncio.Semaphore(1)


def available() -> bool:
    return ((MODEL_DIR / 'model.safetensors').is_file()
            and all(importlib.util.find_spec(name) is not None for name in ('torch', 'transformers')))


def decode_wav(data: bytes):
    """Accept only bounded mono PCM16 WAV at 16 kHz; no ffmpeg execution."""
    import numpy as np
    try:
        with wave.open(io.BytesIO(data), 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError('Usa WAV mono PCM16 a 16000 Hz.')
            frames = audio.getnframes()
            if not 1600 <= frames <= 16000 * MAX_SECONDS:
                raise ValueError('Graba entre 0,1 y 15 segundos.')
            raw = audio.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError('Audio incompleto.')
    except (wave.Error, EOFError) as error:
        raise ValueError('El archivo no es un WAV válido.') from error
    return np.frombuffer(raw, dtype='<i2').astype('float32') / 32768.0


def transcribe(samples) -> str:
    global _processor, _model
    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    # Hold the lock until CPU inference really ends, even if a client disconnects.
    with _lock:
        if _model is None:
            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            processor = Wav2Vec2Processor.from_pretrained(str(MODEL_DIR), local_files_only=True)
            model = Wav2Vec2ForCTC.from_pretrained(str(MODEL_DIR), local_files_only=True).eval()
            _processor, _model = processor, model
        inputs = _processor(samples, sampling_rate=16000, return_tensors='pt')
        with torch.inference_mode():
            logits = _model(**inputs).logits
        return _processor.batch_decode(logits.argmax(dim=-1))[0].strip()


@router.get('/capabilities')
def capabilities():
    return {'kichwaAsr': available(), 'model': MODEL_ID, 'revision': REVISION,
            'experimental': True, 'maxSeconds': MAX_SECONDS, 'audioStored': False,
            'kichwaTts': kichwa_tts.available(), 'ttsModel': kichwa_tts.MODEL_ID,
            'ttsVariant': 'Kichwa de Tena (quw)', 'ttsLicense': 'CC-BY-NC-4.0'}


@router.post('/transcribe')
async def transcription(request: Request):
    if not available():
        raise HTTPException(503, 'El modelo de voz Kichwa no está instalado en este servidor.')
    if request.headers.get('content-type', '').split(';')[0] not in ('audio/wav', 'audio/x-wav'):
        raise HTTPException(415, 'Envía audio WAV.')
    if _active.locked():
        raise HTTPException(429, 'El reconocimiento está ocupado. Intenta otra vez.')
    async with _active:
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise HTTPException(413, 'El audio supera 15 segundos.')
        try:
            samples = decode_wav(bytes(data))
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        try:
            text = await asyncio.to_thread(transcribe, samples)
        except (ImportError, OSError, RuntimeError) as error:
            raise HTTPException(503, 'No se pudo iniciar el modelo de voz Kichwa. Revisa la instalación del servidor.') from error
        return {'text': text, 'lang': 'qu', 'experimental': True, 'model': MODEL_ID}
