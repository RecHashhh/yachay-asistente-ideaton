import json

from app.events import encode_sse


def test_event_is_json_in_frontend_sse_data_format() -> None:
    encoded = encode_sse({"type": "token", "text": "á"}).decode("utf-8")

    assert encoded.startswith("data: ")
    assert encoded.endswith("\n\n")
    assert json.loads(encoded[6:]) == {"type": "token", "text": "á"}
