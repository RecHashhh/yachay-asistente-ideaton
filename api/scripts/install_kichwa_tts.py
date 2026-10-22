"""Download the pinned Meta MMS Tena Kichwa voice (CC BY-NC 4.0)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.kichwa_tts import MODEL_DIR, MODEL_ID, REVISION

if __name__ == '__main__':
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_ID, revision=REVISION, local_dir=str(MODEL_DIR),
                      allow_patterns=['*.json', '*.safetensors', 'README.md'])
    print('Voz Kichwa Tena instalada:', MODEL_DIR)
