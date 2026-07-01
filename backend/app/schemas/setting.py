from pydantic import BaseModel


class SettingItem(BaseModel):
    key: str
    label: str
    group: str
    secret: bool = False
    hint: str = ""
    masked_value: str = ""  # e.g. "sk-...abcd" for secrets, full value for non-secrets
    has_value: bool = False


class SettingsResponse(BaseModel):
    settings: list[SettingItem]


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, str]  # {key: value, ...}


class SettingsUpdateResponse(BaseModel):
    updated: list[str]
