import pytest

from app import graph, procedures, rules
from app.rules import norm, place_intent


def intent(q: str) -> bool:
    return place_intent(f" {norm(q)} ")


def test_location_and_building_hours_still_go_to_the_place_card() -> None:
    assert intent("¿Dónde queda el centro médico?")
    assert intent("¿Cómo llego a la biblioteca?")
    assert intent("¿Cuál es el horario de la biblioteca?")  # control R26
    assert intent("¿A qué hora cierra el Krispan?")  # control R129
    assert intent("What time does the library open?")


def test_service_hours_go_to_search_not_to_the_building_opening_hours() -> None:
    # Antes respondían «Centro de Salud Tipo A… 7:00 - 21:00», el horario del edificio.
    assert not intent("¿En qué horario atiende el médico general a los estudiantes?")
    assert not intent("¿Cuál es el horario de atención de enfermería?")
    assert not intent("What are the doctor's hours?")
    # Pero si además pregunta dónde, sigue siendo una pregunta de lugar.
    assert intent("¿Dónde atiende el médico?")


def test_questions_without_place_intent() -> None:
    assert not intent("¿Cómo me retiro de la carrera?")


@pytest.mark.asyncio
async def test_classroom_code_is_answered_from_rooms_before_the_map_router(monkeypatch) -> None:
    # El mapa OSM no tiene aulas: "¿Dónde queda el aula A03?" no debe acabar en "No encontré esos lugares en el mapa".
    monkeypatch.setattr(procedures, "resolve", lambda *args: None)
    monkeypatch.setattr(rules, "room_lookup", lambda q: ("zona SENESCYT", "A03"))
    monkeypatch.setattr(graph, "classify_local", lambda *args: pytest.fail("el router del mapa no debe correr"))
    state = await graph.route({"question": "¿Dónde queda el aula A03?", "lang": "es", "history": []})
    assert state["route"] == "place" and state["room"] == "A03"
