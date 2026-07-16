from pydantic import BaseModel, field_validator


class RegisterRequest(BaseModel):
    identifier: str  # email or phone — server detects which (see classify_identifier)
    password: str
    key_salt: str       # base64-encoded 16-byte PBKDF2 salt (client-generated)
    encrypted_key: str  # base64-encoded AES-GCM(raw_key, PBKDF2(password, salt))
    pbkdf2_c: int = 10_000  # PBKDF2 iteration count used by the client

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    identifier: str
    password: str


class VerifyCodeRequest(BaseModel):
    identifier: str
    code: str


class ResendCodeRequest(BaseModel):
    identifier: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    key_salt: str | None = None
    encrypted_key: str | None = None
    pbkdf2_c: int | None = None  # iteration count used at registration


class RegisterResponse(BaseModel):
    user_id: str
    message: str = "Registration successful. Please verify your account."
