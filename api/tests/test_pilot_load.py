import pytest

from scripts import pilot_load
from scripts.pilot_load import Sample, metric_totals, percentile, route_coordinate_count, summarize


def test_percentile_interpolates_and_handles_empty_samples():
    assert percentile([], 95) is None
    assert percentile([1, 2, 3, 4], 50) == 2.5
    assert percentile([1, 2, 3, 4], 95) == 3.85


def test_summarize_reports_errors_throughput_and_latency():
    result = summarize(2, [
        Sample(200, 0.2, 0.05, True, ["map.marker", "done"]),
        Sample(200, 0.4, 0.10, False, ["error"], "error"),
    ], 0.5)

    assert result["requests"] == 2
    assert result["successes"] == 1
    assert result["errors"] == 1
    assert result["error_rate"] == 0.5
    assert result["requests_per_second"] == 4
    assert result["latency_seconds"]["p50"] == pytest.approx(0.3)
    assert result["first_event_seconds"]["p95"] == pytest.approx(0.0975)


def test_metric_totals_preserves_counter_values_and_ignores_unrelated_series():
    result = metric_totals('''
# HELP yachay_anthropic_requests_total calls
yachay_anthropic_requests_total{model="haiku",operation="tool_selection",outcome="success"} 3.0
yachay_anthropic_estimated_cost_usd_total{model="haiku",operation="tool_selection"} 0.0002
yachay_chat_requests_total{intent="route_request",outcome="success"} 7.0
python_gc_objects_collected_total{generation="0"} 400.0
''')

    assert result["yachay_anthropic_requests_total"] == 3
    assert result["yachay_anthropic_estimated_cost_usd_total"] == pytest.approx(0.0002)
    assert result["yachay_chat_requests_total"] == 7
    assert result["yachay_sse_errors_total"] == 0


def test_route_coordinate_count_requires_a_route_feature():
    event = {"payload": {"features": [
        {"id": "origin", "geometry": {"type": "Point", "coordinates": [-77, 0]}},
        {"id": "route", "properties": {"kind": "route"},
         "geometry": {"type": "LineString", "coordinates": [[-77, 0], [-77, 0.01]]}},
    ]}}

    assert route_coordinate_count(event) == 2
    assert route_coordinate_count({"payload": {"features": []}}) == 0


@pytest.mark.asyncio
async def test_ambiguity_follow_up_reuses_session_and_requires_route_geometry(monkeypatch):
    calls = []

    async def fake_request(_client, _url, query, _timeout, require_route=False, session_id=None, history=None):
        calls.append((query, require_route, session_id, history))
        if len(calls) == 1:
            return Sample(200, 0.1, 0.03, True, ["map.ambiguity", "done"])
        return Sample(200, 0.2, 0.05, True, ["map.route", "done"], route_coordinate_count=12)

    monkeypatch.setattr(pilot_load, "request_once", fake_request)
    result = await pilot_load.ambiguous_route_flow(object(), "http://test/chat", 3)

    assert result.success is True
    assert result.route_coordinate_count == 12
    assert result.duration_seconds == pytest.approx(0.3)
    assert calls[0][2] == calls[1][2]
    assert calls[1][1] is True
    assert calls[1][3][-1]["content"].startswith("¿Edificio")
