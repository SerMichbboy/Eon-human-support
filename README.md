# Eon — AI-компаньон для эмоциональной поддержки

Eon — это персональный AI-компаньон, который просто рядом. Не терапевт, не чат-бот с меню. Он помнит разговоры, замечает контекст и не осуждает за то, что ты чувствуешь.

---

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone https://github.com/SerMichbboy/Eon-human-support.git
cd Eon-human-support
```

### 2. Настроить окружение

```bash
cp .env.example .env
```

Открой `.env` и заполни минимально необходимые значения:

```env
APP_SECRET_KEY=любая-случайная-строка-32-символа
MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Для AI-ответов. Если ключа нет — поставь "placeholder" (включится stub-режим)
ANTHROPIC_API_KEY=sk-ant-...

# Для распознавания голоса (можно оставить пустым, если не нужен голос)
OPENAI_API_KEY=sk-...
```

### 3. Запустить бэкенд

```bash
docker compose up -d
```

Это поднимет PostgreSQL, Redis, применит миграции и запустит API + воркер.
API доступен на `http://localhost:8000`, документация: `http://localhost:8000/docs`

### 4. Запустить мобильное приложение

```bash
cd eon-mobile
npm install

# Узнай локальный IP своей машины (ifconfig / ipconfig)
echo "EXPO_PUBLIC_API_URL=http://<твой-IP>:8000" > .env

npx expo start --clear
```

### 5. Открыть на телефоне

Установи **Expo Go** (iOS / Android) и отсканируй QR-код из терминала.

---

## Концепция

- Общение через текст или голос
- Компаньон помнит разговоры и жизненный контекст
- Многоуровневая память: сообщения (7 дней) → дневные сводки (8–30 дней) → недельные сводки (31–180 дней) + семантический поиск через pgvector
- Все сообщения зашифрованы индивидуальным ключом пользователя (AES-256-GCM)
- Кастомизация: имя компаньона, фон чата (8 пресетов с паттернами)

---

## Стек

**Бэкенд**
- Python 3.12, FastAPI
- PostgreSQL + pgvector (`ankane/pgvector`)
- Redis (стриминг событий + очередь задач)
- SQLAlchemy async + Alembic
- Dishka (dependency injection)
- FastStream (Redis-брокер)
- TaskIQ (фоновые задачи: сводки памяти)
- Anthropic Claude API (stub-режим при `ANTHROPIC_API_KEY=placeholder`)
- OpenAI Whisper (STT) — заблокирован в РФ
- ElevenLabs (TTS, опционально)

**Фронтенд**
- React Native / Expo SDK 54
- React Navigation (native stack)
- TanStack Query + Zustand
- Feature-Sliced Design

---

## Архитектура

```
src/
├── domain/          # Сущности + интерфейсы репозиториев
│   ├── user/
│   ├── companion/
│   ├── profile/
│   └── memory/
├── application/     # Use cases (бизнес-логика)
│   ├── auth/
│   ├── chat/
│   ├── memory/
│   ├── onboarding/
│   └── voice/
├── infrastructure/  # БД, Claude, крипто, STT/TTS, стримы, задачи
└── presentation/
    ├── api/         # REST-роутеры
    └── ws/          # WebSocket /ws/chat

eon-mobile/src/
├── core/            # Навигация, провайдеры, точка входа
├── features/        # auth, chat, companion, onboarding, profile, voice
└── shared/          # API-клиент, сторы, тема, утилиты
```

---

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход, получение токенов |
| POST | `/api/v1/auth/refresh` | Обновление access-токена |
| GET | `/api/v1/companion/` | Имя компаньона |
| PATCH | `/api/v1/companion/name` | Переименовать компаньона |
| GET | `/api/v1/messages/` | История чата (с пагинацией) |
| POST | `/api/v1/onboarding/step` | Сохранить шаг онбординга |
| POST | `/api/v1/onboarding/voice-step` | Голосовой шаг онбординга |
| GET | `/api/v1/profile/` | Получить профиль |
| PATCH | `/api/v1/profile/` | Обновить профиль |
| POST | `/api/v1/voice/transcribe` | Речь → текст |
| POST | `/api/v1/voice/synthesize` | Текст → речь |
| WS | `/ws/chat?token=<access_token>` | Чат |

### История сообщений — пагинация

```
GET /api/v1/messages/?limit=30
GET /api/v1/messages/?limit=30&before_id=<uuid>   # следующая страница
```

Сообщения хранятся зашифрованными, эндпоинт расшифровывает на лету.

### WebSocket

Отправить: `{ "text": "сообщение" }`  
Получить: `{ "reply": "ответ" }` или `{ "error": "текст" }`

---

## Переменные окружения

```env
APP_ENV=development
APP_SECRET_KEY=<32+ символа>

DATABASE_URL=postgresql+asyncpg://eon:eon@postgres:5432/eon
DATABASE_URL_SYNC=postgresql://eon:eon@postgres:5432/eon
REDIS_URL=redis://redis:6379/0

MASTER_ENCRYPTION_KEY=<base64 от 32 байт>

JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

ANTHROPIC_API_KEY=<ключ или "placeholder">
OPENAI_API_KEY=<ключ>
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

---

## Известные ограничения

- **STT (голос → текст)** не работает в России — OpenAI возвращает 403. Онбординг переключается на текстовый ввод автоматически.
- **Stub-режим Claude**: `ANTHROPIC_API_KEY=placeholder` → бэкенд возвращает фиксированные ответы без обращения к API.
