# Eon — AI-компаньон для эмоциональной поддержки

## Идея

Персональный AI-друг, который всегда рядом. Можно написать или поговорить голосом — он помнит всё: что тебя беспокоит, через что ты проходишь, что помогает тебе справляться. Не осуждает, не устаёт, не пропадает.

Целевой момент использования: человек один, переживает трудное — и не хочет беспокоить близких.

---

## Пользователь и авторизация

### Регистрация
- По email **или** по номеру телефона — оба варианта равнозначны
- Верификация: email → ссылка подтверждения, телефон → SMS-код (OTP)
- После верификации — JWT access token (15 мин) + refresh token (30 дней)

### Таблица users

```
users:
  - id (uuid)
  - email (nullable, unique)
  - phone (nullable, unique)         # в формате E.164
  - password_hash (bcrypt)
  - is_email_verified / is_phone_verified
  - created_at
  - encryption_key_id → user_keys.id # ссылка на индивидуальный ключ
```

### Шифрование: индивидуальный ключ на пользователя

Никакого единого ключа. При регистрации:
1. Генерируется случайный AES-256 ключ для пользователя (`user_data_key`)
2. `user_data_key` шифруется мастер-ключом (из env / KMS) и сохраняется в `user_keys`
3. Все личные данные, анкета, память — шифруются `user_data_key`

При удалении аккаунта — `user_data_key` уничтожается. Данные остаются в БД, но нечитаемы навсегда.

---

## Анкета (онбординг)

Не форма — разговор. Вопросы задаются по шагам, тон тёплый, без давления.
Каждый шаг опционален: пользователь может пропустить и вернуться позже.
Всё хранится зашифрованным и становится частью `UserProfile`.

### Шаг 1 — Знакомство
> "Как тебя зовут? Как мне к тебе обращаться?"
> "Сколько тебе лет?"
> "Где ты живёшь? (город, страна)"

### Шаг 2 — Жизненный контекст
> "Расскажи немного о себе — чем занимаешься, как проводишь время?"
> "Есть ли рядом близкие люди — семья, друзья?"
> "Есть ли что-то, чем ты особенно дорожишь в жизни?"

### Шаг 3 — Светлые моменты
> "Вспомни момент, когда тебе было по-настоящему хорошо. Что это было?"
> "Что тебя радует или придаёт сил — даже в мелочах?"
> "Есть ли что-то, о чём ты мечтаешь?"

### Шаг 4 — Трудности и тревоги
> "Бывают ли периоды, когда тебе особенно тяжело? Что обычно происходит?"
> "Есть ли что-то, что тебя тревожит сейчас или тревожило раньше?"
> "Как ты обычно справляешься, когда становится трудно?"

### Шаг 5 — Значимые события
> "Были ли в твоей жизни моменты, которые сильно тебя изменили?"
> "Есть ли что-то, что оставило глубокий след — радостное или болезненное?"
> *(этот шаг самый деликатный — задаётся только если пользователь сам открылся)*

### Шаг 6 — Как тебе помочь
> "Как ты хочешь, чтобы я был рядом — просто слушал, или иногда предлагал взгляд со стороны?"
> "Есть ли темы, которые ты пока не хочешь затрагивать?"
> "Как мне к тебе обращаться — на ты? Тебе важно, чтобы я был тёплым или сдержанным?"

### Голосовой ввод в анкете

На каждом шаге анкеты пользователь может **говорить**, а не печатать.

**Поток:**
```
Пользователь нажимает "говорить" в приложении
  → запись аудио (React Native)
  → отправка на backend
  → STT (Whisper) → текстовая расшифровка
  → Claude извлекает факты и сопоставляет с категориями профиля
  → факты сохраняются в UserProfile (зашифровано)
  → приложение показывает, что было распознано и сохранено
```

**Категории профиля для сопоставления:**

```
UserProfile (все поля зашифрованы, ключ уникален для пользователя):
  basic_info:
    - name, age, location

  life_context:
    - occupation, family_status, close_people, values

  positive_moments:
    - joyful_memories[], sources_of_energy[], dreams[]

  struggles:
    - anxiety_topics[], difficult_periods[], coping_mechanisms[]

  key_events:
    - [ { description, emotional_weight, approximate_date, type: joy|loss|change } ]

  companion_preferences:
    - tone (warm|neutral|direct)
    - directiveness (listener|advisor)
    - forbidden_topics[]
    - preferred_name
```

**Промпт для Claude при извлечении фактов:**
Claude получает транскрипт голосового ввода + текущий шаг анкеты и возвращает структурированный JSON с извлечёнными фактами по категориям. Неоднозначные или деликатные фрагменты Claude помечает флагом `needs_confirmation` — приложение уточняет у пользователя перед сохранением.

---

## Стек

| Слой | Технология |
|---|---|
| Mobile | React Native + Expo (iOS + Android) |
| Web framework | FastAPI |
| Dependency injection | Dishka |
| Message streaming | FastStream (брокер: Redis) |
| Background tasks | TaskIQ (брокер: Redis) |
| Real-time чат | WebSocket (FastAPI native) |
| AI | Claude (Anthropic SDK) |
| База данных | PostgreSQL + pgvector |
| Брокер | Redis |
| Миграции | Alembic |
| ORM | SQLAlchemy 2 (async) |
| STT | Whisper (OpenAI) или Deepgram |
| TTS | ElevenLabs или Azure TTS |
| Шифрование | AES-256, индивидуальный ключ на пользователя |

**Роли компонентов:**
- **Dishka** — DI-контейнер, связывает все зависимости (репозитории, сервисы, клиенты) без ручной инициализации
- **FastStream** — стриминг событий через Redis: новое сообщение → обработчик памяти
- **TaskIQ** — отложенные и периодические задачи: генерация дневных/недельных саммари, обновление профиля, индексация эмбеддингов

---

## Схема базы данных

```sql
-- Индивидуальные ключи шифрования
user_keys
  id            uuid PK
  encrypted_key bytea        -- AES-256 ключ, зашифрован мастер-ключом из KMS
  created_at    timestamptz

-- Пользователи
users
  id                  uuid PK
  email               text UNIQUE nullable
  phone               text UNIQUE nullable   -- формат E.164
  password_hash       text
  is_email_verified   bool DEFAULT false
  is_phone_verified   bool DEFAULT false
  encryption_key_id   uuid FK → user_keys.id
  created_at          timestamptz

-- Компаньон (один на пользователя, MVP)
companions
  id          uuid PK
  user_id     uuid FK → users.id UNIQUE
  name        text                 -- зашифровано
  created_at  timestamptz

-- Анкета / профиль пользователя (всё зашифровано)
user_profiles
  id                      uuid PK
  user_id                 uuid FK → users.id UNIQUE
  basic_info              jsonb   -- зашифровано: имя, возраст, локация
  life_context            jsonb   -- зашифровано: работа, семья, ценности
  positive_moments        jsonb   -- зашифровано: радости, мечты, источники сил
  struggles               jsonb   -- зашифровано: тревоги, трудные периоды, стратегии
  key_events              jsonb   -- зашифровано: значимые события с датой и весом
  companion_preferences   jsonb   -- зашифровано: тон, стиль, запрещённые темы
  updated_at              timestamptz

-- Сообщения (хранятся по дням)
messages
  id            uuid PK
  companion_id  uuid FK → companions.id
  role          text            -- 'user' | 'assistant'
  content       text            -- зашифровано
  audio_url     text nullable   -- ссылка на оригинальное аудио (если голос)
  created_at    timestamptz     -- индекс: (companion_id, created_at)

-- Дневные саммари (дни 8–30)
daily_summaries
  id            uuid PK
  companion_id  uuid FK → companions.id
  date          date
  summary       text   -- зашифровано
  UNIQUE (companion_id, date)

-- Недельные саммари (дни 31–180)
weekly_summaries
  id            uuid PK
  companion_id  uuid FK → companions.id
  week_start    date
  summary       text   -- зашифровано
  UNIQUE (companion_id, week_start)

-- Векторные эмбеддинги для семантического поиска
memory_embeddings
  id            uuid PK
  companion_id  uuid FK → companions.id
  source_type   text    -- 'daily' | 'weekly'
  source_id     uuid    -- FK на daily_summaries или weekly_summaries
  embedding     vector(1536)   -- pgvector
  period_start  date
  period_end    date
  INDEX: ivfflat (embedding vector_cosine_ops)
```

---

## Архитектура бэкенда (DDD)

```
Eon-human-support/
├── main.py                        # Точка входа, сборка приложения
├── domain/                        # Сущности, агрегаты, бизнес-правила — без зависимостей
│   ├── user/
│   │   ├── entity.py              # User, UserKey
│   │   └── repository.py          # Абстрактный интерфейс репозитория
│   ├── companion/
│   │   ├── entity.py              # Companion
│   │   └── repository.py
│   ├── profile/
│   │   ├── entity.py              # UserProfile, ProfileCategory, KeyEvent
│   │   └── repository.py
│   └── memory/
│       ├── entity.py              # Message, DailySummary, WeeklySummary, MemoryEmbedding
│       └── repository.py
│
├── application/                   # Use cases — оркестрируют domain, не знают об HTTP
│   ├── auth/
│   │   ├── register.py            # RegisterByEmail, RegisterByPhone
│   │   ├── login.py
│   │   └── refresh_token.py
│   ├── onboarding/
│   │   ├── save_profile_step.py   # Сохранение шага анкеты (текст или голос)
│   │   └── extract_facts.py       # Claude извлекает факты из транскрипта
│   ├── chat/
│   │   ├── send_message.py        # Текстовое сообщение → Claude → ответ
│   │   └── build_context.py       # Сборка контекста: профиль + 7 дней + архив
│   ├── voice/
│   │   ├── transcribe.py          # Аудио → текст (Whisper)
│   │   └── synthesize.py          # Текст → аудио (TTS)
│   └── memory/
│       ├── generate_daily_summary.py
│       ├── generate_weekly_summary.py
│       ├── update_profile.py       # Фоновый job после каждого диалога
│       └── semantic_search.py      # Поиск по архиву через pgvector
│
├── infrastructure/                # Реализации репозиториев, внешние сервисы
│   ├── db/
│   │   ├── models.py              # SQLAlchemy 2 модели
│   │   ├── repositories/          # Реализации всех репозиториев
│   │   └── migrations/            # Alembic
│   ├── crypto/
│   │   └── aes.py                 # Шифрование/дешифрование полей, управление ключами
│   ├── claude/
│   │   └── client.py              # Anthropic SDK, промпты
│   ├── stt/
│   │   └── whisper.py
│   ├── tts/
│   │   └── elevenlabs.py
│   ├── stream/                    # FastStream: обработчики событий из Redis
│   │   ├── router.py              # FastStream router
│   │   └── handlers/
│   │       ├── on_message_saved.py   # → обновить саммари, профиль, эмбеддинги
│   │       └── on_day_ended.py       # → запустить генерацию дневного саммари
│   └── tasks/                     # TaskIQ: периодические и отложенные задачи
│       ├── broker.py              # TaskIQ broker (Redis)
│       ├── daily_summary.py
│       ├── weekly_summary.py
│       └── update_profile.py
│
├── presentation/                  # HTTP / WebSocket — только роутинг и сериализация
│   ├── api/
│   │   ├── auth.py
│   │   ├── onboarding.py
│   │   ├── profile.py
│   │   └── voice.py
│   ├── ws/
│   │   └── chat.py                # WebSocket чат
│   └── schemas/                   # Pydantic схемы запросов/ответов
│
└── container.py                   # Dishka: сборка всех зависимостей
```

---

## Память компаньона

### Эпизодическая память с динамическим расширением

Память организована по дням. По умолчанию грузятся последние 7 дней — этого достаточно для ощущения непрерывности. Если разговор касается более ранних событий, контекст расширяется автоматически.

### Три слоя хранения

**Слой 1 — активное окно (дни 1–7)**
- Сырые сообщения, без сжатия
- Полный диалог за каждый день
- Грузится при каждом запросе

**Слой 2 — архив с саммари (дни 8–180)**
- Дни 8–30: дневные саммари (Claude генерирует в конце каждого дня)
- Дни 31–180: недельные саммари (агрегация из дневных)
- Сырые сообщения хранятся, но в контекст не грузятся — только саммари

**Слой 3 — долгосрочный профиль (всё время)**
- Живой профиль пользователя: характер, ценности, паттерны, что помогает
- Обновляется фоновым job-ом после каждого дня
- Всегда присутствует в system prompt

```
UserProfile:
  - core_traits         # Характер, ценности, фоновый контекст
  - current_period      # Что сейчас происходит в жизни (актуально)
  - emotional_patterns  # Что помогает, что триггерит, как справляется
  - companion_style     # Тон, степень директивности, язык общения
```

### Динамическое расширение контекста

Когда в разговоре всплывает тема из прошлого — компаньон может "вспомнить глубже":

1. Семантический поиск по саммари (векторные эмбеддинги в pgvector)
2. Находит релевантный период → подгружает дневные/недельные саммари того времени
3. Встраивает в контекст как "воспоминание"

Это позволяет компаньону сказать: *"Ты рассказывал мне об этом три месяца назад..."* — и это будет правдой.

### Как формируется контекст для Claude

```
system prompt:
  └── UserProfile (долгосрочный профиль)

messages[]:
  └── последние 7 дней (сырые сообщения)
  └── [опционально] саммари релевантных периодов из архива

После ответа (фоновый job):
  └── обновить дневной саммари
  └── обновить UserProfile если появились новые факты
  └── обновить векторные индексы
```

### Шифрование

Все поля памяти хранятся в PostgreSQL зашифрованными (AES-256). Ключ шифрования уникален для каждого пользователя.

---

## Архитектура фронтенда (React Native)

Подход: **Feature-Sliced Design** — каждая фича самодостаточна, shared слой для общего.
Стек: TypeScript, React Navigation, TanStack Query, Zustand, Expo.

```
eon-mobile/
├── app/                           # Точка входа, навигация, провайдеры
│   ├── index.tsx
│   ├── navigation/
│   │   ├── RootNavigator.tsx      # Auth / App stack
│   │   ├── AuthNavigator.tsx
│   │   └── AppNavigator.tsx       # Tab + Stack навигация
│   └── providers/
│       ├── QueryProvider.tsx      # TanStack Query
│       ├── AuthProvider.tsx       # JWT токены, сессия
│       └── ThemeProvider.tsx
│
├── features/                      # Фичи — изолированные модули
│   ├── auth/
│   │   ├── api/                   # login, register, refresh
│   │   ├── components/            # LoginForm, PhoneInput
│   │   ├── hooks/                 # useLogin, useRegister
│   │   └── screens/               # LoginScreen, RegisterScreen
│   │
│   ├── onboarding/
│   │   ├── api/                   # saveProfileStep
│   │   ├── components/            # StepCard, VoiceRecorder, FactPreview
│   │   ├── hooks/                 # useOnboardingStep, useVoiceInput
│   │   └── screens/               # OnboardingScreen (multi-step)
│   │
│   ├── chat/
│   │   ├── api/                   # WebSocket клиент
│   │   ├── components/            # MessageBubble, ChatInput, TypingIndicator
│   │   ├── hooks/                 # useChat, useWebSocket
│   │   └── screens/               # ChatScreen
│   │
│   ├── voice/
│   │   ├── components/            # VoiceButton, AudioWaveform, PlaybackBar
│   │   └── hooks/                 # useAudioRecorder, useAudioPlayer
│   │
│   └── profile/
│       ├── api/                   # getProfile, updateProfile
│       ├── components/            # ProfileSection, EditField
│       └── screens/               # ProfileScreen
│
└── shared/                        # Общее — не знает о фичах
    ├── api/
    │   ├── client.ts              # Axios instance, interceptors, JWT refresh
    │   └── types.ts               # Базовые типы ответов
    ├── components/                # Button, Input, Avatar, Modal, Spinner
    ├── hooks/                     # useDebounce, useKeyboard, useAppState
    ├── store/                     # Zustand: auth state, ui state
    ├── utils/                     # formatDate, formatPhone, etc.
    └── theme/                     # Цвета, типографика, отступы
```

**Ключевые зависимости:**

| Задача | Библиотека |
|---|---|
| Навигация | React Navigation 6 |
| Серверный стейт | TanStack Query |
| Клиентский стейт | Zustand |
| Формы | React Hook Form |
| Аудио | Expo AV |
| HTTP | Axios |
| Хранение токенов | Expo SecureStore |
| Типизация | TypeScript |

---

## Голос

- Пользователь записывает аудио в приложении
- STT преобразует в текст → передаётся как обычное сообщение
- Ответ Claude преобразуется TTS → воспроизводится в приложении
- Оба режима (текст и голос) используют один и тот же pipeline памяти

---

## MVP — что входит

### Backend
- [ ] Регистрация / авторизация (JWT)
- [ ] Создание персонального компаньона при регистрации
- [ ] WebSocket чат с Claude
- [ ] Хранение сообщений по дням
- [ ] Генерация дневных саммари (фоновый job)
- [ ] Агрегация в недельные саммари
- [ ] Обновление профиля пользователя (UserProfile)
- [ ] Семантический поиск по архиву (pgvector)
- [ ] Шифрование памяти в БД
- [ ] STT endpoint (Whisper)
- [ ] TTS endpoint

### Mobile (React Native)
- [ ] Экран чата (текст)
- [ ] Запись и воспроизведение голоса
- [ ] Онбординг — базовый профиль при первом запуске

### Вне MVP (потом)
- Уведомления ("давно не общались")
- Смена голоса / персонажа компаньона
- Аналитика настроения
- Экспорт / удаление своих данных (GDPR)

---

## Ключевые принципы

1. **Пользователь не должен чувствовать себя потерянным** — компаньон всегда в контексте
2. **Приватность** — память зашифрована, пользователь владеет своими данными
3. **Живость** — голос делает общение человечным
4. **Безопасность** — компаньон поддерживает, но не заменяет профессиональную помощь; при кризисных сигналах — мягкий редирект
