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

- `_MAX_RECENT_MESSAGES = 20` in production, `_MAX_RECENT_MESSAGES_TEST = 4` in test mode
- Profile fields (name, occupation, values, etc.) are injected into the system prompt
- `_style_instructions()` returns a behaviour string based on `communication_style` field
- In test mode the system prompt is minimal: `"Ты — Eon, компаньон для {name}. Отвечай по-русски, коротко и по делу."`

### Encryption

Each user gets an individual AES-256-GCM key derived from `MASTER_ENCRYPTION_KEY`. All stored messages are encrypted at rest. See `src/infrastructure/crypto/aes.py`.

### AI Provider — vsegpt.ru

The project uses **vsegpt.ru** as an OpenAI-compatible proxy. It works from Russia and provides access to both Claude models and Whisper STT.

`ClaudeClient` (`src/infrastructure/claude/client.py`) uses `AsyncOpenAI` (not the Anthropic SDK) because vsegpt only exposes an OpenAI-compatible endpoint:

```python
from openai import AsyncOpenAI

class ClaudeClient:
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

`GlassCard`/`GlassPanel` (`src/shared/components/Glass.tsx`) take a `level` prop (`MaterialLevel`) instead of a raw `intensity` number.

**Specular highlight (`GlassRim`, in `Glass.tsx`)**: real Liquid Glass's highlight is a *rim light tracing the shape's contour* — brightness depends on surface-normal angle vs. a light direction, brightest facing the light and fading around the perimeter (Apple's actual implementation is a GPU shader: displacement-map refraction + gyroscope-linked specular highlight; see WWDC25 session 219 and https://imadrahmoune.com/liquid-glass/ for the technical breakdown). We don't run shaders — `GlassRim` approximates the effect with `react-native-svg`: a rounded-rect **stroke** (not a filled interior gradient) using a top-to-bottom `LinearGradient` as the stroke paint, which naturally reads as "brightest at the top, fading around the sides" without needing an angular/conic gradient. Dark-theme only — white is invisible on light theme's near-white cards, and colored tints there read as a stain rather than light (tried violet and warm amber, both rejected). Animates via a slow opacity breathe, not positional movement — an earlier version translated a filled rectangle up/down for "floating," but sliding it away from the true edge opened a gap with nothing covering it, exposing the border/seam underneath; a fixed-geometry stroke has no equivalent safe direction to slide.

If a future pass wants the *real* thing (background refraction + gyroscope-reactive highlight), that's a `@shopify/react-native-skia` (SkSL shader) project — a much larger lift than tuning `GlassRim`, not attempted here.

### Settings Store

**`src/shared/store/settings.ts`** (Zustand + SecureStore):
- `presetId / chatBgColors` — chat background preset. Presets are 2-stop `expo-linear-gradient` gradients (`BgPreset.colors`), not flat color + repeating dot/line/cross pattern (that older `PatternOverlay` approach was removed for looking dated — a soft ambient gradient reads as more "Liquid Glass"). Each `BgPreset` also carries a `mode: 'dark' | 'light'` — `SettingsScreen`'s picker only shows presets matching the current theme (no light pastel gradient offered while in dark mode, or vice versa), and `toggleThemeExtreme()`/`hydrate()` both auto-snap `presetId` to the first preset of the new mode if the current one doesn't match (e.g. flipping theme while a dark preset is selected).
- `themeValue: number` — in practice always exactly `0` (full dark) or `1` (full light), toggled as a unit. It's a plain `number` rather than a boolean because `useColors()`/`useMaterial()` interpolate every color channel-by-channel between `darkColors`/`lightColors` (and `darkMaterial`/`lightMaterial`) via `mixColor()` (`theme/utils.ts`) at this value — a continuous-slider theme control was tried and reverted (the drag gesture was too fiddly to get right; see git history), but the interpolation machinery underneath was kept since it works fine for a clean 0/1 flip too and costs nothing extra.
- `toggleThemeExtreme()` — flips between the two extremes; persists to SecureStore as `theme_value`. Used by both the `SettingsScreen` switch and the auth screens' quick-access icon.
- `themeModeFromValue(v)` — derives the discrete `'dark' | 'light'` label needed by platform APIs that can't do a continuum (`BlurView`'s `tint` prop, sun/moon iconography): `v < 0.5 ? 'dark' : 'light'`.
- `hydrate()` — called on app start, restores preset + `theme_value`; migrates a pre-existing install's old binary `theme_mode` key to `0`/`1` if `theme_value` was never written.

Theme control is a plain iOS-style switch (`ThemeToggle` in `SettingsScreen.tsx`) — tap only, no drag. Its slide/color animation is local to the component (reanimated, UI-thread only) and doesn't touch the app-wide theme value until the tap completes, so it can't cause the re-render storm a continuous draggable slider did. `ThemeTransitionOverlay` (`src/shared/components/ThemeTransitionOverlay.tsx`, mounted once at the app root) cross-fades every flip: covers the screen with the outgoing theme's bg color, then fades it away to reveal the new one underneath.

### Voice Recording — Lock Gesture

`VoiceButton` uses `PanResponder`. Slide up > 55 px while holding to lock recording:
- Normal: hold to record, release to send
- Locked: recording continues hands-free; cancel (✕) or send (↑) buttons appear in `ChatInput`

Audio is recorded as **WAV** (16 kHz, mono, LINEAR_PCM on iOS). Never use m4a — vsegpt rejects it.

`useAudioRecorder` states: `idle | recording | locked | done`

### Communication Style Picker

Both `OnboardingScreen` (step 5) and `SettingsScreen` show a horizontal/vertical list of 5 style cards. Tapping a card immediately updates local state AND fires the server mutation. The server `step` field must be `"companion_preferences"` in the PATCH body.

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
- `react-native-svg` — used for `GlassRim`'s contour stroke (see Liquid Glass notes above); not used anywhere else yet.

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

### Settings — Side Screen

Settings is a full navigation screen (`src/features/chat/screens/SettingsScreen.tsx`), not a modal. Registered in AppNavigator with `animation: 'slide_from_left'` — slides in from the left to mirror the swipe direction.

**Important**: do NOT add `gestureDirection: 'horizontal-inverted'` — it crashes on the current native stack version.

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
