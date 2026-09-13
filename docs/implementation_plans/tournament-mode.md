# План реализации: турнирный режим

Пошаговый план кода. Продуктовые правила — [`docs/box_of_thoughts/tournament-mode.md`](../box_of_thoughts/tournament-mode.md). Поля, статусы, маршруты — [`docs/box_of_thoughts/tournament-data-and-screens.md`](../box_of_thoughts/tournament-data-and-screens.md).

Каждый этап заканчивается рабочим куском в UI (не «только схема»). Следующий не начинать, пока предыдущий не проводится в зале на круговой / своём пресете.

Интерфейс по-прежнему **английский**. Канон в `docs/general/` не трогаем, пока первый вертикальный срез (этап 3) не живёт.

## Принципы

- Клубные `matches`, `/history`, `/stats` не принимают турнирные бои.
- Живой бой остаётся на устройстве; в сеть уходит только Save / оверрайд.
- Турнирный Save в v1 **без outbox**: нет сети — ошибка, слот открыт.
- Схема: миграция + зеркало в `supabase/final_schema.sql`; типы в `src/types/database.ts` руками (генератора в репо нет).
- Логику сеток держать в чистых функциях `src/lib/tournament/*`, не в JSX: пары, отдых, места, плей-офф-дерево, швейцарка.
- RLS как у ростера: `is_club_member(club_id)`. На турнирных таблицах нужны SELECT / INSERT / **UPDATE** / **DELETE**.
- Не делать в этих этапах: несколько дорожек, роли, публичная сетка, команды, федеративные допуски, outbox, правку состава слота (кроме царя горы).

## Этап 1. Схема, список, навигация

**Цель.** Член клуба открывает `/tournaments`, видит свои заготовки и может создать / удалить турнир. Сетка, чек-ин и табло ещё не существуют: карточка **не** ведёт на `/:id`. Этап 2 начнёт с этого маршрута на уже существующих рядах.

**Зачем сразу три таблицы.** UI трогает только `tournaments`, но enums и дети нужны одним миграционным куском: иначе этап 3 снова ломает `final_schema.sql`. `tournament_participants` и `tournament_bouts` в этом этапе пустые; клиент в них не пишет.

### 1.1 Postgres

Файл `supabase/migrations/YYYYMMDDHHMMSS_tournaments.sql` (delta) **и** то же в `supabase/final_schema.sql`. Старые миграции не переписывать.

**Enums** (или `text + check`, как `matches.blue_result` — лучше enum, значения стабильные):

| тип | значения |
|---|---|
| `tournament_status` | `setup`, `live`, `done` |
| `tournament_format` | `round_robin`, `playoff`, `groups_playoff`, `swiss`, `king_of_hill` |
| `tournament_points_scheme` | `half`, `binary`, `football` |
| `tournament_bout_stage` | `rr`, `group`, `swiss`, `playoff`, `koth` |
| `bout_result` | можно не плодить: оставить `text` + check `win/lose/draw`, как в `matches` |

**`tournaments`**

- `id uuid pk default gen_random_uuid()`
- `club_id uuid not null → clubs(id) on delete cascade`
- `name text not null`, check `char_length(trim(name)) > 0`
- `status tournament_status not null default 'setup'`
- `format tournament_format null`
- `points_scheme tournament_points_scheme null`
- `time_limit_sec int not null`, те же границы что устройство: `>= 60`, `<= 300`
- `points_limit int not null`, `>= 5`, `<= 20`
- `group_count int null`, `advancers_per_group int null`
- `swiss_rounds int null`
- `koth_exit_limit int not null default 3`, `>= 1`
- `created_at` / `updated_at` + trigger `set_updated_at`
- `live_at timestamptz null`, `finished_at timestamptz null`

Индекс: `(club_id, created_at desc)`.

Позже (не обязательно constrаint в этапе 1): `points_scheme` имеет смысл только для rr/groups/swiss — можно не ковать в SQL, клиент не даст `live` без схемы.

**`tournament_participants`**

- pk `(tournament_id, fencer_id)`
- `tournament_id → tournaments(id) on delete cascade`
- `fencer_id → fencers(id)` **без** `on delete cascade` (как matches: архив не дырявит протокол)
- `club_id uuid not null → clubs(id) on delete cascade` — для RLS
- `group_no int null`
- check: фехтовальщик того же клуба (в insert policy, как у `matches`)

**`tournament_bouts`**

Поля как в [`tournament-data-and-screens.md`](../box_of_thoughts/tournament-data-and-screens.md). Важное отличие от `matches`: слот очереди ещё без счёта.

- Пока `finished_at is null`: `blue_score` / `red_score` / `*_result` / имена / лимиты боя — **null**, id бойцов могут быть null (плей-офф, швейцарка).
- Когда `finished_at is not null`: те же checks, что у `matches` (разные бойцы, результат согласован со счётом). Плей-офф + ничья запретить отдельным check: `not (stage = 'playoff' and blue_result = 'draw')`.
- `winner_next_id` / `loser_next_id` → `tournament_bouts(id)` , `on delete set null`.
- `koth_king_id → fencers(id)` null.
- `sort_order int not null`.
- Индекс `(tournament_id, sort_order)`, `(tournament_id, finished_at)`.

Клиентский `id` боя задаёт клиент (`gen_random_uuid` / `crypto.randomUUID`), как у `matches`.

**RLS** — все три таблицы `enable row level security`. Политики `to authenticated`, `using` / `with check`: `is_club_member(club_id)`.

- `tournaments`: SELECT, INSERT, UPDATE, DELETE.
- `tournament_participants`: SELECT, INSERT, DELETE (update почти не нужен; `group_no` можно UPDATE).
- `tournament_bouts`: SELECT, INSERT, UPDATE, DELETE (delete каскадом с турнира; прямой delete клиенту в v1 не обязателен, но каскад с родителя должен пройти — при `on delete cascade` RLS delete на детях срабатывает от имени того же пользователя, политики DELETE на детях нужны).

Insert участников/боёв: `club_id` совпадает с `tournaments.club_id` и с `fencers.club_id` (exists, как matches).

**Grants:** `authenticated` — select/insert/update/delete на трёх таблицах. `anon` — revoke all. Enum types — `grant usage`.

Anon по-прежнему не читает клубные таблицы.

### 1.2 Клиент: типы и API

- Дописать `src/types/database.ts` (Row / Insert / Update / Relationships / Enums).
- Доменный тип `Tournament` в `src/types/tournament.ts` (camelCase, как `Match`).
- `src/lib/tournaments.ts`:
  - `listTournaments(clubId)` — `order created_at desc`
  - `createTournament({ clubId, name, timeLimitSec, pointsLimit })` — `status: setup`, `koth_exit_limit: 3`, format/scheme null
  - `deleteTournament(id)`
  - маппер row → Tournament, сообщение об ошибке по образцу `fencerErrorMessage`
- `src/hooks/useTournaments.ts` — как `useFencers`, queryKey `['tournaments', clubId]`, без localStorage-кэша (турниры не нужны офлайн в v1).
- `newTournamentName()`: локальная дата в том же духе, что история (`d MMM yyyy`). Два турнира в один день — одинаковое дефолтное имя, уникальности имени нет.

Лимиты при create брать из `readSettings()` (устройство), не из Postgres. В таблицу они всё равно записываются: это стартовые значения турнира, этап 3 даст ползунки.

### 1.3 Маршрут и доступ

- `App.tsx`: `/tournaments` внутри `ClubRoute` (как `/fencers`).
- Quick bout / гость: редирект на `/` — уже делает `ClubRoute`.
- Нет Supabase: страница как History — текст «Connect Supabase to manage tournaments.», без запроса.
- Нет `clubId` / loading: не дёргать list (хук `enabled: configured && Boolean(clubId)`).

Маршрута `/tournaments/:id` **нет**. Карточка не кликабельна, только Delete.

### 1.4 Страница списка

Файл `src/pages/Tournaments.tsx`. Оболочка как Fencers/History: `min-h-screen`, `max-w-2xl`, назад на `/`, заголовок **Tournaments**, подзаголовок вроде «Club events. In progress and finished stay here.»

Состояния:

| состояние | UI |
|---|---|
| нет ключей | Connect Supabase… |
| loading | Loading tournaments… |
| ошибка | destructive, как history |
| пусто | No tournaments yet. Start one for this club. |
| есть | список карточек, новые сверху |

Карточка (`Card`):

- название
- статус текстом: `Setup` / `In progress` / `Finished` (не сырой enum)
- тип сетки, если `format` не null (на этапе 1 всегда пусто)
- дата `created_at` через `date-fns` `d MMM yyyy`
- кнопка Delete → `AlertDialog` («Delete {name}? This cannot be undone.» / Cancel / Delete)

Кнопка **New tournament** сверху списка: create + toast «Tournament created» / error toast. После успеха invalidate, новый ряд первый.

Удаление: confirm → delete → toast. CASCADE снимет пустых детей.

### 1.5 Навигация

Сейчас иконки разъехались: на табло Fencers/History/Stats, на Fencers/History только Stats. В этапе 1 завести `src/components/ClubNav.tsx` — ряд icon-кнопок:

`Fencers` | `Tournaments` | `History` | `Stats`

Иконка турниров: `Trophy` (lucide). Порядок: после людей, перед историей.

Вставить:

- табло `/` (рядом с шестерёнкой; Settings не входит в ClubNav)
- Fencers, History, Stats (заменить одинокий Stats)
- Settings — в карточке аккаунта добавить пункт Tournaments рядом с Fencers/History/Stats
- сама страница Tournaments — тот же ряд + назад на табло

Узкая ширина: как на табло, при необходимости иконки второй строкой (на клубных страницах сейчас одна строка с заголовком — не ломать заголовок: на узком экране ClubNav под заголовком, по аналогии с Index).

Гость на табло ClubNav не видит (как сейчас нет Fencers).

### 1.6 Проверка

1. Без env: `/tournaments` после логина нет, но иконка может вести на заглушку Connect Supabase.
2. Quick bout: `/tournaments` → `/`.
3. Войти: иконка Trophy на табло → пустой список → New → карточка Setup с сегодняшней датой.
4. Ещё раз New → две карточки, новая сверху.
5. Delete с отменой ничего не удаляет; с подтверждением ряд исчезает.
6. Reload — список тот же (Supabase).
7. `/history` и `/stats` пустые, если клубных боёв не было.
8. Другой аккаунт / другой клуб своих турниров не видит (RLS).
9. `npm run lint` и `npm run build`.

### 1.7 Файлы (ожидаемый набор)

```text
supabase/migrations/…_tournaments.sql
supabase/final_schema.sql          # зеркало
src/types/database.ts
src/types/tournament.ts
src/lib/tournaments.ts
src/hooks/useTournaments.ts
src/pages/Tournaments.tsx
src/components/ClubNav.tsx
src/App.tsx
src/pages/Index.tsx                # ClubNav
src/pages/Fencers.tsx
src/pages/History.tsx
src/pages/Stats.tsx
src/pages/Settings.tsx
```

`src/lib/tournament/*` (пары, места) **не** открывать.

**Готово, когда:** вошедший создаёт и удаляет заготовки; RLS режет чужой клуб; гость не входит; build/lint зелёные.

**Не в этапе:** `/tournaments/:id`, чек-ин, format/scheme в UI, жеребьёвка, табло, запись в `tournament_bouts` / `tournament_participants`.

## Этап 2. Setup: имя и чек-ин

**Цель.** Открыть `/tournaments/:id` в `setup`, переименовать, отметить кто сегодня фехтует.

- Страница турнира: шапка (имя, нельзя пустое), назад к списку.
- Чек-ин: активный ростер, toggle → insert/delete `tournament_participants`. Гостя нет в списке — ссылка на `/fencers`.
- После `live` чек-ин только для чтения (на этом этапе `live` ещё не ставим — заложить disable).
- Минимум двое для «дальше»; один / ноль — стоп без квот.

**Готово, когда:** состав сохраняется в Supabase, переживает перезагрузку, с списка открывается тот же набор.

**Не в этапе:** формат и жеребьёвка.

## Этап 3. Круговая целиком (первый вертикальный срез)

**Цель.** Провести клубный круговой турнир: формат → жеребьёвка → проведение → итоги.

Setup, продолжение:

- Выбор типа (пока в UI достаточно включить round-robin; остальные типы серые или скрыты).
- Схема баллов: ни одна не выбрана, без выбора «Start event» нельзя.
- Ползунки времени/уколов турнира (границы как в Settings).
- Жеребьёвка: полный граф пар, `sort_order` с отдыхом (`src/lib/tournament/roundRobin.ts`). Смена состава или схемы → слоты снести и перегенерировать.
- «Start event» → `status=live`. Назад к чек-ину нельзя.

Live:

- Табы Queue / Table / Bouts.
- Queue: плоский список несыгранных; Start → `/?t=<id>&b=<boutId>`.
- Табло: query `t`/`b`, подставить бойцов, лимиты **с турнира**, полоска с названием и назад. Save → UPDATE слота (`finished_at`, счёт, снимок имён, `*_result` из счёта), не `matches`. Нет сети — ошибка, не outbox.
- Table: места по баллам, зелёные набранные, красные пропущенные со знаком минуса; тай-брейк как в заметке.
- Bouts: сыгранные, как `/history`.
- «Finish event» → `done` в любой момент; места по сыгранному.

Done: только Table и Bouts.

**Готово, когда:** 4–6 человек чек-ин, круговая, очередь без двух боёв подряд у одного где возможно, Save не попадает в клубную историю, досрочное завершение показывает частичную таблицу.

**Не в этапе:** оверрайд, другие форматы.

## Этап 4. Оверрайд счёта

**Цель.** Из Bouts поправить уколы; статус сам; итоги пересчитались.

- Диалог: два счёта, предупреждение что standings / незаполненные слоты перепашутся.
- `*_result` с клиента по тем же правилам, что клубный Save.
- Круговая: только пересчёт мест (слотов впереди нет).
- Состав пары не меняем. В плей-офф (позже) равный счёт нельзя — заложить проверку на `stage=playoff`.
- Работает и в `live`, и в `done`.

**Готово, когда:** смена 5:3 на 3:5 меняет победителя и порядок таблицы; клубный `/history` молчит.

## Этап 5. Плей-офф

**Цель.** Чистый плей-офф на `n ∈ {2,4,8,16,32}`.

- Генерация дерева + бронза при `n≥4`; `winner_next_id` / `loser_next_id`; поздние слоты без id.
- UI Queue и Table — одни блоки снизу вверх (final внизу). Двойная строка: имя, счёт, метка прошёл/вылетел. Следующий раунд наполняется после Save.
- На чек-ине не степень двойки или `n>32` — тип недоступен.
- Схема баллов не нужна. Save draw и оверрайд в ничью — блок + попап; +/− после нуля таймера как в клубе.
- Критерий отдыха не применяется.

**Готово, когда:** на 8 людях проходятся 1/4 → 1/2 → бронза → финал, места 1–4 читаются из меток.

## Этап 6. Группы + плей-офф

**Цель.** Именованный пресет: круговые блоки + то же дерево.

- Параметры: `group_count` 2/4/8, `advancers_per_group`, `G×q = 2^k`. Неровные размеры групп ок.
- Жеребьёвка: пары в группах (отдых, в т.ч. чередование групп в `sort_order`) + дерево с placeholder `g{n}p{k}`.
- Table: круговая таблица на группу + сетка.
- Резолв placeholder, когда **эта** группа вся сыграна. Ничья на границе после уколов — модалка «двое, выбрать одного»; несколько групп — очередь окон.
- Старт плей-оффного слота только при двух id.
- Оверрайд группового боя: пересчитать места; **несыгранные** плей-офф слоты переименовать; сыгранные плей-офф не удалять.

**Готово, когда:** 12 человек, 4 группы, 2 выходят, кросс `1A–2B` / …, модалка на ничьей, плей-офф заполняется по мере закрытия групп.

## Этап 7. Швейцарка

**Цель.** Туры по результатам, места как круговая.

- `swiss_rounds = max(1, ceil(log2(n)))` в момент жеребьёвки, в UI не редактируем.
- Жеребьёвка: только тур 1. Нет пары — зачёт в подсчёте мест (баллы победы, уколов нет), строки боя нет.
- Тур `k+1` вставляется, когда все бои тура `k` с `finished_at`. Пары: близкий балл, без повтора если возможно, иначе повтор явно. `sort_order` с отдыхом на стыке туров.
- Queue — блоки туров. Table — как круговая.
- Схема баллов обязательна. Оверрайд тура 1: места пересчитать; несозданные туры пересобрать; уже сыгранный тур 2 не стирать.

**Готово, когда:** нечётное `n` даёт один зачёт за тур; второй тур появляется только после полного первого; таблица живая после каждого Save.

## Этап 8. Царь горы

**Цель.** Без слотов; селекты на табло; два списка.

- Жеребьёвка не создаёт bouts. `koth_exit_limit` дефолт 3, правится в setup.
- Queue заменён списком оставшихся выходов (больше — выше). Считаем по сохранениям (входящий −1, царь не тратит), **не энфорсим**.
- Ссылка на `/?t=<id>` без `b`. Селекты живые. Save = INSERT `stage=koth`.
- Ничья = победа царя. Царь: победитель прошлого koth-боя, если он на табло; иначе синий.
- Table: победы и лучшая серия, сортировка по победам; три титула можно подсветить.
- «Finish» в любой момент.

**Готово, когда:** день из десятка боёв с ручной сменой претендента, колонка выходов меняется, с нулём всё ещё можно выйти, клубная история пустая.

## После v1 (не в этих этапах)

- Outbox турнирных боёв.
- Несколько дорожек, запирание селектов на слоте, пережеребьёвка после `live`.
- Победа без боя, снятие с сетки, удаление последующих боёв при оверрайде.
- Формула туров швейцарки, если `ceil(log2 n)` окажется не той.
- Перенос канона в `docs/general/overview.md`.

## Зависимости между этапами

```text
1 схема + список
    → 2 имя и чек-ин
        → 3 круговая (первый полный турнир)
            → 4 оверрайд
            → 5 плей-офф ─┐
            → 7 швейцарка  │  (после 3, параллелить можно)
            → 8 царь горы ─┤
                            └→ 6 группы+плей-офф (после 3 и 5)
```

Этап 6 опирается на круговые блоки (3) и дерево (5). Оверрайд (4) лучше вставить до 5–8, чтобы каждый пресет сразу жил с правкой счёта; если нет — минимум круговая с оверрайдом, проверка `stage=playoff` в этапе 5.

## Где что появится в коде

| Слой | Куда |
|---|---|
| SQL | `supabase/migrations/…_tournaments.sql`, `supabase/final_schema.sql` |
| Типы | `src/types/database.ts`, `src/types/tournament.ts` |
| API | `src/lib/tournaments.ts`, `src/lib/tournamentBouts.ts` |
| Сетки | `src/lib/tournament/roundRobin.ts`, `playoff.ts`, `groups.ts`, `swiss.ts`, `kingOfHill.ts`, `standings.ts`, `restOrder.ts` |
| Хуки | `src/hooks/useTournaments.ts`, `useTournament.ts` |
| Страницы | `src/pages/Tournaments.tsx`, `src/pages/Tournament.tsx` |
| Табло | `src/pages/Index.tsx` + узкий `TournamentScoreboardBar` |
| Навигация | общий `ClubNav` |

Ручная проверка каждого этапа: чек-ин → проведение → Save → (оверрайд) → Finish → список; клубные `/history` и `/stats` без этих боёв; узкая ширина навигации.
