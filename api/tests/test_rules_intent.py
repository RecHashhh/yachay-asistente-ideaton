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
