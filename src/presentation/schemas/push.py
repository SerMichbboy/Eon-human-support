from pydantic import BaseModel


class RegisterPushTokenRequest(BaseModel):
    token: str
