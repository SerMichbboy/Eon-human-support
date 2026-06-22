from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterEmailRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class RegisterPhoneRequest(BaseModel):
    phone: str
    password: str

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


class RegisterResponse(BaseModel):
    user_id: str
    message: str = "Registration successful. Please verify your account."
