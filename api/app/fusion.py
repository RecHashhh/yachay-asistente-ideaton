from collections import defaultdict
from collections.abc import Sequence


def reciprocal_rank_fusion(
    vector_ranking: Sequence[str], text_ranking: Sequence[str], *, constant: int = 60
) -> list[str]:
    """Fusiona dos rankings sin mezclar escalas de similitud distintas."""
    scores: dict[str, float] = defaultdict(float)
    for ranking in (vector_ranking, text_ranking):
        for rank, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] += 1.0 / (constant + rank)
    return sorted(scores, key=lambda chunk_id: (-scores[chunk_id], chunk_id))
