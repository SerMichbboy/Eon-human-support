# CLAUDE.md — Eon Project Guide

## Project Layout

```
Eon-human-support/
├── src/                  # Python backend (DDD)
├── eon-mobile/           # React Native frontend (Expo)
├── docker-compose.yml    # postgres + redis + api + worker
├── Dockerfile            # API image
├── Dockerfile.worker     # TaskIQ worker image
├── alembic.ini
└── .env                  # secrets, never commit
```

## Backend Patterns

### Dependency Injection — Dishka

HTTP handlers use `@inject` + `Annotated[Type, FromDishka()]`:

```python
@router.get("/")
@inject
async def handler(repo: Annotated[IRepo, FromDishka()], user_id: UUID = Depends(get_current_user_id)):
    ...
```

**WebSocket handlers cannot use `@inject`** — Dishka creates `Scope.SESSION` for WebSocket connections but repositories are `Scope.REQUEST`. Use manual container management instead:

```python
@router.websocket("/chat")
async def chat_ws(websocket: WebSocket):
    container = websocket.app.state.dishka_container
    async with container() as request_container:
        repo = await request_container.get(IRepo)
        ...
```

See `src/presentation/ws/chat.py` for the full pattern.

### Domain Structure

Each domain aggregate lives in `src/domain/<name>/`:
- `entity.py` — dataclass/pydantic entity
- `repository.py` — abstract interface (`IXxxRepository`)

Implementations are in `src/infrastructure/db/repositories/<name>.py`.

Use cases are in `src/application/<domain>/`. They only depend on domain interfaces, never on infrastructure directly.

### Memory Architecture

Messages are stored encrypted. After saving, a FastStream event triggers background processing:

1. **Raw messages**: stored for 7 days
2. **Daily summaries**: TaskIQ job runs nightly, compresses day → summary (days 8–30)
3. **Weekly summaries**: compresses week → summary (days 31–180)
4. **Semantic search**: pgvector embeddings via `IMemoryEmbeddingRepository`

`BuildContext` in `src/application/chat/build_context.py` assembles the full context window before each Claude call.

### Encryption

Each user gets an individual AES-256-GCM key derived from `MASTER_ENCRYPTION_KEY`. All stored messages are encrypted at rest. See `src/infrastructure/crypto/aes.py`.

### Claude Stub Mode

`ClaudeClient` (`src/infrastructure/claude/client.py`) checks if `ANTHROPIC_API_KEY` is `"placeholder"` or empty. If so, it returns rotating stub responses without hitting the API. Useful for local dev without a real key.

### passlib + bcrypt Compatibility

bcrypt 4.x breaks passlib's `CryptContext` initialization with a `ValueError`. Pin `bcrypt<4.0` in `requirements.txt`.

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

### KeyboardAvoidingView in Chat

Use `useHeaderHeight()` from `@react-navigation/elements` as the `keyboardVerticalOffset`. Do not hardcode a pixel value — header height varies by device and navigation config.

```tsx
const headerHeight = useHeaderHeight();
<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight}>
```

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

## Expo SDK Constraints

**Always use `npx expo install <package>`** — do not manually specify versions. Expo manages a compatibility matrix; manual versions frequently break.

Current pinned versions (Expo SDK 54 / RN 0.81.5 / React 19.1.0):
- `expo-status-bar@~3.0.9` — **must be 3.x**. Version 2.0.1 renders an invisible native overlay that blocks all touch events in the New Architecture.
- `react-native-gesture-handler@~2.28.0` — 3.x is incompatible with SDK 54
- `expo-av@~16.0.8`
- `expo-secure-store@~15.0.8`

After changing packages, always restart with `npx expo start --clear`.

## Running Services

```bash
# Backend (first time)
docker compose up -d

# Backend logs
docker logs -f eon-api

# Frontend
cd eon-mobile && npx expo start --clear
```

## Known Issues / TODOs

1. **STT broken in Russia** — OpenAI `/v1/audio/transcriptions` returns 403. Needs self-hosted Whisper or alternative provider. Voice input falls back to text input on the onboarding screen.
2. **Real Anthropic key** — currently using stub mode (`ANTHROPIC_API_KEY=placeholder`). Replace with real key in `.env` when available.
3. **No tests** — MVP only, no test suite yet.
