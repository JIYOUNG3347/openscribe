from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TemplateSection(BaseModel):
    key: str
    label: str
    type: str  # llm_generate | raw_transcript
    prompt: Optional[str] = None
    heading_level: int = 2  # 1~4, default H2
    color: Optional[str] = None  # hex color, e.g. #3B82F6


class TemplateCreate(BaseModel):
    name: str
    sections: list[TemplateSection]


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    sections: Optional[list[TemplateSection]] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    is_default: bool
    sections: list[dict]

    model_config = {"from_attributes": True}
