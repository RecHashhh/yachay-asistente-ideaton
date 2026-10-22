"""Download the pinned public model, never execute remote model code."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.kichwa_speech import MODEL_DIR, MODEL_ID, REVISION

if __name__ == '__main__':
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_ID, revision=REVISION, local_dir=str(MODEL_DIR),
                      allow_patterns=['*.json', '*.safetensors', 'README.md'])
    print('Killkan instalado:', MODEL_DIR)
