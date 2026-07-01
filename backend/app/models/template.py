from sqlalchemy import Boolean, Column, JSON, String

from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    sections = Column(JSON, nullable=False)
