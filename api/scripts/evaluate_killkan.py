"""Small reproducible ASR smoke evaluation; never used to train or select a checkpoint."""
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.kichwa_speech import MODEL_ID, REVISION, transcribe


def normalized(text):
    return re.sub(r'[^\w\s]', '', text.lower()).split()


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        row = [i]
        for j, y in enumerate(b, 1):
            row.append(min(previous[j] + 1, row[-1] + 1, previous[j - 1] + (x != y)))
        previous = row
    return previous[-1]


if __name__ == '__main__':
    import numpy as np
    import soundfile as sf
    endpoint = 'https://datasets-server.huggingface.co/rows?dataset=ctaguchi/killkan&config=default&split=test&offset=0&length=3'
    rows = json.load(urllib.request.urlopen(endpoint, timeout=40))['rows']
    results = []
    for item in rows:
        row = item['row']
        raw = urllib.request.urlopen(row['audio'][0]['src'], timeout=60).read()
        samples, rate = sf.read(io.BytesIO(raw), dtype='float32')
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if rate != 16000:
            samples = np.interp(np.arange(int(len(samples) * 16000 / rate)) * rate / 16000, np.arange(len(samples)), samples).astype('float32')
        started = time.monotonic()
        hypothesis = transcribe(samples)
        reference = normalized(row['sentence'])
        prediction = normalized(hypothesis)
        results.append({'row': item['row_idx'], 'reference': row['sentence'], 'hypothesis': hypothesis,
                        'audioSeconds': round(len(samples) / 16000, 2),
                        'inferenceSeconds': round(time.monotonic() - started, 2),
                        'wordErrors': distance(reference, prediction), 'referenceWords': len(reference)})
        print(json.dumps(results[-1], ensure_ascii=True), flush=True)
    report = {'model': MODEL_ID, 'revision': REVISION, 'dataset': 'ctaguchi/killkan', 'split': 'test',
              'scope': 'Only first three test samples; not a representative accuracy estimate or microphone validation.',
              'normalization': 'lowercase, remove punctuation, preserve accents',
              'results': results, 'wer': sum(x['wordErrors'] for x in results) / sum(x['referenceWords'] for x in results)}
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('models/killkan-smoke.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Report:', output)
