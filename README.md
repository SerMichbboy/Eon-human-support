# Eon

**Eon — это кто-то, кто просто рядом.**

Не чат-бот. Не терапевт. Персональный компаньон, с которым можно говорить о чём угодно — без страха, что тебя осудят или неправильно поймут.

Он помнит тебя. Не только последнее сообщение — а то, что ты рассказывал месяц назад: о работе, о людях рядом, о том, что тебя беспокоит. И когда ты снова открываешь приложение, он уже в контексте.

Всё, что ты говоришь, зашифровано ключом, который есть только у тебя. Даже мы не можем прочитать твою переписку.

---

## Что умеет Eon

- **Помнит твою историю** — сообщения, дневные и недельные сводки, семантический поиск по прошлому
- **Голос и текст** — диктуй или пиши, как удобно
- **Режим разговора** — полностью голосовой, «hands-free» цикл: говоришь → Eon отвечает голосом → снова слушает
- **Напоминания** — просто попроси в переписке ("напомни мне в 18:00...") — Eon сам поймёт, во сколько, и пришлёт push
- **5 стилей общения** — слушатель, друг, наставник, зеркало, полемик
- **Шифрование end-to-end** — AES-256-GCM, индивидуальный ключ на каждого пользователя
- **Тёмная и светлая тема**, несколько фонов чата

---

## Для разработчиков

### Быстрый старт

```bash
git clone https://github.com/SerMichbboy/Eon-human-support.git
cd Eon-human-support
cp .env.template .env
```

Сгенерируй секреты и вставь их значения в `.env` (это не переменные окружения — просто удобный способ получить случайную строку, вставлять нужно сам вывод команды):

```bash
openssl rand -hex 32      # → APP_SECRET_KEY
openssl rand -base64 32   # → MASTER_ENCRYPTION_KEY
```

`OPENAI_API_KEY`/`VSEGPT_BASE_URL` (ключ vsegpt.ru) — **не обязательны для локальной разработки**: без реального ключа чат работает в стаб-режиме (несколько заготовленных ответов вместо настоящей LLM) — этого достаточно, чтобы пройти весь путь регистрация → онбординг → чат. Голосовые функции (`/voice/transcribe`, `/voice/synthesize`) без реального ключа не заработают — для них стаба нет.

Запуск бэкенда:

```bash
docker compose up -d
```

API: `http://localhost:8000` · Документация: `http://localhost:8000/docs`. Postgres пробрасывается на хостовый порт **5433** (не 5432 — чтобы не конфликтовать с локальным Postgres, если он уже есть).

Запуск мобильного приложения:

```bash
cd eon-mobile
npm install

# Узнай IP своей машины (ifconfig / ipconfig) — localhost не работает с реального телефона
echo "EXPO_PUBLIC_API_URL=http://<твой-IP>:8000" > .env

npx expo start --clear
```

Установи **Expo Go** на телефон и отсканируй QR. Рекомендуется реальное устройство, а не симулятор — запись голоса и push-уведомления на симуляторе работают не полностью (push — вообще не работают в Expo Go, нужна dev-сборка через EAS).

---

### Стек

**Бэкенд** — Python 3.12, FastAPI, PostgreSQL + pgvector, Redis, SQLAlchemy async, Alembic, Dishka, FastStream, TaskIQ

**Фронтенд** — React Native, Expo SDK 54, React Navigation, TanStack Query, Zustand, Feature-Sliced Design

**AI** — vsegpt.ru (OpenAI-совместимый прокси, работает из России). Текущая модель: `openai/gpt-4.1-mini` (MODE=test). Для продакшна: `anthropic/claude-sonnet-4-6`.

---

### Архитектура

```
src/
├── domain/          # Сущности + интерфейсы репозиториев
├── application/     # Use cases (бизнес-логика)
├── infrastructure/  # БД, AI, крипто, STT/TTS, очереди
└── presentation/
    ├── api/         # REST-роутеры
    └── ws/          # WebSocket /ws/chat

eon-mobile/src/
├── core/            # Навигация, провайдеры
├── features/        # auth, chat, onboarding, profile, voice
└── shared/          # API-клиент, сторы, тема
```

---

### API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация (email или телефон — единое поле) |
| POST | `/api/v1/auth/verify` | Подтверждение кода из регистрации |
| POST | `/api/v1/auth/resend-code` | Повторная отправка кода |
| POST | `/api/v1/auth/login` | Вход |
| POST | `/api/v1/auth/refresh` | Обновление токена |
| GET | `/api/v1/companion/` | Имя компаньона |
| PATCH | `/api/v1/companion/name` | Переименовать |
| GET | `/api/v1/messages/` | История чата (пагинация: `?limit=30&before_id=<uuid>`) |
| POST | `/api/v1/onboarding/step` | Шаг онбординга |
| GET | `/api/v1/profile/` | Профиль |
| PATCH | `/api/v1/profile/` | Обновить профиль |
| POST | `/api/v1/voice/transcribe` | Голос → текст (Whisper через vsegpt) |
| POST | `/api/v1/voice/synthesize` | Текст → голос (TTS через vsegpt) |
| POST | `/api/v1/push/register` | Регистрация Expo push-токена устройства |
| WS | `/ws/chat?token=<token>` | Чат — сообщения, ответы, живая доставка напоминаний |

---

### Переменные окружения

```env
APP_SECRET_KEY=<любая случайная строка>
DATABASE_URL=postgresql+asyncpg://eon:eon@postgres:5432/eon
DATABASE_URL_SYNC=postgresql://eon:eon@postgres:5432/eon   # Alembic
REDIS_URL=redis://redis:6379/0
MASTER_ENCRYPTION_KEY=<base64 от 32 байт>
OPENAI_API_KEY=<ключ vsegpt>       # опционально для локальной разработки — см. "Быстрый старт"
VSEGPT_BASE_URL=https://api.vsegpt.ru/v1
RESEND_API_KEY=<ключ Resend>       # опционально — письма с кодом верификации; без него — SMTP или лог-стаб
MODE=test   # test | production
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
```

---

### Память

Многоуровневая система сжатия истории:

- **0–7 дней** — сырые сообщения
- **8–30 дней** — дневные сводки (TaskIQ, ночная задача)
- **31–180 дней** — недельные сводки
- **Семантический поиск** — pgvector embeddings для поиска релевантного контекста

Всё зашифровано индивидуальным ключом пользователя.

---

### Известные ограничения

- **MODE=test** — минимальный промпт, 4 сообщения в контексте, дешёвая модель. Переключи в `production` перед запуском реальным пользователям.
- Голосовой ввод работает только через vsegpt (нативный Whisper API заблокирован в РФ).
- **Push-уведомления не работают в Expo Go** — с SDK 53 Expo Go вообще не умеет принимать реальные push (ни на iOS, ни на Android). Нужна dev-сборка (`eas build --profile development` или `npx expo run:ios`/`run:android`). Сообщение от напоминания при этом всё равно появляется в истории чата и приходит живьём в уже открытый чат — это работает и в Expo Go, push тут ни при чём.
- Режим разговора — не настоящий realtime voice mode (как у ChatGPT): это последовательные STT → чат → TTS запросы, а не потоковая передача аудио. У каждой реплики Eon есть заметная пауза «на подумать».
