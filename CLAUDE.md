# CLAUDE.md — Eon Project Guide

## Project Layout

```
Eon-human-support/
├── src/                  # Python backend (DDD)
├── eon-mobile/           # React Native frontend (Expo)
├── docker-compose.yml    # postgres + redis + api + worker + scheduler
├── Dockerfile            # API image
├── Dockerfile.worker     # TaskIQ worker image
├── alembic.ini
└── .env                  # secrets, never commit
```

---

## Backend Patterns

### Dependency Injection — Dishka

HTTP handlers use `@inject` + `Annotated[Type, FromDishka()]`:

```python
@router.get("/")
@inject
async def handler(repo: Annotated[IRepo, FromDishka()], user_id: UUID = Depends(get_current_user_id)):
    ...
```

**WebSocket handlers cannot use `@inject`** — Dishka creates `Scope.SESSION` for WebSocket connections but repositories are `Scope.REQUEST`. Use manual container management instead — **open a fresh scope per inbound message, not one scope for the whole connection**:

```python
@router.websocket("/chat")
async def chat_ws(websocket: WebSocket):
    container = websocket.app.state.dishka_container
    while True:
        data = await websocket.receive_json()   # no scope held while waiting here
        async with container() as request_container:
            repo = await request_container.get(IRepo)
            ...
        # scope (and its pooled DB connection) closes before the next receive_json()
```

A WS connection can sit open for hours between messages. Opening the Dishka scope once for the entire connection (as an earlier version of this handler did) pins a pooled DB connection for that whole time — with the default SQLAlchemy pool (`pool_size=10, max_overflow=15`, see `src/infrastructure/db/engine.py`), a few dozen simultaneously-open (even idle) chats exhausts the pool and new WS handshakes start blocking. Scoping per-message keeps a connection checked out only for the duration of actually processing one message.

See `src/presentation/ws/chat.py` for the full pattern.

### Domain Structure

Each domain aggregate lives in `src/domain/<name>/`:
- `entity.py` — dataclass/pydantic entity
- `repository.py` — abstract interface (`IXxxRepository`)

Implementations are in `src/infrastructure/db/repositories/<name>.py`.

Use cases are in `src/application/<domain>/`. They only depend on domain interfaces, never on infrastructure directly.

### Memory Architecture

Messages are stored encrypted. Compression is driven by a **TaskIQ cron scheduler** (own process, `taskiq scheduler ... src.infrastructure.tasks.broker:scheduler`, `docker-compose.yml`'s `scheduler` service) — not by a per-message event. Two nightly cron tasks in `src/infrastructure/tasks/memory_compression.py` discover which companions need compression and fan out to the per-companion tasks:

1. **Raw messages**: stored for 7 days (`BuildContext._ACTIVE_WINDOW_DAYS`)
2. **Daily summaries**: `compress_daily_memories_task` (03:30 daily) compresses the day that just fell out of the 7-day window (day 8) into a summary, via `generate_daily_summary_task`
3. **Weekly summaries**: `compress_weekly_memories_task` (Mon 04:00) compresses week-old daily summaries (day 31+) into a weekly summary, via `generate_weekly_summary_task`
4. **Semantic search**: each daily/weekly summary is embedded (`VsegptClient.embed()`, vsegpt `openai/text-embedding-3-small`) and stored via `IMemoryEmbeddingRepository`. `SendMessage` embeds the user's current message and pulls the top-3 relevant summaries into the system prompt (`BuildContext.get_relevant_archive_for_text`) — skipped in `MODE=test` to keep the minimal prompt.
5. After a daily summary is generated, `update_profile_from_dialogue_task` re-extracts facts from it to keep the profile current.

**Server-side key for background jobs**: the app is E2E — `UserKeyModel.encrypted_key` is wrapped client-side with a PBKDF2(password)-derived key the server can never decrypt. Background cron tasks instead use `UserKeyModel.server_wrapped_key`, a *separate* copy wrapped with `MASTER_ENCRYPTION_KEY`, captured opportunistically the first time a user opens a WS chat connection (`CaptureServerKey` use case, called from `src/presentation/ws/chat.py`). This is a deliberate weakening of the original full-E2E design (see migration `0003_e2e_keys.py`) traded for working nightly memory compression — a `MASTER_ENCRYPTION_KEY` compromise now exposes message content, not just a DB dump. Compression silently no-ops for a user until their first chat connection captures the key (`server_wrapped_key IS NULL`).

`BuildContext` in `src/application/chat/build_context.py` assembles the full context window before each Claude call.

- `_MAX_RECENT_MESSAGES = 20` in production, `_MAX_RECENT_MESSAGES_TEST = 4` in test mode
- Profile fields (name, occupation, values, etc.) are injected into the system prompt
- `_style_instructions()` returns a behaviour string based on `communication_style` field
- In test mode the system prompt is minimal: `"Ты — Eon, компаньон для {name}. Отвечай по-русски, коротко и по делу."`

### Encryption

Each user gets an individual AES-256-GCM key derived from `MASTER_ENCRYPTION_KEY`. All stored messages are encrypted at rest. See `src/infrastructure/crypto/aes.py`.

### Auth — Unified Identifier + Verification Code

Login/Register take a single `identifier` field (not separate email/phone inputs) — the server classifies it (`classify_identifier()` in `src/application/auth/identifier.py`: contains `@` → email, else normalized to E.164 phone) and routes to the matching flow. `RegisterUser`/`LoginUser` (`src/application/auth/register.py`/`login.py`) are the single entry points; the client never needs to know or ask which kind of identifier it got.

- **Registration no longer logs the user in.** `/auth/register` creates the account and fires off a 4-digit verification code (email via SMTP, or SMS — `SmsSender` is currently a stub that just logs the code, no provider wired up yet) but returns before verification. Login is blocked (`UserNotVerifiedError` → 403) until the code is confirmed via `/auth/verify`.
- **Codes are Redis-only** (`VerificationCodeService`, `src/infrastructure/verification/code_service.py`) — a 4-digit code with a 2-minute TTL (`verification_code_ttl_seconds`), plus a *separate* 30s cooldown key (`verification_resend_cooldown_seconds`) gating `/auth/resend-code` so a user can't spam it and rack up SMS costs.
- **Frontend flow**: `RegisterScreen` → `authApi.register()` → navigates to `VerifyCodeScreen` (params: `identifier`, `password` — carried forward in memory only, needed to complete the login step after verification, never persisted) → on successful `/auth/verify`, immediately calls `/auth/login` itself and unlocks the E2E key exactly like a normal login would (`completeLoginFromTokens()` in `useLogin.ts`, shared by both `useLogin` and `VerifyCodeScreen` to avoid duplicating that unlock-and-setTokens logic). `LoginScreen` also lands on `VerifyCodeScreen` (with `autoResend: true`, since the original code may be long expired) if login 403s with "not verified" — a half-registered user isn't stuck at a dead-end error.
- `VerifyCodeScreen`'s resend countdown (`RESEND_COOLDOWN_SECONDS = 30`, matching the backend's own cooldown) is purely a UI courtesy — the server enforces the real cooldown regardless (429 if hit early).

### AI Provider — vsegpt.ru

The project uses **vsegpt.ru** as an OpenAI-compatible proxy. It works from Russia and provides access to both Claude models and Whisper STT.

`VsegptClient` (`src/infrastructure/ai/client.py`) uses `AsyncOpenAI` (not the Anthropic SDK) because vsegpt only exposes an OpenAI-compatible endpoint. Named after the provider, not a model family — the client is not currently calling Claude at all (see "Current model" below) and the name shouldn't imply otherwise. Its prompt templates and extraction schemas live in a sibling `src/infrastructure/ai/prompts.py`, not inline — same reasoning as the two files below.

```python
from openai import AsyncOpenAI

class VsegptClient:
    def __init__(self, settings: Settings) -> None:
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.vsegpt_base_url or None,
        )

    async def chat(self, system, messages, max_tokens=1024):
        response = await self._client.chat.completions.create(
            model="openai/gpt-4.1-mini",   # change here to switch model
            messages=[{"role": "system", "content": system}] + messages,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
```

Current model: `openai/gpt-4.1-mini` (cheap, good for test). Upgrade to `anthropic/claude-sonnet-4-6` for production quality.

**Prompts are not inline** — three separate `prompts.py` files, one per layer that owns them, instead of prompt strings scattered across whichever use case happened to need one:
- `src/infrastructure/ai/prompts.py` — implementation details of the client's own extraction calls (onboarding step schemas, the `extract_reminder`/`extract_facts` wrapper templates, stub chat responses).
- `src/application/chat/prompts.py` — the chat system prompt itself (`render_system_prompt`/`render_compact_system_prompt`), the five `communication_style` instruction sets (full + `MODE=test`-compact), voice-mode and reminder-confirmation prompt fragments.
- `src/application/memory/prompts.py` — the daily/weekly summary compression prompts.

Splitting by layer (not one shared file) keeps the dependency direction intact — infra doesn't reach into application/, and each file is only imported by the use case(s) that actually own that prompt's product behaviour.

### STT — vsegpt Whisper

`src/infrastructure/stt/whisper.py` uses the same `AsyncOpenAI` client pointed at vsegpt:

```python
self._client = AsyncOpenAI(
    api_key=settings.openai_api_key,
    base_url=settings.vsegpt_base_url or None,
)

async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
    response = await self._client.audio.transcriptions.create(
        model="stt-openai/gpt-4o-mini-transcribe",
        file=(filename, io.BytesIO(audio_bytes)),
        language="ru",
    )
    return response.text
```

**Always send audio as WAV** (`audio.wav` / `audio/wav`). The m4a format is rejected by vsegpt's transcription endpoint.

### TTS — vsegpt

`src/infrastructure/tts/vsegpt.py` (`VsegptTTS`) — same `AsyncOpenAI` client, same `openai_api_key`/`vsegpt_base_url` as chat and STT, one provider for all three instead of a separate account:

```python
async def synthesize(self, text: str) -> bytes:
    response = await self._client.audio.speech.create(
        model="tts-openai/tts-1",
        voice="alloy",
        input=text,
        response_format="mp3",
    )
    return await response.aread()
```

Wired through `SynthesizeSpeech` (`src/application/voice/synthesize.py`) and `POST /voice/synthesize` (`src/presentation/api/voice.py`), returned as `audio/mpeg`. `tts-openai/tts-1` is vsegpt's cheapest TTS tier (3.2₽/1000 chars) — bump to `tts-openai/gpt-4o-mini-tts` (7.5₽/1000 chars) for noticeably better prosody once quality matters more than cost, same pattern as the chat model's test→production upgrade path.

This replaced an earlier `ElevenLabsTTS` stub (`elevenlabs_api_key`/`elevenlabs_voice_id` settings, never actually configured — both blank in `.env`) that was wired into DI but non-functional. Removed rather than kept alongside, since running two TTS providers behind one endpoint with only one actually configured was just dead code.

`POST /voice/synthesize` takes a JSON body (`SynthesizeRequest { text: str }`, `src/presentation/schemas/voice.py`), not a bare query param — fixed as part of wiring up Conversation Mode below, since a query string was never going to survive a full companion reply of any length.

### Conversation Mode — hands-free voice loop

`ConversationOverlay` (`src/features/chat/components/ConversationOverlay.tsx`) is a full-screen "walkie-talkie" loop reusing the existing STT/chat/TTS pieces: record → `voiceApi.transcribe` → send over the chat WS → wait for the reply → `voiceApi.synthesize` → play it → listen again. Entered via a `headset-outline` icon button in `ChatInput` (left of the text field, `onStartConversation` prop) — a **separate** control from the existing `VoiceButton`, not a repurposing of it, so a quick one-off voice message and "start a hands-free conversation" stay two distinct, unambiguous actions.

**This is not a real low-latency voice mode**, and deliberately doesn't try to be. ChatGPT's actual Advanced Voice Mode is one multimodal model that natively consumes and emits audio tokens directly over a persistent, bidirectional-streaming connection (OpenAI's Realtime API) — no separate STT/LLM/TTS models, server-side voice-activity detection instead of a tap-to-stop button, and the model can be interrupted mid-response. Our pipeline is three sequential, non-streaming HTTP round-trips per turn (transcribe, chat, synthesize) — vsegpt's docs show no Realtime/WebSocket-audio endpoint or streaming `chat/completions`, so there's nothing to build that on top of even in principle without going directly to OpenAI (the exact Russia-access problem vsegpt was chosen to solve in the first place). Each turn has a real multi-second "thinking" pause; this is closer to a voice-message ping-pong than a live conversation.

**State machine** (`ConversationOverlay`'s `phase`): `listening → thinking → speaking → listening → ...`
- **listening**: recording (own `useAudioRecorder()` instance, separate from `ChatInput`'s). Tapping the orb means "I'm done talking" — stops the recording and moves to `thinking`.
- **thinking**: transcribes, then sends over the WS (`send()` from `useChat`). Since `send()` doesn't return the reply — it arrives later as a WS push into `useChat`'s `messages` array — this phase watches `messages` for two new entries to land (the just-sent user message, then the assistant's reply) rather than awaiting anything directly.
- **speaking**: synthesizes the reply and plays it via `expo-av`'s `Audio.Sound`. Tapping the orb here stops playback and jumps straight back to `listening` — a lightweight stand-in for real barge-in interruption (not true mid-generation interruption, just "let me talk now").
- On playback finishing naturally (`status.didJustFinish`), loops back to `listening` on its own — no tap needed to keep the conversation going.

Visually reuses the halo+core `react-native-svg` orb pattern from onboarding's `RecordingOverlay` (see Voice Recording notes) but as its own copy, not a shared import — this one's orb reacts to `phase` (dimmer/slower while `thinking`, livelier while `speaking`) in a way the onboarding version, with only one state, doesn't need to.

**`voiceApi`** (`src/features/voice/api/index.ts`, new) — `transcribe()`/`synthesize()` were previously copy-pasted separately into `ChatInput` and `OnboardingScreen`; consolidated here once `ConversationOverlay` became a third consumer. `synthesize()` writes the raw `audio/mpeg` response straight to a cache file via `expo-file-system`'s new `File` API (`file.write(new Uint8Array(...))`, no base64 round-trip) and returns its `file://` uri for `expo-av` to play — the package's own top-level `writeAsStringAsync` etc. are the *old* API and throw at runtime in SDK 54's `expo-file-system@~19`; only `expo-file-system/legacy` still has them, so this uses the new `File`/`Directory`/`Paths` classes instead.

**Replies are capped short in Conversation Mode specifically (`voice_mode` flag), since there's no streaming to hide the wait otherwise.** `useChat.send(text, voiceMode?)` sends `{ text, voice_mode, client_time, client_tz }` over the WS (the latter two are also how Reminders below resolve "напомни в 18:00" — same payload, not a separate mechanism); `chat_ws` (`src/presentation/ws/chat.py`) forwards `voice_mode` into `SendMessage.execute(..., voice_mode=...)`, which when true appends "отвечай 1-2 короткими предложениями, разговорным тоном" to the system prompt and caps `VsegptClient.chat`'s `max_tokens` at 120 (vs. the normal 1024). A normal-length text reply reads fine in a chat bubble but means a proportionally longer TTS wait when it has to be spoken aloud first — every full reply already gets synthesized *and generated* start-to-finish before any audio plays, so a shorter reply is the one lever that actually shrinks both of those steps at once (there's nothing to stream: see the "not a real low-latency voice mode" note above).

### Reminders — "напомни мне..." → scheduled push notification

Detected inline in every chat message, not a separate feature/UI — `SendMessage.execute()` (`src/application/chat/send_message.py`):

1. **Cheap keyword gate first** (`_looks_like_reminder`) — most messages obviously aren't reminder requests, and this check is free. Grouped by underlying *request*, not just conjugations of one verb: напомнить/напоминать (two different stems, `напомн`/`напомин` — not spelling variants of each other), не забудь/не забы(ть) (same idea negated), предупреди/разбуди/сообщи мне/дай знать (same request, different verb), будильник/таймер (same "notify me at/after time X" mechanism, phrased as a device metaphor), and colloquial пни меня/толкани меня. Only messages that match any of these go any further.
2. **Time resolution needs the client's local wall-clock time**, which the server has no other way to know — `useChat.send()` sends `client_time` (device's current UTC instant, `toISOString()`) and `client_tz` (IANA zone name, `Intl.DateTimeFormat().resolvedOptions().timeZone`) with *every* message. `_client_local_iso()` combines them via `zoneinfo` into an offset-aware local ISO string (DST-correct, unlike trusting a raw numeric offset that could be stale).
3. **`VsegptClient.extract_reminder(text, client_local_iso)`** — a small, separate GPT call (only reached past the keyword gate) given the user's message and their current local time. Explicit times ("в 18:00", "через 2 часа") are used as-is; vague-but-still-time-shaped phrasing gets an explicit fallback convention rather than being treated as "no time given" — "попозже"/"через какое-то время"/"чуть позже" → +3 hours from now, "на следующей неделе" (no specific day) → same weekday and time, 7 days out. Only messages with *no* time indication at all ("напомни мне" and nothing else) return `{}`.
4. **This now runs *before* the main reply is generated, not after** (an earlier version ran it afterward so it couldn't delay or break the reply — but that meant the reply itself had no way to know whether a reminder actually got scheduled). `extract_reminder` returns one of three shapes, and `_maybe_schedule_reminder` reacts to each differently by appending a note to the system prompt:
   - **Resolved** (`{"message": ..., "due_at": ...}`) → reminder is created and scheduled *and* the model is told the exact local time it landed on ("Напоминание только что реально поставлено на 20.07 23:00 — можешь спокойно подтвердить это, не говори, что не можешь ставить напоминания"). This note turned out to be necessary, not optional — a plain LLM with no tool-calling integration has no way to know this backend capability exists at all, and (correctly, for a model that genuinely can't set reminders on its own) defaults to telling the user it can't — even though one was just silently created underneath it. Caught this exact failure live: the reminder had scheduled successfully, but the reply said "пока не могу установить напоминания," and the user asked why — twice, since they retried after the wrong reply, leaving two identical pending reminders in the table until manually deduplicated.
   - **`{"unclear": true}`** — is a reminder request (keyword gate was right), but no time was pinned down even with the vague-phrasing fallbacks → tells Eon to ask what time instead of silently doing nothing.
   - **`None`** — genuinely not a reminder request at all (a keyword-gate false positive, e.g. "не забудь, что обещал" with no time attached) → no note added, the reply proceeds untouched. Deliberately kept distinct from `{"unclear": true}` — collapsing both into one falsy value would make Eon ask "во сколько напомнить?" in reply to messages that were never asking for a time-based reminder.

   A scheduling exception is still swallowed so it can't break the chat response.
5. If `due_at` parses and is in the future, the reminder text is encrypted with the user's `raw_key` (same field-level encryption as every message) and saved as a `Reminder` (`src/domain/reminder/`, table `reminders` — its own aggregate, not a message, since it needs its own lifecycle: `pending → sent`/`failed`).
6. **Scheduled via TaskIQ**, not a naive "sleep and poll": `send_reminder_task.schedule_by_time(reminder_schedule_source, due_at_utc, reminder_id=...)`. This needed a second schedule source alongside the existing `LabelScheduleSource` (which only reads the *fixed* cron schedules declared as decorator labels on daily/weekly memory-compression tasks) — `taskiq_redis.RedisScheduleSource` supports `add_schedule`/`delete_schedule` at runtime, exactly what a one-off "remind me at an arbitrary future instant, decided just now" needs. Both sources are registered on the one `scheduler` in `src/infrastructure/tasks/broker.py`.
7. **`send_reminder_task`** (`src/infrastructure/tasks/reminders.py`) fires at `due_at`: decrypts the reminder text (via the same `server_wrapped_key` background-job mechanism the memory-compression tasks already use — fails gracefully to `status="failed"` if the user's key was never captured), and **models firing as Eon actually sending a message** — saves `"Напоминаю: {text}"` as a normal assistant `Message` in that companion's chat history (so opening the app later shows it in context, not as an orphaned banner), and that same message is what gets pushed via `ExpoPushClient`, not a separate copy of the reminder text. Push is best-effort on top of the saved message — if there's no registered device token, or the push call fails, the message is still there waiting in chat.

**The companion's name decrypt is a separate try/except from the reminder text's, deliberately.** A companion's `name` is stored unencrypted until the user's first rename with an active raw_key — e.g. the server-created "Eon" default at registration, before any client encryption context exists (same case `CompanionRepository._decrypt_name` already falls back for). Caught live: a fresh account's first-ever reminder decrypted the reminder text fine but then hit this on the *name* (needed only for the push notification's title) — and because both decrypts shared one `except`, that failed the entire reminder (`status="failed"`, no message saved, nothing delivered) over a field that wasn't even essential to the reminder itself. Now the name decrypt has its own try/except with a plain-string fallback, matching `_decrypt_name`'s own behavior, so a name-decrypt hiccup can no longer take an otherwise-successful reminder down with it.

**Storage isn't "just a queue"** — a `Reminder` row in Postgres (`reminders` table) is the durable source of truth (`pending`/`sent`/`failed`, survives restarts); Redis only holds *when to fire it* (`schedule:<id>` key, read by the separate scheduler process) and, for the few seconds around firing, the actual `ListQueueBroker` task queue that hands the ready job to a worker. Delete the Redis key and the reminder record still exists but nothing will ever trigger it; delete the Postgres row and a still-pending Redis schedule fires into a `send_reminder_task` that immediately no-ops (`get_by_id` returns nothing).

**Scheduler polling interval had to be tuned down.** TaskIQ's scheduler CLI checks *readiness* of already-fetched schedules every second, but only re-*fetches* the schedule list from sources (i.e. notices something new was added to Redis) on a separate `--update-interval`, defaulting to 60s — fine for the nightly cron jobs, but up to a minute of slop on a reminder due a couple minutes out is bad. `docker-compose.yml`'s scheduler command sets `--update-interval 5`.

**A saved message alone doesn't reach an already-open chat — `send_reminder_task` runs in a completely different process (`eon-worker`) from any live WebSocket connection (`eon-api`).** A normal chat reply only ever reaches the client because it's a direct response to something the client itself just sent over that same socket; a reminder firing has no such request to respond to. Fixed with Redis pub/sub: `send_reminder_task` publishes `{"reply": message_text}` to `reminder:{companion_id}` (the `REMINDER_CHANNEL` template, shared between `reminders.py` and `chat.py`) right after saving the message; `chat_ws` resolves the connection's `companion_id` once (a short-lived Dishka scope, same pattern as `CaptureServerKey`'s initial key capture) and spawns a background `_forward_reminders` task that subscribes to that channel and forwards anything published straight through the socket in the exact same `{"reply": ...}` shape `useChat.ts` already expects from a normal reply — the frontend needed zero changes to receive these live. That background task runs concurrently with the connection's main receive loop for its whole lifetime and is cancelled in `chat_ws`'s `finally` block. Verified live end-to-end with a throwaway WS client: connect, fire a reminder, confirm the message arrives over the open socket within about a second — no reconnect or history refetch needed.

**The WS connection had no token-refresh path at all — access tokens expire in 15 minutes (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`), and `useChat`'s reconnect loop just kept retrying with the same now-expired token forever.** Caught live: past the 15-minute mark, every reconnect attempt failed with the token rejected before `chat_ws` ever calls `websocket.accept()` — which is why uvicorn's access log shows this as a flat "403 Forbidden" rather than any code `chat_ws` itself sets (`close(code=4001)`, called pre-accept, reads as a rejected HTTP handshake, not a WS close code). `apiClient`'s HTTP response interceptor already refreshed on a 401, but that logic was only ever inline in the interceptor, not reusable — pulled out into an exported `refreshTokens()` in `src/shared/api/client.ts`, called from `useChat.ts`'s `socket.onclose` before every reconnect attempt (harmless to call even when the token was still valid — it's just one extra POST). No cheap way to distinguish "closed because of an expired token" from any other disconnect reason from inside `onclose`, so it refreshes unconditionally on every close rather than trying to guess.

**First version of that fix introduced a worse bug: `onclose` awaited `refreshTokens()` before scheduling the retry.** `refreshTokens()`'s `axios.post` had no timeout, so the moment the socket dropped for an ordinary network reason (the actual common case — a server restart, a brief connectivity blip) rather than an actually-expired token, that POST could itself hang far longer than the 3s retry interval — stalling the *entire* reconnect loop on one slow request, which read as the app just never reconnecting at all. Fixed two ways: `refreshTokens()` now passes `{ timeout: 8000 }` so it can't hang indefinitely, and — more importantly — `onclose` no longer awaits it at all (`refreshTokens().catch(() => {})`, fire-and-forget); `connect()` re-reads the token from SecureStore fresh on every call, so if the refresh is still in flight when the next retry fires, that attempt just reuses the old token and fails fast into the *next* retry rather than blocking this one. Also tightened `refreshTokens()`'s own failure handling while fixing this: it used to clear stored tokens (forcing a logout) on *any* failure, which was fine when this only ran after a confirmed 401, but became actively dangerous once it also runs on every plain network hiccup during WS reconnect — now only clears tokens when the server explicitly rejected the refresh (401/403), leaving them untouched on a timeout or connection failure.

**Real push notifications need an EAS project id** — `usePushRegistration()` (`src/features/push/hooks/`, called once from `AppNavigator`) requests notification permission and calls `Notifications.getExpoPushTokenAsync({ projectId })`, and `projectId` comes from `app.json`'s `extra.eas.projectId`. The project is linked to the `sermich` Expo account (`npx eas-cli init --force` — `--force` was needed because the account has access to more than one Expo account/org (`sermich`, `sermichs-team`), so `init` can't pick a default on its own; ran only after explicit confirmation of which account, since linking a project to an account is a persistent choice, not something to silently default). `owner: "sermich"` and `extra.eas.projectId` are now both set in `app.json`. Push notifications still plain don't work on the iOS Simulator at all (a hard OS limitation) — testing needs a real device (Expo Go can receive them fine, no custom dev client required for this specific piece, unlike Skia).

### Settings — `.env` keys

```
ANTHROPIC_API_KEY=placeholder        # unused, kept for legacy; real key goes to OPENAI_API_KEY
OPENAI_API_KEY=sk-or-vv-...          # vsegpt key — used for both chat and STT
VSEGPT_BASE_URL=https://api.vsegpt.ru/v1
MODE=test                            # test | production — controls prompt size and history depth
MASTER_ENCRYPTION_KEY=...
```

`src/main/settings.py` exposes `vsegpt_base_url: str = ""` and `mode: str = "production"`.

### MODE=test cost optimisation

In `MODE=test`:
- System prompt is minimal (~20 tokens) instead of full profile context
- Recent message history is capped at 4 messages instead of 20
- Target cost: ~0.03 RUB per exchange with gpt-4.1-mini

Switch to `MODE=production` when deploying to real users.

### Communication Styles

`CommunicationStyle(StrEnum)` in `src/domain/profile/entity.py`:
`LISTENER | FRIEND | MENTOR | MIRROR | DEBATER`

`_style_instructions()` in `build_context.py` maps each value to a behaviour paragraph injected into the system prompt. Default is `FRIEND`.

The profile step `companion_preferences` must be saved with `step="companion_preferences"` in the PATCH body, otherwise the backend returns 422.

### passlib + bcrypt Compatibility

bcrypt 4.x breaks passlib's `CryptContext` initialization with a `ValueError`. Pin `bcrypt<4.0` in `requirements.txt`.

---

## Frontend Patterns

### Entry Point

`eon-mobile/index.ts` → `registerRootComponent(App)` → `src/core/index.tsx`

**Do not** name any source directory `app` or `src/app` — Expo detects this and activates Expo Router (even without the package installed), which breaks navigation and blocks touch events.

### Navigation

`src/core/navigation/RootNavigator.tsx` — wraps `NavigationContainer` with a hydration guard:

```tsx
const [ready, setReady] = useState(false);
useEffect(() => { hydrate().finally(() => setReady(true)); }, []);
if (!ready) return <View style={{ flex: 1, backgroundColor: '#0F0F14' }} />;
return <NavigationContainer>...</NavigationContainer>;
```

This prevents the NavigationContainer from re-rendering during auth store hydration, which previously caused touch events to stop working.

The navigator also shows a `SplashScreen` overlay for a minimum of 2 seconds on first load.

### Onboarding Guard

`RootNavigator` checks multiple profile fields (not just `preferred_name`) to decide whether to show Onboarding or go straight to Chat. If the user already filled in their profile, the app always opens on Chat.

### KeyboardAvoidingView in Chat

Use `useHeaderHeight()` from `@react-navigation/elements` as the `keyboardVerticalOffset`. Do not hardcode a pixel value — header height varies by device and navigation config.

```tsx
const headerHeight = useHeaderHeight();
<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight}>
```

### Theme System ("Liquid Glass")

`src/shared/theme/` is split into token modules, all re-exported through the `index.ts` barrel — never import a hex/rgba/spring-config/fontFamily literal directly in a component, always go through one of these:

- **`colors.ts`** — `darkColors`/`lightColors` (flat semantic tokens: bg, bgCard, accent, accentWarm, onAccent, userBubble/userBubbleText, etc.), `useColors()` hook that reads the continuous `themeValue` (0-1) from the settings store and returns every token linearly interpolated between the two palettes via `mixColor()` — not a binary dark/light switch. `userBubble`/`userBubbleText` are separate per-theme pairs specifically so light mode can use a pale-tint bubble with dark text instead of white-on-purple.
- **`material.ts`** — successor to the old `glass.ts`. `useMaterial(level)` hook, `level: 'thin' | 'regular' | 'thick'` controls blur intensity/overlay/shadow depth (Liquid-Glass-style material hierarchy). Also exports `scrim` (modal backdrop color, theme-independent).
- **`motion.ts`** — `spring.{gentle,snappy,bouncy}` and `timing.{fast,base,slow}` named presets for `react-native-reanimated`. Pick one of these three "personalities" per animation; don't invent new spring configs per screen.
- **`typography.ts`** — `fontFamily.{light,regular,medium,semibold,bold}` (Onest via `@expo-google-fonts/onest`, loaded in `src/core/index.tsx` with a `useFonts()` gate before anything renders) and `typography.{h1,h2,h3,body,bodyMedium,bodySemibold,bodySmall,caption}` built from those. Never use `fontWeight` on custom-font text — RN can't fake-bold a named font family; use a `typography`/`fontFamily` variant instead.
- **`utils.ts`** — `alpha(hex, opacity)` helper. Use instead of the `color + '30'` hex-suffix string-concat hack.
- **`styleAccent.ts`** — `useStyleAccent(communicationStyle)` / `getStyleAccent(style, themeValue)`. Chat-scoped accent that varies by the AI's `communication_style` (listener/friend/mentor/mirror/debater): a "warmth" dial (`STYLE_WARMTH`, 0=driest→1=warmest) mixes between the app's existing `accent` (cool/dry end, e.g. Mentor) and `accentWarm` (warm end, e.g. Friend) — never new hand-picked hues, so adding a future style is one more warmth number. Unknown styles fall back to a neutral 0.5. Deliberately scoped to chat-only surfaces (`MessageBubble`'s AI-bubble left edge stripe, `TypingIndicator` dots) — the app's global `accent` token stays constant everywhere else so Eon reads as the same companion regardless of mode.
- `spacing`, `radius` — unchanged, static layout tokens.

**Rule**: every component calls `useColors()` + (when it renders a glass surface) `useMaterial()`, uses `typography`/`fontFamily` for text, and `StyleSheet.create` only for non-color, non-font layout.

```tsx
export function MyComponent() {
  const colors = useColors();
  return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.md },   // no colors here
});
```

Radius values: `sm: 12`, `md: 18`, `lg: 28`, `full: 9999`.

`GlassCard`/`GlassPanel` (`src/shared/components/Glass.tsx`) take a `level` prop (`MaterialLevel`) instead of a raw `intensity` number. Unlike other components, they do **not** use `useMaterial()` — their overlay/border/shadow colors are driven by `useAnimatedThemeValue()` (`theme/ThemeAnimation.tsx`) through `useAnimatedStyle`/`interpolateColor`, animating on the UI thread. This is because `Glass` wraps a `BlurView` and is the most-repeated component in the app; a JS-driven theme-toggle animation (stepping the store's `themeValue` through a ramp) re-rendered every `BlurView` instance on every step and visibly stuttered. `blurIntensity` itself is read as a plain constant (`darkMaterial[level].blurIntensity`) since dark/light specs use identical values per level — nothing to animate there.

**Specular highlight (`GlassRim`, in `Glass.tsx`)**: real Liquid Glass's highlight is a *rim light tracing the shape's contour* — brightness depends on surface-normal angle vs. a light direction, brightest facing the light and fading around the perimeter (Apple's actual implementation is a GPU shader: displacement-map refraction + gyroscope-linked specular highlight; see WWDC25 session 219 and https://imadrahmoune.com/liquid-glass/ for the technical breakdown). We don't run shaders — `GlassRim` approximates the effect with `react-native-svg`: a rounded-rect **stroke** (not a filled interior gradient) using a top-to-bottom `LinearGradient` as the stroke paint, which naturally reads as "brightest at the top, fading around the sides" without needing an angular/conic gradient. Dark-theme only — white is invisible on light theme's near-white cards, and colored tints there read as a stain rather than light (tried violet and warm amber, both rejected). Animates via a slow opacity breathe, not positional movement — an earlier version translated a filled rectangle up/down for "floating," but sliding it away from the true edge opened a gap with nothing covering it, exposing the border/seam underneath; a fixed-geometry stroke has no equivalent safe direction to slide.

If a future pass wants the *real* thing (background refraction + gyroscope-reactive highlight), that's a `@shopify/react-native-skia` (SkSL shader) project — a much larger lift than tuning `GlassRim`. A Skia-shader version of `RecordingOverlay`'s `VoiceOrb` was tried and reverted (crashed on plain Expo Go — see Voice Recording notes below) precisely because that lift, and the dev-client requirement it brings, wasn't taken on deliberately up front. Worth deciding that trade-off explicitly before attempting this again, for either component.

### Icons

Always `Ionicons` from `@expo/vector-icons` — never a raw Unicode glyph (`✕`, `↑`, `✓`, `●`) or an emoji (`🎙`, `🔒`, `✏️`) rendered inside a `<Text>`. Mixing icon families (or an emoji's full-color platform glyph next to a monochrome vector icon) is exactly what reads as "inconsistent" — a plain `Text` glyph also silently ignores the theme's `color` token half the time, since emoji ignore `color` entirely and a forgotten `color` prop on a bare glyph defaults to platform black.

- **Prefer the `-outline` variant** of a glyph when Ionicons offers one (`settings-outline`, `close-outline`, `arrow-up-outline`, `mic-outline`, `lock-closed-outline`, `person-outline`, `mail-outline`, `phone-portrait-outline`, `sunny-outline`/`moon-outline`) — it's the thin, uniform-stroke weight the rest of the app already uses. Fall back to the plain name only when Ionicons has no outline form for that glyph (`chevron-back`, `chevron-down` — chevrons only ship as one weight).
- **Exception: tiny badge-scale glyphs** (≲12px, e.g. the selected-preset checkmark in `SettingsScreen.tsx`) use the solid/non-outline weight (`checkmark`, not `checkmark-outline`) — outline strokes are thin enough to visually disappear at that size.
- **Status/recording dots are plain colored `View` circles**, not a `●` text glyph — see `ChatScreen.tsx`'s `statusDot`, `ChatInput.tsx`'s `recDot`, `VoiceButton.tsx`'s `activeDot`. A shape-based dot respects the theme color reliably; a text bullet character's rendered size/baseline varies by font and is one more thing that can silently default to the wrong color.
- Size by context, not by feel: header/nav icons ~20–22px, small inline icons (account-type glyph next to text, mode-tab icon) ~15–16px, tiny badge icons ~10–12px. Color via `colors.textSecondary` (nav/header icons) or `colors.textMuted` (quieter/inline icons) — same tokens already used for icon-adjacent text, so an icon never looks like it's from a different palette than its label.

### Settings Store

**`src/shared/store/settings.ts`** (Zustand + SecureStore):
- `presetId / chatBgColors` — chat background preset. Presets are 2-stop `expo-linear-gradient` gradients (`BgPreset.colors`), not flat color + repeating dot/line/cross pattern (that older `PatternOverlay` approach was removed for looking dated — a soft ambient gradient reads as more "Liquid Glass"). Each `BgPreset` also carries a `mode: 'dark' | 'light'` — `SettingsScreen`'s picker only shows presets matching the current theme (no light pastel gradient offered while in dark mode, or vice versa), and `toggleThemeExtreme()`/`hydrate()` both auto-snap `presetId` to the first preset of the new mode if the current one doesn't match (e.g. flipping theme while a dark preset is selected).
- `themeValue: number` — in practice always exactly `0` (full dark) or `1` (full light), toggled as a unit. It's a plain `number` rather than a boolean because `useColors()`/`useMaterial()` interpolate every color channel-by-channel between `darkColors`/`lightColors` (and `darkMaterial`/`lightMaterial`) via `mixColor()` (`theme/utils.ts`) at this value — a continuous-slider theme control was tried and reverted (the drag gesture was too fiddly to get right; see git history), but the interpolation machinery underneath was kept since it works fine for a clean 0/1 flip too and costs nothing extra.
- `toggleThemeExtreme()` — flips the store value **instantly** (single `set()`) and persists to SecureStore as `theme_value`. Used by both the `SettingsScreen` switch and the auth screens' quick-access icon. It used to animate `themeValue` itself through a JS-side ramp (many `set()` calls over ~300ms) to produce a visible crossfade, but every step re-rendered every `useColors()`/`useMaterial()` consumer on screen — including every `BlurView`-wrapped `Glass` panel — and stuttered. The crossfade now lives entirely on the UI thread instead (see below).
- `themeModeFromValue(v)` — derives the discrete `'dark' | 'light'` label needed by platform APIs that can't do a continuum (`BlurView`'s `tint` prop, sun/moon iconography): `v < 0.5 ? 'dark' : 'light'`.
- `hydrate()` — called on app start, restores preset + `theme_value`; migrates a pre-existing install's old binary `theme_mode` key to `0`/`1` if `theme_value` was never written.

Theme control is a moon/sun segmented picker (`ThemeToggle` in `SettingsScreen.tsx`), not a generic switch — a plain iOS-style switch was tried and read as an off-the-shelf system control rather than something native to the app; the segmented picker reuses the same "accent-filled capsule marks the active choice" language as `StyleCard`/`PresetSwatch` instead. Tap only, no drag. Its slide animation is local to the component (reanimated, UI-thread only) and doesn't touch the app-wide theme value until the tap completes, so it can't cause the re-render storm a continuous draggable slider did.

**Theme crossfade — `theme/ThemeAnimation.tsx`**: `ThemeAnimationProvider` (mounted once at the app root, `core/index.tsx`) holds a Reanimated shared value that mirrors the store's `themeValue` via `withTiming` (550ms, easeInOutQuad) whenever it changes, exposed via `useAnimatedThemeValue()`. Components that want a genuinely smooth crossfade (currently just `Glass.tsx`) read this shared value inside `useAnimatedStyle` and interpolate colors with `interpolateColor` — the whole animation runs on the UI thread, no JS re-renders, no bridge traffic per frame. Plain `useColors()`/`useMaterial()` consumers (background fills, text, icons) still just snap instantly on the store flip — deliberate: converting every themed component in the app to this pattern was out of scope, and the highest-cost surfaces (blur panels) are the ones covered. An earlier attempt used a `ThemeTransitionOverlay` component (masking the instant snap with a full-screen fade veil) — removed; it looked like a mask, not a crossfade, and was made fully obsolete once colors started animating for real.

### Voice Recording — Lock Gesture

`VoiceButton` uses `PanResponder` for gesture detection, but drives its animations (slide-to-lock, the recording pulse) through Reanimated shared values, not the old RN `Animated` API — the original version called `Animated.Value.setValue()` directly from `onPanResponderMove`, which is a JS↔native bridge round-trip on every touch-move event and read as janky finger-tracking. Reanimated shared values are written from that same JS-thread callback but propagate to the UI thread without that bridge serialization.

While recording, two `Ring` components (a border-only circle scaling up from the button's own size while fading out, staggered half a cycle apart via `withDelay` so one is always mid-expansion) replace what used to be a plain breathing scale on the button itself — the classic Siri/Assistant-style "listening" pulse reads much more clearly as "capturing audio" than the button just growing and shrinking in place did.

**The idle→recording transition itself is smoothed too**, separately from the rings: `recorder.start()` (`useAudioRecorder.ts`) is async — permissions, then setting up the actual audio session — real device latency that can't be hidden outright. Before this, *nothing* responded to the touch until that resolved and `state` flipped to `'recording'`, at which point the button's colors/icon just snapped; a beat of apparent unresponsiveness followed by an abrupt jump is what actually read as "jerky," not the recording pulse itself. Two fixes: `pressScale` reacts to the touch instantly (`onPanResponderGrant`), independent of whatever async state `recorder` is still catching up to, so the button visibly responds the moment you touch it rather than waiting on `start()`; and once `state` does flip, `activeProgress` animates the bg/border color change over 220ms via `interpolateColor` (and the icon swap crossfades via keyed `entering`/`exiting`) instead of snapping. The locked-state color swap (accentMuted → accent) is left as an instant snap deliberately — that's a distinct, deliberate user action (slide-to-lock), not part of the automatic idle→recording wait this is smoothing over.

**The recording→locked *row* swap (`ChatInput.tsx`) needed a different fix than the crossfade itself.** `ChatInput` replaces the input row (TextInput + `VoiceButton`) with a "locked" row (cancel / timer / send) once `recorder.state === 'locked'`, and crossfades that swap (`entering`/`exiting`) rather than an instant unmount+mount. That still read as jerky, because the swap fires the instant the slide-up-to-lock drag crosses the lock threshold — while the drag may still be physically in flight (finger still moving, or just barely released) and `VoiceButton`'s own spring-back to center hasn't finished settling. Swapping the *entire surrounding row's layout* out from under a gesture that's still happening is what actually reads as a jerk, independent of how smooth the fade itself is. `ChatInput` gates the row swap behind a local `showLockedUI` state that only flips true ~280ms after `recorder.state` becomes `'locked'` (`setTimeout`, cleared on unmount/state change) — giving the drag time to settle before the surrounding UI changes shape. `VoiceButton`'s own appearance (lock icon, accent color) still reacts to the real `recorder.state` immediately during that window, since that's local feedback on the thing being touched, not a full layout change happening elsewhere. `OnboardingScreen` uses the same `showLockedUI` delay, but no longer swaps a row at all — see below.

**The row-swap fade is spring-based (`.springify()`), not `.duration()`-timed** — `ChatInput.tsx` defines `rowFadeIn`/`rowFadeOut` as `FadeIn`/`FadeOut` builders configured with `spring.gentle`'s damping/stiffness/mass, matching the "personality" every other animation in the app uses, instead of a fixed linear duration that felt mechanical next to it. This required a fix in `theme/motion.ts`: `spring.gentle` etc. used to be cast `as WithSpringConfig`, whose fields are all optional — that widened `spring.gentle.damping` to `number | undefined` and broke `.damping(spring.gentle.damping)`, which needs a plain `number`. The cast was removed; the literal object type (`{ damping: number; stiffness: number; mass: number }`) is still structurally assignable everywhere a `WithSpringConfig` is expected.

**Onboarding replaces the locked row with a full-screen `RecordingOverlay`, not a compact in-row control.** Once locked, recording is hands-free — there's no gesture left to protect, so `OnboardingScreen` hands the whole screen to `features/onboarding/components/RecordingOverlay.tsx` (gated by the same `showLockedUI` flag) instead of `ChatInput`'s cancel/timer/send row. It's a `Pressable` covering the screen — tapping anywhere saves the recording (same `handleStopRecording` as before), a small corner button cancels — over a blurred (`expo-blur` `BlurView`) backdrop. This is **onboarding-only** — `ChatInput` keeps its compact row, since chat's screen real estate is already busy with message history.

**The overlay's centerpiece is a single glowing `VoiceOrb`, styled after voice-assistant "listening" screens (ChatGPT voice mode, Siri) rather than a scattered field of floating shapes** — an earlier version used several independently-drifting accent-colored circles, but a single central orb reads much more clearly as "the thing that's listening to you" the same way those reference UIs do, and gives the tap-anywhere-to-save gesture one obvious focal point instead of competing shapes.

Built from two `react-native-svg` `RadialGradient` layers: a big, very soft `halo` bleeding outward (standing in for the ambient glow a real emissive material would cast), and a smaller `core` circle with an off-center highlight (top-left-ish gradient stop), reading as a lit sphere rather than a flat wash. Both breathe/wobble on independent Reanimated cycles (macro `scale` on the core, non-uniform `scaleX`/`scaleY` for a slightly liquid feel, a separate cycle on the halo) so the combination reads as one organic, never-quite-repeating morph instead of a single mechanical pulse. Colored from this app's own `accent`→`accentWarm` tokens, not a copied ChatGPT blue.

**A real per-pixel-lit `@shopify/react-native-skia` shader version of the core sphere was tried and reverted.** A `RuntimeEffect`/SkSL fragment shader treated the disc as a hemisphere impostor (`z = sqrt(1 - x² - y²)`) with diffuse+specular lighting — genuinely more "volumetric" than a flat gradient. It was pulled for two reasons: (1) it **crashed the app on a plain Expo Go client** — Skia is a native module that isn't bundled in vanilla Expo Go the way Reanimated/SVG/BlurView are, so the app broke the moment `OnboardingScreen` tried to mount the shader's `Canvas`, and (2) it was already rejected on looks ("не то визуально") before the crash was even reported. Reverted to plain `react-native-svg` — every other themed surface in this app already depends on it, and it's known to work without a native rebuild. If a real 3D sphere gets revisited, it needs an actual dev-client build (`npx expo run:ios`/`run:android`), not just `expo start` — worth deciding that trade-off deliberately up front next time, rather than discovering it as a crash.

This full-screen takeover fixed a real layout bug, not just a stylistic one: the old locked row lived inside `inputWrap`, an unstyled (no `minHeight`) wrapper, and was positioned `absolute` so it wouldn't add to the row's height. With the normal (in-flow) row unmounted during the crossfade, `inputWrap` had nothing left in normal flow to size it, collapsed to 0 height, and the absolutely-positioned locked row rendered overlapping whatever came after it in the ScrollView instead of occupying its own space — this is what "верстка поехала" during onboarding recording. Since the locked UI is now a `RecordingOverlay` rendered as a sibling outside the ScrollView entirely (not inside `inputWrap`), that whole failure mode is gone — the input row only ever renders its own normal contents now, so it always sizes itself normally.

**Both the "Сохранить" and "Пропустить"/"Готово"/"Начать общение" buttons are hidden (not disabled) in `OnboardingScreen` while `isRecordingActive`.** A visible-but-disabled button was misleading mid-recording, and if a previous answer was already typed on this step, neither button was actually disabled by state — tapping either would submit/skip using that stale text and call `goNext()`, which resets the recorder and silently kills the in-progress recording.

**ChatScreen blocks its header swipe-to-navigate (and the Settings/Profile icon buttons) while a recording is active**, so you can't swipe or tap away from Chat mid-recording and orphan it. Recorder state lives inside `ChatInput`, not `ChatScreen` — `ChatInput` takes an `onRecordingActiveChange` callback (fired from a `useEffect` on `isRecording`) that `ChatScreen` uses to mirror the flag into its own state, mirrored into a ref (same pattern as `OnboardingScreen`'s `isRecordingActiveRef`) so the memoized `headerPan` `PanResponder` reads the current value without needing to be recreated on every change.

Slide up > 55 px while holding to lock recording:
- Normal: hold to record, release to send
- Locked: recording continues hands-free; cancel (✕) or send (↑) buttons appear in `ChatInput` (or, in Onboarding, the full-screen `RecordingOverlay`)

Audio is recorded as **WAV** (16 kHz, mono, LINEAR_PCM on iOS). Never use m4a — vsegpt rejects it.

`useAudioRecorder` states: `idle | recording | locked | done`

### Onboarding — Merged Text/Voice Input

`OnboardingScreen` used to have a separate "Текст"/"Голос" mode-toggle per step, with voice recording going straight through `onboardingApi.voiceStep` (transcribe + save server-side in one shot, frontend never sees the text). Both are gone:

- **One input, not two modes.** The `TextInput` is always present; `VoiceButton` sits inline beside it (`inputRow` style) rather than behind a mode switch. Recording (hold, slide up to lock — same `VoiceButton` gesture as `ChatInput`) transcribes into that same field via `/voice/transcribe` (the same endpoint `ChatInput` uses) instead of saving directly — the user sees and can edit the transcription before pressing "Сохранить", rather than trusting a raw voice-to-text pass straight into their profile. `isTranscribing` disables the field and shows a spinner in the `VoiceButton`'s slot while the request is in flight.
- `onboardingApi.voiceStep` (and the backend's `/onboarding/voice-step` direct-save flow) is no longer called from the frontend — removed as dead code from `onboardingApi`, though the backend route itself was left alone.
- **Swipe between steps**: same whole-screen `PanResponder` pattern as Chat/Settings (capture phase, axis-dominance, `TouchRipple` feedback), gated off while `isRecordingActive` (recording isn't step-scoped, so switching questions mid-recording would be confusing). It only moves the local `step` pointer — same as the existing progress-dot navigation — nothing is saved by swiping, so answers typed on other steps are preserved in the `answers` state either way.
- **`bounces={false}` / `overScrollMode="never"`** on the ScrollView: onboarding's content is short and vertically centered (`justifyContent: 'center'`), so there was nothing to actually scroll — every up/down drag just triggered the elastic rubber-band overscroll effect, which visibly "stretched" every bordered box on screen. Disabling bounce removes that distortion since there's no legitimate scroll content for it to apply to anyway.

### Password Visibility Toggle

`Input` (`src/shared/components/Input.tsx`) takes an optional `rightElement` prop — an absolutely-positioned overlay on the input's right edge (`inputWithRightElement` adds the matching `paddingRight` so typed text doesn't run under it). `LoginScreen`/`RegisterScreen` use it for a show/hide password `IconButton` (`eye-outline` / `eye-off-outline`), toggling `secureTextEntry`. Generic prop, not password-specific, in case another input ever needs a trailing icon.

### Communication Style Picker

Both `OnboardingScreen` (step 5) and `SettingsScreen` show a horizontal/vertical list of 5 style cards. Tapping a card immediately updates local state AND fires the server mutation. The server `step` field must be `"companion_preferences"` in the PATCH body.

`SettingsScreen`'s `StyleCard` grows the selected card by 15% (`STYLE_GROWTH`), the same "selected item grows" language as the chat-background `PresetSwatch` (`SELECTED_GROWTH`, 50%) — but since these are full-width rows in a vertical column rather than same-width boxes in a row, there's no spare width for the selected one to expand into; the "size" that grows is the card's own `padding` (taller/roomier), animated as a direct shared-value style (not `layout={LinearTransition}`, same reasoning as the preset swatch).

Cards show only the label by default; each style's 3-4 short bullet points (`STYLE_OPTIONS[].points`) reveal smoothly and only for the selected card, via the standard RN "auto-height" pattern — the bullets are always mounted (so `onLayout` can measure their true natural height once), and a wrapper `View` with `overflow: hidden` animates its own `height`/`opacity` between `0` and that measured value. A fixed height wasn't an option: bullet text wraps differently across device widths, so only a measured height avoids either clipping text or leaving dead space.

The reveal leads with a small `EonLogo` tinted via `useStyleAccent(id)` (`theme/styleAccent.ts`) plus a "Цвет Eon в чате" caption, and the bullet dots reuse that same color — teaching the connection between the logo tint in chat and the selected communication style right where the style is picked, rather than leaving the user to notice the shift on their own. The card's own selected-state border/background stay the plain app-wide `colors.accent` — that signals "you picked this," a separate concern from "this is this style's chat color."

### Feature-Sliced Design

```
features/<name>/
├── screens/      # Screen components
├── components/   # Feature-local UI
├── hooks/        # Feature-local hooks
└── api/          # API calls for this feature
```

Cross-feature shared code lives in `shared/` (api client, auth store, theme, utils).

### API Client

`src/shared/api/client.ts` — axios instance. Base URL from `EXPO_PUBLIC_API_URL` env var.

For device testing, set `EXPO_PUBLIC_API_URL=http://<your-machine-ip>:8000` in `eon-mobile/.env`. Localhost does not work from physical devices.

---

## Expo SDK Constraints

**Always use `npx expo install <package>`** — do not manually specify versions. Expo manages a compatibility matrix; manual versions frequently break.

Current pinned versions (Expo SDK 54 / RN 0.81.5 / React 19.1.0):
- `expo-status-bar@~3.0.9` — **must be 3.x**. Version 2.0.1 renders an invisible native overlay that blocks all touch events in the New Architecture.
- `react-native-gesture-handler@~2.28.0` — 3.x is incompatible with SDK 54
- `expo-av@~16.0.8`
- `expo-secure-store@~15.0.8`
- `react-native-reanimated@~4.1.1` + `react-native-worklets@0.5.1` — v4 requires New Architecture (default-on for SDK 54) and split the Babel transform into `react-native-worklets/plugin`, which must be the **last** entry in `babel.config.js`'s `plugins` array.
- `expo-font@~14.0.12` + `@expo-google-fonts/onest` — app font is Onest (weights 300/400/500/600/700), loaded via `useFonts()` in `src/core/index.tsx` before anything renders (same gate pattern as `RootNavigator`'s hydration guard).
- `react-native-svg` — used for `GlassRim`'s contour stroke (see Liquid Glass notes above) and both layers of `RecordingOverlay`'s orb (see Voice Recording notes below).
- **Avoid `@shopify/react-native-skia`** unless a dev-client build (`npx expo run:ios`/`run:android`) is already part of the plan — it's a native module not bundled in plain Expo Go, and was tried for `RecordingOverlay`'s orb and reverted after it crashed the app on launch for exactly that reason (see Voice Recording notes below). Every other native dependency in this list works via plain `npx expo install` + `expo start`; Skia is the one exception.

After changing packages, always restart with `npx expo start --clear`.

---

## Running Services

```bash
# Backend — first time
docker compose up -d

# Backend — rebuild after Python code changes
docker compose up -d --build api

# Backend logs
docker logs -f eon-api

# Frontend
cd eon-mobile && npx expo start --clear
```

---

### Chat Screen — Custom Header

`ChatScreen` uses `headerShown: false` and renders its own fully-JS header. This was necessary because `headerBackground` on native stack is rendered natively on iOS — JS PanResponder doesn't reach it.

Custom header structure:
```
<View navHeader {...headerPan.panHandlers}>   ← swipeable, includes paddingTop: insets.top
  <Pressable>⚙</Pressable>                   ← navigates to Settings
  <Text letterSpacing=5 fontWeight=300>EON</Text>
  <Pressable><Ionicons person-outline /></Pressable>  ← navigates to Profile
</View>
<KeyboardAvoidingView keyboardVerticalOffset={0}>
  <View statusBar {...headerPan.panHandlers}>  ← also swipeable
  <FlatList inverted />
  <View paddingBottom={insets.bottom}>
    <ChatInput />
  </View>
</KeyboardAvoidingView>
```

Swipe gestures (PanResponder on both header rows):
- **left→right** (dx > 50): `navigation.navigate('Settings')`
- **right→left** (dx < -50): `navigation.navigate('Profile')`

**`ProfileScreen`'s swipe-back is bubble-phase only** (`onMoveShouldSetPanResponder`, no `onMoveShouldSetPanResponderCapture`) — the one exception to the capture-phase pattern used everywhere else. Profile has a nested horizontal `FlatList` (the app-features carousel in `AboutSection`) that also wants horizontal drags; capture phase intercepts a drag *before* any child gets a look at it, which permanently wins over the carousel no matter what. Three earlier attempts tried to *guess* "is this touch on the carousel" from scroll position (a flat scrollY cutoff, cross-component `.measure()`, a height-based band) — all fragile, none actually looked at where the touch was. Bubble phase lets RN's normal responder negotiation give the carousel's own native scroll first refusal on a drag that starts on it, falling back to swipe-back everywhere else — no position math needed.

### Settings — Side Screen

Settings is a full navigation screen (`src/features/chat/screens/SettingsScreen.tsx`), not a modal. Registered in AppNavigator with `animation: 'slide_from_left'` — slides in from the left to mirror the swipe direction.

**Important**: do NOT add `gestureDirection: 'horizontal-inverted'` — it crashes on the current native stack version.

### Settings/Profile shared section pattern

`SettingsScreen` and `ProfileScreen` (`src/features/profile/screens/ProfileScreen.tsx`) both use the same custom `GlassPanel` header (`chevron-back` `IconButton` + centered `typography.h2` title + equal-width spacer view, `headerShown: false` set via `useLayoutEffect`) instead of the native-stack default — `ProfileScreen` used to be the one screen still on the plain native header, fixed by bringing it in line with the other two.

Content is grouped into labeled sections (`sectionLabel`: `typography.bodySmall`, uppercase, `letterSpacing: 1`), separated by a thin top-border divider (`sectionDivider`: `marginTop: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1`) on every section after the first — not bare whitespace, and not every piece of content boxed in its own `GlassCard`.

`ProfileScreen`'s login credential (phone/email) sits as its own quiet flat row (`accountRow`) above the profile-data `GlassCard`, under the shared "Профиль" heading — not inside that card. It was briefly merged in as the credential's own first `ProfileRow`, but a login detail isn't one of the "facts about you" (name, city, values, ...) that card holds, and reads better kept visually distinct rather than folded into that table. `ProfileRow` itself no longer shows `communication_style` — that's fully controlled from `SettingsScreen` already, so a second read-only copy of it here was pure duplication, not a fact worth a table row.

`ProfileRow` is icon-led, not a two-column table: a small `Ionicons` glyph + uppercase caption above, the value below — was originally a fixed-110px-label-then-value row, which read as dry and squeezed longer multiline values (close_people, values, coping_mechanisms, ...) against that narrow label column.

### ChatInput — Floating Rounded Bar

`ChatInput` renders as a floating pill with:
- `borderRadius: radius.lg` (28px) on the outer container
- `marginHorizontal: spacing.md` — doesn't stretch edge-to-edge
- Shadow instead of a top border line
- No border on the inner TextInput — just plain text on the bar background
- Bottom safe area handled by the parent: `<View paddingBottom={insets.bottom}><ChatInput /></View>`

### Scroll-to-Bottom Button

`ChatScreen` tracks `contentOffset.y > 120` on the inverted FlatList. When the user scrolls up (toward older messages), an animated circle button with `chevron-down` fades in. Pressing it calls `scrollToOffset({ offset: 0, animated: true })` — in an inverted list, offset 0 is the newest message (visual bottom).

---

## Known Issues / TODOs

1. **No tests** — MVP only, no test suite yet.
2. **MODE=test** — switch to `MODE=production` in `.env` before real user launch; also consider upgrading model from `gpt-4.1-mini`.
3. **Light theme user bubble** — in light mode `userBubble: '#7B6EF6'` (purple) with dark text is readable but not ideal. Consider adding per-theme text colour tokens (`userBubbleText`) if the palette needs refinement.
4. **AppNavigator header re-render on theme change** — `screenOptions` re-evaluates on each render because `useColors()` is called in the navigator component. This is correct behaviour but causes a brief header repaint on theme switch.
5. ~~`POST /voice/synthesize` takes `text: str` as a bare param~~ — **fixed**, now a `SynthesizeRequest` JSON body (see TTS notes above), done as part of wiring up Conversation Mode.
6. **Memory embedding vectors are stored unencrypted** — `memory_embeddings.embedding` (`src/infrastructure/db/models.py`) holds the raw `pgvector` vector of each daily/weekly summary's *plaintext* content, while the summary text itself (`daily_summaries.summary` / `weekly_summaries.summary`) is encrypted at rest. This was never a deliberate call — a DB compromise can't read the summary text, but could still infer its semantic content from the vector (or from having any other summary's plaintext to compare against). Worth either accepting explicitly or addressing.
7. ~~No ANN index on `memory_embeddings.embedding`~~ — **fixed** (migration `0006_memory_embedding_hnsw_index.py`). Turned out `0001_initial.py` already added one (`ivfflat`, missed on first read of this codebase) — but built against an empty table at migration time, which for `ivfflat` means its `lists`-based clustering was trained on 0 rows and would stay meaningless until someone manually `REINDEX`ed it once real data existed, which nothing in this codebase does. Replaced with `hnsw`, which has no such training step — it builds incrementally as rows are inserted, so it stays useful without a maintenance job. Daily/weekly summaries (and their embeddings) are never pruned (see `generate_weekly_summary.py`), so a long-lived companion's row count — and thus how much this index actually matters — only grows over time.
