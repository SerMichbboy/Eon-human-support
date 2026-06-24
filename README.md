# Eon

**Eon — это кто-то, кто просто рядом.**

Не чат-бот. Не терапевт. Персональный компаньон, с которым можно говорить о чём угодно — без страха, что тебя осудят или неправильно поймут.

Он помнит тебя. Не только последнее сообщение — а то, что ты рассказывал месяц назад: о работе, о людях рядом, о том, что тебя беспокоит. И когда ты снова открываешь приложение, он уже в контексте.

Всё, что ты говоришь, зашифровано ключом, который есть только у тебя. Даже мы не можем прочитать твою переписку.

---

## Что умеет Eon

- **Помнит твою историю** — сообщения, дневные и недельные сводки, семантический поиск по прошлому
- **Голос и текст** — диктуй или пиши, как удобно
- **5 стилей общения** — слушатель, друг, наставник, зеркало, полемик
- **Шифрование end-to-end** — AES-256-GCM, индивидуальный ключ на каждого пользователя
- **Тёмная и светлая тема**, несколько фонов чата

---

## Для разработчиков

### Быстрый старт

```bash
git clone https://github.com/SerMichbboy/Eon-human-support.git
cd Eon-human-support
cp .env.example .env
```

Минимальный `.env`:

```env
MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)
OPENAI_API_KEY=sk-or-vv-...   # ключ vsegpt.ru
VSEGPT_BASE_URL=https://api.vsegpt.ru/v1
MODE=test
```

Запуск бэкенда:

```bash
docker compose up -d
```

API: `http://localhost:8000` · Документация: `http://localhost:8000/docs`

Запуск мобильного приложения:

```bash
cd eon-mobile
npm install

# Узнай IP своей машины (ifconfig / ipconfig)
echo "EXPO_PUBLIC_API_URL=http://<твой-IP>:8000" > .env

npx expo start --clear
```

Установи **Expo Go** на телефон и отсканируй QR.

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
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход |
| POST | `/api/v1/auth/refresh` | Обновление токена |
| GET | `/api/v1/companion/` | Имя компаньона |
| PATCH | `/api/v1/companion/name` | Переименовать |
| GET | `/api/v1/messages/` | История чата |
| POST | `/api/v1/onboarding/step` | Шаг онбординга |
| GET | `/api/v1/profile/` | Профиль |
| PATCH | `/api/v1/profile/` | Обновить профиль |
| WS | `/ws/chat?token=<token>` | Чат |

История сообщений с пагинацией: `GET /api/v1/messages/?limit=30&before_id=<uuid>`

---

### Переменные окружения

```env
DATABASE_URL=postgresql+asyncpg://eon:eon@postgres:5432/eon
REDIS_URL=redis://redis:6379/0
MASTER_ENCRYPTION_KEY=<base64 от 32 байт>
OPENAI_API_KEY=<ключ vsegpt>
VSEGPT_BASE_URL=https://api.vsegpt.ru/v1
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
