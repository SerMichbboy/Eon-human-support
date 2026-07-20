"""Prompt templates and extraction schemas owned by VsegptClient itself.

Kept infra-side (not application/) because these are implementation details of
*how* the client talks to the model (wrapper phrasing, JSON-shape contracts),
not product decisions about *what* Eon says to the user. Compare with
src/application/chat/prompts.py and src/application/memory/prompts.py, which
own the actual product-facing system prompts and are safe to edit without
touching this file.
"""

# One schema per onboarding step, using the exact field names the profile merge logic expects
# (src/application/onboarding/save_profile_step.py). Keeping this step-scoped instead of asking
# the model to freely map facts across all categories avoids ambiguous guesses like "location"
# under the wrong category, or invented field names (e.g. "name" instead of "preferred_name")
# that silently fail to merge.
EXTRACTION_SCHEMAS: dict[str, str] = {
    "intro": (
        '{"basic_info": {"preferred_name": string|null, "age": integer|null, "location": string|null}}'
    ),
    "life_context": (
        '{"life_context": {"occupation": string|null, "family_status": string|null, '
        '"close_people": string[], "values": string[]}}'
    ),
    "positive_moments": (
        '{"positive_moments": {"joyful_memories": string[], "sources_of_energy": string[], "dreams": string[]}}'
    ),
    "struggles": (
        '{"struggles": {"coping_mechanisms": string[], "difficult_periods": string[], "anxiety_topics": string[]}}'
    ),
    "companion_preferences": (
        '{"companion_preferences": {"tone": "warm"|"neutral"|"direct", '
        '"directiveness": "listener"|"advisor", '
        '"communication_style": "listener"|"friend"|"mentor"|"mirror"|"debater"}}'
    ),
    # Nightly re-read of one day's summary (src/infrastructure/tasks/update_profile.py).
    # key_events is what powers "Eon remembers this months later" — surfaced on every
    # single message via BuildContext._format_profile, not just when semantic search
    # happens to hit it. Deliberately conservative: most days should yield nothing, or
    # key_events fills up with routine chit-chat and drowns out what's actually memorable.
    "daily_review": (
        "Only include a key_events entry for something significant enough that a close "
        "friend would still remember it months or years later — a real loss, an "
        "achievement, a relationship change, a big life shift. An ordinary day should "
        "produce an empty key_events list. Do not manufacture significance.\n"
        '{"key_events": [{"description": string, "emotional_weight": number between 0 and 1, '
        '"approximate_date": string|null, "type": "joy"|"loss"|"change"}], '
        '"life_context": {"occupation": string|null, "family_status": string|null, '
        '"close_people": string[], "values": string[]}|null}'
    ),
}

STUB_CHAT_RESPONSES: list[str] = [
    "Я здесь. Слушаю тебя внимательно.",
    "Расскажи мне больше — я никуда не тороплюсь.",
    "Понимаю. Это важно.",
]


def build_extract_facts_prompt(transcript: str, schema: str) -> str:
    return (
        f'The user (speaking Russian) said: "{transcript}"\n\n'
        f"Extract only facts explicitly stated above into exactly this JSON shape:\n{schema}\n\n"
        "Use exactly these field names. If a field wasn't mentioned, use null (or an empty "
        "array for list fields) — never invent, guess, or infer values that weren't said. "
        "Return only the JSON object, no explanation."
    )


def build_extract_reminder_prompt(text: str, client_time_iso: str) -> str:
    return (
        f"Текущее время пользователя: {client_time_iso}\n\n"
        f'Сообщение пользователя: "{text}"\n\n'
        "Просит ли пользователь напомнить о чём-то в определённый момент времени? Определи due_at по "
        "этим правилам:\n"
        "- Время указано явно (дата, день недели, «через X минут/часов», «в HH:MM») — используй его точно.\n"
        "- Сказано расплывчато вроде «попозже», «через какое-то время», «чуть позже», без уточнения — "
        "считай это как 3 часа от текущего момента.\n"
        "- Сказано «на следующей неделе» без точного дня — тот же день недели и то же время, что сейчас, "
        "но через 7 дней.\n"
        'Если да и время определено — верни JSON {"message": string — короткая формулировка того, о чём '
        "напомнить, от первого лица единственного числа (как будто сам пользователь себе напоминает), "
        '"due_at": string — точные дата и время в формате ISO 8601 с тем же смещением часового пояса, что '
        'в текущем времени выше}.\n'
        'Если это просьба напомнить, но вообще никакого указания на время нет — верни {"unclear": true}.\n'
        "Если это вообще не просьба напомнить о чём-то в конкретный момент (обычный разговор, просьба "
        'что-то не забыть без привязки ко времени и т.п.) — верни {}.\n'
        "Возвращай только JSON, без пояснений."
    )
