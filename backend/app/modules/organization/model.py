"""
Organization model
"""

from sqlalchemy import Column, String, VARCHAR
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.common.models.base_model import BaseModel


class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String, nullable=False)
    code = Column(String, nullable=False, unique=True)
    case_number_format = Column(String, nullable=False, default="{ORG_CODE}-{SERIAL}")
    logo_url = Column(VARCHAR(2048), nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)

    dimensions = relationship("Dimension", back_populates="organization", lazy="dynamic")
    activity_types = relationship("ActivityType", back_populates="organization", lazy="dynamic")
    activity_categories = relationship(
        "ActivityCategory", back_populates="organization", lazy="dynamic"
    )
    entity_types = relationship("EntityType", back_populates="organization", lazy="dynamic")
    entities = relationship("Entity", back_populates="organization", lazy="dynamic")
    roles = relationship("Role", back_populates="organization", lazy="dynamic")
