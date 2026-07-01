from fastapi import APIRouter

from app.schemas.setting import (
    SettingItem,
    SettingsResponse,
    SettingsUpdateRequest,
    SettingsUpdateResponse,
)
from app.services.settings_service import get_all_settings, update_settings

router = APIRouter()


@router.get("", response_model=SettingsResponse)
async def list_settings():
    items = [SettingItem(**s) for s in await get_all_settings()]
    return SettingsResponse(settings=items)


@router.put("", response_model=SettingsUpdateResponse)
async def save_settings(req: SettingsUpdateRequest):
    updated = await update_settings(req.settings)
    return SettingsUpdateResponse(updated=updated)
