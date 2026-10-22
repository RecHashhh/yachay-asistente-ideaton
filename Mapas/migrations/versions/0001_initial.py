"""Esquema inicial Yachay Maps Geo API.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-21
"""
from __future__ import annotations

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgrouting")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "import_batches",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_path", sa.Text(), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("source_bytes", sa.BigInteger(), nullable=True),
        sa.Column("osm_version", sa.String(length=16), nullable=True),
        sa.Column("generator", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="running"),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("issues", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_batches_status", "import_batches", ["status"])
    op.create_index("ix_import_batches_sha", "import_batches", ["source_sha256"])

    op.create_table(
        "osm_nodes",
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lon", sa.Float(), nullable=True),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("action", sa.String(length=16), nullable=True),
        sa.Column("visible", sa.Boolean(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=True),
        sa.Column("changeset", sa.BigInteger(), nullable=True),
        sa.Column("osm_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("osm_uid", sa.BigInteger(), nullable=True),
        sa.Column("osm_user", sa.Text(), nullable=True),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("import_batch_id", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("osm_id"),
    )
    op.create_index("ix_osm_nodes_geom", "osm_nodes", ["geom"], postgresql_using="gist")
    op.create_index("ix_osm_nodes_tags", "osm_nodes", ["tags"], postgresql_using="gin")
    op.create_index("ix_osm_nodes_deleted", "osm_nodes", ["deleted"])

    op.create_table(
        "osm_ways",
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("nodes", postgresql.ARRAY(sa.BigInteger()), nullable=False, server_default=sa.text("'{}'::bigint[]")),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False), nullable=True),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("import_batch_id", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("osm_id"),
    )
    op.create_index("ix_osm_ways_geom", "osm_ways", ["geom"], postgresql_using="gist")
    op.create_index("ix_osm_ways_tags", "osm_ways", ["tags"], postgresql_using="gin")
    op.create_index("ix_osm_ways_nodes", "osm_ways", ["nodes"], postgresql_using="gin")
    op.create_index("ix_osm_ways_deleted", "osm_ways", ["deleted"])

    op.create_table(
        "osm_relations",
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("members", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False), nullable=True),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("import_batch_id", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("osm_id"),
    )
    op.create_index("ix_osm_relations_geom", "osm_relations", ["geom"], postgresql_using="gist")
    op.create_index("ix_osm_relations_tags", "osm_relations", ["tags"], postgresql_using="gin")
    op.create_index("ix_osm_relations_deleted", "osm_relations", ["deleted"])

    op.create_table(
        "places",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("osm_type", sa.String(length=16), nullable=False),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("name_normalized", sa.Text(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("name_source", sa.String(length=24), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("subcategory", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("geometry", geoalchemy2.types.Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False), nullable=False),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("geometry_valid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("import_batch_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_type", "osm_id", name="uq_places_osm"),
    )
    op.create_index("ix_places_location", "places", ["location"], postgresql_using="gist")
    op.create_index("ix_places_geometry", "places", ["geometry"], postgresql_using="gist")
    op.create_index("ix_places_tags", "places", ["tags"], postgresql_using="gin")
    op.create_index("ix_places_search_text_trgm", "places", ["search_text"], postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"})
    op.create_index("ix_places_name_normalized_trgm", "places", ["name_normalized"], postgresql_using="gin", postgresql_ops={"name_normalized": "gin_trgm_ops"})
    op.create_index("ix_places_category", "places", ["category", "subcategory"])
    op.create_index("ix_places_active", "places", ["active"])

    op.create_table(
        "place_aliases",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alias", sa.Text(), nullable=False),
        sa.Column("alias_normalized", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="name"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("place_id", "alias_normalized", name="uq_place_aliases_place_alias"),
    )
    op.create_index("ix_place_aliases_trgm", "place_aliases", ["alias_normalized"], postgresql_using="gin", postgresql_ops={"alias_normalized": "gin_trgm_ops"})
    op.create_index("ix_place_aliases_place", "place_aliases", ["place_id"])

    op.create_table(
        "place_entrances",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("osm_node_id", sa.BigInteger(), nullable=False),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("entrance_type", sa.Text(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="osm"),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_node_id"),
    )
    op.create_index("ix_place_entrances_geom", "place_entrances", ["geom"], postgresql_using="gist")
    op.create_index("ix_place_entrances_place", "place_entrances", ["place_id"])

    op.create_table(
        "routing_nodes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("osm_node_id", sa.BigInteger(), nullable=False),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("component_walk", sa.Integer(), nullable=True),
        sa.Column("component_drive", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_node_id"),
    )
    op.create_index("ix_routing_nodes_geom", "routing_nodes", ["geom"], postgresql_using="gist")
    op.create_index("ix_routing_nodes_component_walk", "routing_nodes", ["component_walk"])
    op.create_index("ix_routing_nodes_component_drive", "routing_nodes", ["component_drive"])

    op.create_table(
        "routing_edges",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("osm_way_id", sa.BigInteger(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("source", sa.Integer(), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=False), nullable=False),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="0"),
        sa.Column("walk_s", sa.Float(), nullable=False, server_default="0"),
        sa.Column("drive_s", sa.Float(), nullable=False, server_default="0"),
        sa.Column("highway_type", sa.Text(), nullable=False),
        sa.Column("pedestrian_allowed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("vehicle_allowed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("oneway", sa.String(length=8), nullable=False, server_default="no"),
        sa.Column("oneway_foot", sa.String(length=8), nullable=False, server_default="no"),
        sa.Column("bridge", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("tunnel", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("layer", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("access", sa.Text(), nullable=True),
        sa.Column("surface", sa.Text(), nullable=True),
        sa.Column("cost_walk", sa.Float(), nullable=False, server_default="-1"),
        sa.Column("reverse_cost_walk", sa.Float(), nullable=False, server_default="-1"),
        sa.Column("cost_drive", sa.Float(), nullable=False, server_default="-1"),
        sa.Column("reverse_cost_drive", sa.Float(), nullable=False, server_default="-1"),
        sa.ForeignKeyConstraint(["source"], ["routing_nodes.id"]),
        sa.ForeignKeyConstraint(["target"], ["routing_nodes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_way_id", "seq", name="uq_routing_edges_way_seq"),
    )
    op.create_index("ix_routing_edges_geom", "routing_edges", ["geom"], postgresql_using="gist")
    op.create_index("ix_routing_edges_source", "routing_edges", ["source"])
    op.create_index("ix_routing_edges_target", "routing_edges", ["target"])
    op.create_index("ix_routing_edges_profiles", "routing_edges", ["pedestrian_allowed", "vehicle_allowed"])


def downgrade() -> None:
    op.drop_table("routing_edges")
    op.drop_table("routing_nodes")
    op.drop_table("place_entrances")
    op.drop_table("place_aliases")
    op.drop_table("places")
    op.drop_table("osm_relations")
    op.drop_table("osm_ways")
    op.drop_table("osm_nodes")
    op.drop_table("import_batches")
