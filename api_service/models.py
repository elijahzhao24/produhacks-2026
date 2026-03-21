import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class SavedModel(Base):
    __tablename__ = "saved_models"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    object_url: Mapped[str] = mapped_column(String, nullable=False)
