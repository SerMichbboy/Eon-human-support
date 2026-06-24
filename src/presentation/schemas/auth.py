from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterEmailRequest(BaseModel):
    email: EmailStr
    password: str
    key_salt: str       # base64-encoded 16-byte PBKDF2 salt (client-generated)
    encrypted_key: str  # base64-encoded AES-GCM(raw_key, PBKDF2(password, salt))

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class RegisterPhoneRequest(BaseModel):
    phone: str
    password: str
    key_salt: str
    encrypted_key: str

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        if not re.match(r"^\+\d{7,15}$", v):
            raise ValueError("Phone must be in E.164 format, e.g. +79001234567")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginEmailRequest(BaseModel):
    email: EmailStr
    password: str


class LoginPhoneRequest(BaseModel):
    phone: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    key_salt: str | None = None      # returned on login so client can re-derive key
    encrypted_key: str | None = None  # client-encrypted key blob


class RegisterResponse(BaseModel):
    user_id: str
    message: str = "Registration successful. Please verify your account."
