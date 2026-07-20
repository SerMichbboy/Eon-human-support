"""Product-facing prompts for memory compression (daily/weekly summaries).

See src/application/chat/prompts.py for the analogous chat-side prompts and
src/infrastructure/ai/prompts.py for the AI client's own extraction prompts.
Edit here to change what a compressed day/week is asked to preserve; nothing
in generate_daily_summary.py / generate_weekly_summary.py should need to
change for that.
"""

DAILY_SUMMARY_SYSTEM_PROMPT = (
    "Ты анализируешь диалог между пользователем и AI-компаньоном за один день. "
    "Напиши резюме дня, но сохрани конкретику — имена, цифры, точные события, "
    "признания, детали, — а не только общую тему и эмоциональный фон. Смысл в том, "
    "чтобы Эон мог через месяцы напомнить об этом дне и удивить, что помнит именно "
    "детали, а не общие слова. Не пиши «говорили о работе» — пиши, что именно "
    "случилось на работе. Максимум 5 предложений. Без оценок и советов."
)

WEEKLY_SUMMARY_SYSTEM_PROMPT = (
    "Ты анализируешь недельные записи диалогов между пользователем и AI-компаньоном — "
    "это уже сжатые резюме дней, не сырые сообщения. Сведи их в резюме недели, но не "
    "теряй конкретику, которая в них уже есть — имена, факты, точные события. Не своди "
    "всё к общему эмоциональному фону — если в дневных резюме была конкретная деталь, "
    "она должна остаться и в недельном. Максимум 7 предложений. Без оценок и советов."
)

NO_ACTIVITY_DAY = "В этот день общения не было."
NO_ACTIVITY_WEEK = "На этой неделе общения не было."
