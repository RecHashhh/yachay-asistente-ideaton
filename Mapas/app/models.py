from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_path: Mapped[str] = mapped_column(Text, nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_bytes: Mapped[int | None] = mapped_column(BigInteger)
    osm_version: Mapped[str | None] = mapped_column(String(16))
    generator: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="running")
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    issues: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class OsmNode(Base):
    __tablename__ = "osm_nodes"

    osm_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    geom: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    action: Mapped[str | None] = mapped_column(String(16))
    visible: Mapped[bool | None] = mapped_column(Boolean)
    version: Mapped[int | None] = mapped_column(Integer)
    changeset: Mapped[int | None] = mapped_column(BigInteger)
    osm_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    osm_uid: Mapped[int | None] = mapped_column(BigInteger)
    osm_user: Mapped[str | None] = mapped_column(Text)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    import_batch_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("import_batches.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OsmWay(Base):
    __tablename__ = "osm_ways"

    osm_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nodes: Mapped[list[int]] = mapped_column(ARRAY(BigInteger), nullable=False, default=list)
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    geom: Mapped[object | None] = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=False))
    closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    import_batch_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("import_batches.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OsmRelation(Base):
    __tablename__ = "osm_relations"

    osm_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    members: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    geom: Mapped[object | None] = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=False))
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    import_batch_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("import_batches.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (UniqueConstraint("osm_type", "osm_id", name="uq_places_osm"),)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    osm_type: Mapped[str] = mapped_column(String(16), nullable=False)
    osm_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    name_normalized: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    name_source: Mapped[str] = mapped_column(String(24), nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    subcategory: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    geometry: Mapped[object] = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=False), nullable=False)
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    custom_tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    geometry_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    import_batch_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("import_batches.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    aliases: Mapped[list[PlaceAlias]] = relationship(back_populates="place", cascade="all, delete-orphan")
    entrances: Mapped[list[PlaceEntrance]] = relationship(back_populates="place", cascade="all, delete-orphan")


class PlaceAlias(Base):
    __tablename__ = "place_aliases"
    __table_args__ = (UniqueConstraint("place_id", "alias_normalized", name="uq_place_aliases_place_alias"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    place_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    alias: Mapped[str] = mapped_column(Text, nullable=False)
    alias_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="name")

    place: Mapped[Place] = relationship(back_populates="aliases")


class PlaceEntrance(Base):
    __tablename__ = "place_entrances"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    place_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    osm_node_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    geom: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    entrance_type: Mapped[str | None] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="osm")
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    place: Mapped[Place] = relationship(back_populates="entrances")


class RoutingNode(Base):
    __tablename__ = "routing_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osm_node_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    geom: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    component_walk: Mapped[int | None] = mapped_column(Integer)
    component_drive: Mapped[int | None] = mapped_column(Integer)


class RoutingEdge(Base):
    __tablename__ = "routing_edges"
    __table_args__ = (UniqueConstraint("osm_way_id", "seq", name="uq_routing_edges_way_seq"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    osm_way_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[int] = mapped_column(Integer, ForeignKey("routing_nodes.id"), nullable=False)
    target: Mapped[int] = mapped_column(Integer, ForeignKey("routing_nodes.id"), nullable=False)
    geom: Mapped[object] = mapped_column(Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False)
    length_m: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    walk_s: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    drive_s: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    highway_type: Mapped[str] = mapped_column(Text, nullable=False)
    pedestrian_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    vehicle_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    oneway: Mapped[str] = mapped_column(String(8), nullable=False, default="no")
    oneway_foot: Mapped[str] = mapped_column(String(8), nullable=False, default="no")
    bridge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tunnel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    layer: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    access: Mapped[str | None] = mapped_column(Text)
    surface: Mapped[str | None] = mapped_column(Text)
    cost_walk: Mapped[float] = mapped_column(Float, nullable=False, default=-1.0)
    reverse_cost_walk: Mapped[float] = mapped_column(Float, nullable=False, default=-1.0)
    cost_drive: Mapped[float] = mapped_column(Float, nullable=False, default=-1.0)
    reverse_cost_drive: Mapped[float] = mapped_column(Float, nullable=False, default=-1.0)
