FROM postgis/postgis:18-3.6

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        postgresql-18-pgrouting \
        postgresql-18-pgvector \
    && rm -rf /var/lib/apt/lists/*
