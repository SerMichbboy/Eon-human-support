# Eon — AI-компаньон для эмоциональной поддержки

Eon — это персональный AI-компаньон, который просто рядом. Не терапевт, не чат-бот с меню. Он помнит, что ты рассказывал раньше, замечает контекст и не осуждает за то, что ты чувствуешь.

## Концепция

- Общение через текст или голос
- Компаньон помнит твои разговоры и жизненный контекст
- Память многоуровневая: сообщения (7 дней) → дневные сводки (8–30 дней) → недельные сводки (31–180 дней) + семантический поиск через pgvector
- Все сообщения зашифрованы индивидуальным ключом пользователя (AES-256-GCM)
- Имя компаньона можно изменить

## Стек

**Бэкенд**
- Python 3.12, FastAPI
- PostgreSQL + pgvector (образ `ankane/pgvector`)
- Redis (стриминг событий + очередь задач)
- SQLAlchemy async + Alembic (миграции)
- Dishka (dependency injection)
- FastStream (Redis-брокер для событий)
- TaskIQ (фоновые задачи: дневные/недельные сводки памяти)
- Anthropic Claude API (ответы AI)
- OpenAI Whisper (STT) — заблокирован в России, есть стаб-режим
- ElevenLabs (TTS)

**Фронтенд**
- React Native (Expo SDK 54)
- Expo Go для разработки на реальном устройстве
- React Navigation (native stack)
- TanStack Query
- Zustand (хранилище авторизации)
- Feature-Sliced Design

## Архитектура

```
src/
├── domain/          # Сущности + интерфейсы репозиториев (без зависимостей)
│   ├── user/
│   ├── companion/
│   ├── profile/
│   └── memory/
├── application/     # Use cases (чистая бизнес-логика)
│   ├── auth/
│   ├── chat/
│   ├── memory/
│   ├── onboarding/
│   └── voice/
├── infrastructure/  # БД, Claude, крипто, STT/TTS, стримы, задачи
│   ├── claude/
│   ├── crypto/
│   ├── db/
│   ├── stream/
│   ├── stt/
│   ├── tasks/
│   └── tts/
├── presentation/    # HTTP-роутеры + WebSocket
│   ├── api/         # REST: auth, companion, onboarding, profile, voice
│   └── ws/          # WebSocket: /ws/chat
└── main/            # Фабрика приложения, IoC-контейнер, настройки

eon-mobile/src/
├── core/            # Корень приложения, навигация, провайдеры
├── features/        # auth, chat, companion, onboarding, profile, voice
└── shared/          # API-клиент, стор, тема, утилиты
```

## Запуск локально

### Требования

- Docker + Docker Compose
- Node.js 20+
- Приложение Expo Go на телефоне

### Бэкенд

```bash
# 1. Создай файл переменных окружения
cp .env.example .env
# Заполни .env — см. раздел «Переменные окружения»

# 2. Запусти все сервисы (postgres, redis, миграции, api, worker)
docker compose up -d

# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
```

### Фронтенд

```bash
cd eon-mobile

# Установи зависимости
npm install

# Укажи локальный IP машины (телефон не может обращаться к localhost)
echo "EXPO_PUBLIC_API_URL=http://<IP_ТВОЕЙ_МАШИНЫ>:8000" > .env

# Запусти Expo
npx expo start --clear

# Отсканируй QR-код в Expo Go
```

## Переменные окружения

Создай `.env` в корне проекта:

```env
APP_ENV=development
APP_SECRET_KEY=<случайная строка 32+ символа>

DATABASE_URL=postgresql+asyncpg://eon:eon@postgres:5432/eon
DATABASE_URL_SYNC=postgresql://eon:eon@postgres:5432/eon
REDIS_URL=redis://redis:6379/0

MASTER_ENCRYPTION_KEY=<base64 от 32 байт>  # openssl rand -base64 32

JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

ANTHROPIC_API_KEY=<ключ>   # "placeholder" включает стаб-режим без API
OPENAI_API_KEY=<ключ>      # для Whisper STT
ELEVENLABS_API_KEY=        # опционально, для TTS
ELEVENLABS_VOICE_ID=       # опционально
```

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход, получение токенов |
| POST | `/api/v1/auth/refresh` | Обновление access-токена |
| GET | `/api/v1/companion/` | Получить имя компаньона |
| PATCH | `/api/v1/companion/name` | Переименовать компаньона |
| POST | `/api/v1/onboarding/step` | Сохранить шаг онбординга |
| GET | `/api/v1/profile/` | Получить профиль пользователя |
| POST | `/api/v1/voice/transcribe` | Речь → текст |
| POST | `/api/v1/voice/synthesize` | Текст → речь |
| WS | `/ws/chat?token=<access_token>` | WebSocket чат |

### WebSocket протокол

Отправить: `{ "text": "твоё сообщение" }`  
Получить: `{ "reply": "ответ компаньона" }` или `{ "error": "текст ошибки" }`

## Известные проблемы

- **STT (голос → текст)** не работает в России — OpenAI возвращает 403. Нужна альтернатива (self-hosted Whisper или другой провайдер). На экране онбординга есть переключение на текстовый ввод.
- **Стаб-режим Claude**: при `ANTHROPIC_API_KEY=placeholder` бэкенд возвращает фиксированные ответы без обращения к API.
