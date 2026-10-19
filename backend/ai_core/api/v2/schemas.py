"""Standard response envelope for every /api/v2 endpoint."""

from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class APIError(BaseModel):
    code: str
    message: str


class StandardAPIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    error: Optional[APIError] = None
    meta: dict[str, Any] = Field(default_factory=dict)


def ok(data: Any = None, **meta: Any) -> dict:
    return StandardAPIResponse(success=True, data=data, meta=meta).model_dump(mode="json")


def fail(code: str, message: str, **meta: Any) -> dict:
    return StandardAPIResponse(success=False, error=APIError(code=code, message=message),
                               meta=meta).model_dump(mode="json")
