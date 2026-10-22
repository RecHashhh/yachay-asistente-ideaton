"""Una llamada real de saludo, solo con --real. No envía conversaciones ni documentos."""
import argparse
import asyncio
import json
from pathlib import Path
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from app.agent import _system_prompt, _message_text
from app.config import Settings


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--real', action='store_true', required=True)
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    settings = Settings(_env_file=args.env_file)
    key = settings.anthropic_api_key.get_secret_value()
    if not key:
        print('Falta ANTHROPIC_API_KEY en el entorno o archivo indicado. No se realizó ninguna llamada al modelo.', file=sys.stderr)
        sys.exit(2)
    query = 'Hola, salúdame brevemente en kichwa ecuatoriano.'
    model = ChatAnthropic(model=settings.anthropic_model, anthropic_api_key=key,
                          max_tokens=250, thinking={'type': 'disabled'})
    response = await model.ainvoke([SystemMessage(content=_system_prompt('qu', '', query)), HumanMessage(content=query)])
    answer = _message_text(response.content).strip()
    if not answer:
        raise RuntimeError('Empty model response')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'observedAt': datetime.now(timezone.utc).isoformat(),
        'model': settings.anthropic_model, 'question': query, 'answer': answer,
        'realModelCalls': 1, 'linguisticallyValidated': False,
        'scope': 'Solo generación de saludo; no valida RAG, traducción ni conversación completa.'}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Respuesta real no vacía guardada; pendiente de evaluación lingüística.')


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print('Prueba no completada: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
