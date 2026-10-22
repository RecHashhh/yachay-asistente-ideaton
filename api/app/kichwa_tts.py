"""MMS VITS synthesis: Ecuadorian Tena Kichwa, explicitly experimental."""
import asyncio
import importlib.util
import io
import os
import threading
import wave
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = 'facebook/mms-tts-quw'
REVISION = '110330c764f39caf92839747412afcb98a0c8f79'
MODEL_DIR = Path(__file__).resolve().parents[1] / 'models' / 'kichwa-tts'
router = APIRouter()
_model = None
_tokenizer = None
_lock = threading.Lock()
_active = asyncio.Semaphore(1)


def available() -> bool:
    return ((MODEL_DIR / 'model.safetensors').is_file()
            and all(importlib.util.find_spec(name) is not None for name in ('torch', 'transformers')))


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)


def synthesize(text: str) -> bytes:
    global _model, _tokenizer
    import numpy as np
    import torch
    from transformers import AutoTokenizer, VitsModel
    with _lock:
        if _model is None:
            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), local_files_only=True)
            model = VitsModel.from_pretrained(str(MODEL_DIR), local_files_only=True).eval()
            _model, _tokenizer = model, tokenizer
        inputs = _tokenizer(text, return_tensors='pt')
        if inputs['input_ids'].shape[-1] < 2:
            raise ValueError('El texto no contiene caracteres pronunciables.')
        with torch.inference_mode():
            audio = _model(**inputs).waveform[0].cpu().numpy()
        rate = _model.config.sampling_rate
        if not len(audio) or len(audio) > rate * 90 or not np.isfinite(audio).all():
            raise RuntimeError('Invalid waveform')
        pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(pcm)
        return output.getvalue()


@router.post('/synthesize')
async def synthesis(payload: SynthesisRequest):
    if not available():
        raise HTTPException(503, 'La voz Kichwa del servidor todavía no está instalada.')
    text = payload.text.strip()
    if not text:
        raise HTTPException(422, 'Escribe un texto para leer.')
    if _active.locked():
        raise HTTPException(429, 'La voz está ocupada. Intenta otra vez.')
    async with _active:
        try:
            audio = await asyncio.to_thread(synthesize, text)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        except (ImportError, OSError, RuntimeError) as error:
            raise HTTPException(503, 'No se pudo generar el audio Kichwa. Revisa el modelo del servidor.') from error
    return Response(audio, media_type='audio/wav', headers={
        'Cache-Control': 'no-store', 'X-Voice-Language': 'quw', 'X-Voice-Experimental': 'true',
    })
