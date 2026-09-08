# Фехтовальщики, история боёв и статистика

Как устроены справочник людей, выбор перед стартом, запись результатов и агрегаты. Живой бой по-прежнему идёт только на устройстве.

Сайт — статический SPA (GitHub Pages, опционально Capacitor). Бэкенд приложения не пишем: Postgres, Auth и RLS даёт Supabase.

## Принципы

- Источник правды для людей и протоколов — Supabase.
- Идущий бой (счёт, таймер, пауза) не уходит в сеть.
- `localStorage` — кэш roster, настройки устройства и очередь неотправленных результатов, не основная база.
- В запись боя всегда кладём **и id, и имена**. Id нужен для статистики; имя — чтобы протокол читался после переименования или архива.
- Синий/красный — роль в конкретном бою. Статистика склеивается по `fencer_id`.
- В клиент попадает только anon key. `service_role` в Vite / GitHub Pages не кладём.

## Модель данных

Схема как в `supabase/final_schema.sql`. Ниже — смысл полей, не полный DDL.

### Клуб

```text
clubs
  id            uuid pk
  name          text not null          -- при создании: 'Fencing Club'
  created_at    timestamptz
  updated_at    timestamptz

club_members
  club_id       uuid                   -- → clubs.id
  user_id       uuid                   -- → auth.users.id
  role          owner | trainer | member
  created_at    timestamptz
  pk            (club_id, user_id)
```

Один клуб — несколько пользователей. В каждом клубе хотя бы один `owner`. Клиент роли не показывает и клуб не переключает: после входа берётся членство owner, иначе самое раннее.

### Фехтовальщик

```text
fencers
  id            uuid pk
  club_id       uuid not null          -- → clubs.id
  name          text not null
  archived_at   timestamptz null       -- soft-delete: история не дырявится
  created_at    timestamptz
  updated_at    timestamptz
```

Уникальность имени в клубе: `(club_id, lower(trim(name)))` среди неархивных. Пустые имена запрещены.

Удаление из UI = архив. На `matches` нет каскадного удаления бойцов. Политики DELETE нет.

### Бой

```text
matches
  id                 uuid pk           -- задаёт клиент (нужно outbox)
  club_id            uuid not null     -- → clubs.id

  blue_fencer_id     uuid not null
  red_fencer_id      uuid not null
  blue_name          text not null     -- снимок на момент боя
  red_name           text not null

  blue_score         int not null
  red_score          int not null
  blue_result        win | lose | draw
  red_result         win | lose | draw

  time_limit_sec     int not null
  points_limit       int not null
  remaining_sec      int not null

  started_at         timestamptz not null
  finished_at        timestamptz not null
  created_at         timestamptz
```

Ограничения: разные бойцы на сторонах; результат согласован со счётом (больше очков → win/lose, равный → draw/draw).

Полей `ended_by`, `winner_id`, `winner_name` нет. Исход — пара `blue_result` / `red_result` по счётчикам на момент Save.

Цвет нужен, чтобы воспроизвести бой. Для статистики запросы идут по id:

```sql
select *
from matches
where blue_fencer_id = $id or red_fencer_id = $id
order by finished_at desc;
```

Клиент считает агрегаты в `src/lib/fencerStats.ts`, отдельного SQL-view нет.

### Настройки клуба

Лимиты времени и очков **не** в Postgres. Файл `src/lib/settings.ts`, ключ `fencing-scorer:v1:settings`.

## Auth и RLS

Логин: email + пароль (Sign in / Create club account). Magic link нет. В UI по-прежнему один аккаунт; клуб создаётся внутри.

Регистрация (`handle_new_user` на `auth.users`) делает клуб `Fencing Club` и пишет пользователя как `owner`. Уже существовавшие аккаунты мигрированы так же: `clubs.id` совпадает с прежним `auth.users.id`. Если членства нет, клиент вызывает `ensure_own_club()`.

После сессии клиент читает `club_members` и подставляет этот `club_id` в ростер, историю, Save, кэш и outbox. Списки дополнительно фильтруются по `club_id`.

Политики: `is_club_member(club_id)`, не `club_id = auth.uid()`. Сейчас все роли клуба имеют одинаковый доступ к ростеру и записи боёв. `clubs` / `club_members` с клиента только SELECT (свои членства). Anon таблицы не читает и не пишет. `matches` только INSERT+SELECT, без UPDATE/DELETE.

Сессия в `localStorage` Supabase (remember).

Пока ключи настроены и сессии нет — экран логина. Обход без аккаунта: **Quick bout** (см. [overview](./overview.md)).

Без ключей в env логина нет: табло локальное, клубные страницы с текстом «Connect Supabase…».

## Офлайн

1. Живой бой — только RAM.
2. Save — `insert` в Supabase с заранее сгенерированным `id`.
3. Нет сети — payload в `fencing-scorer:v1:outbox:matches:{clubId}`, тост «Saved on this device…», кнопка «Saved».
4. При старте приложения и по событию `online` — flush. `23505` = уже записано, элемент очереди снимается.

Кэш активных фехтовальщиков: `fencing-scorer:v1:fencers:{clubId}`. Селекты могут открыться без сети; запись всё равно идёт через insert/outbox.

## UI

1. **Логин** — клубный аккаунт или Quick bout.
2. **`/fencers`** — список, добавление, переименование, архив / restore, переключатель архивных. Не смешивается с лимитами в Settings.
3. **Табло `/`** — два combobox (Anonymous или человек из ростера). Start: оба пустые **или** двое разных. Один выбранный — ошибка, таймер не стартует. После первого Start селекты lock. Подпись победы — имя.
4. **`/history`** — `finished_at` desc, имена и счёт, «X won» / «Draw», фильтр по человеку из сохранённых боёв.
5. **`/stats`** — по каждому, кто встречался в `matches`: число боёв, win/loss/draw, most bouts / wins / losses vs. Имя с ростера, если человек ещё там; иначе снимок из боя. Архивные помечены.
6. **Settings** — лимиты на устройстве; для вошедшего — ссылки на ростер/историю/статистику и Sign out.

Навигация с табло: иконки Users / History / Stats / Settings. У гостя вместо первых трёх — Sign in.

```text
roster → синий/красный или оба Anonymous → Start → бой локально
   → Save (только именной) → matches
   → /history и /stats по fencer_id
Reset → счёт и таймер сброшены, выбор сторон остаётся, без insert
```

## Инфра

- SQL: `supabase/final_schema.sql` (пустой проект) и `supabase/migrations/` (дельты). Правило: `.cursor/rules/supabase-schema.mdc`.
- Клиент: `@supabase/supabase-js`, `src/lib/supabase.ts`.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.example`, локально `.env.local`).
- GitHub Actions Pages прокидывает те же secrets в `npm run build`.

## Что уже сделано

Фундамент (схема, RLS, логин), клуб как сущность и членство, справочник с архивом, выбор на табло включая анонимный бой, запись по счётчикам, outbox, история, статистика, persist настроек, Quick bout.

## Не входит

- Realtime-табло на втором экране.
- Карточки, приоритет, периоды 3×3 по FIE.
- UI нескольких клубов, приглашений и разных прав ролей (в схеме `owner` / `trainer` / `member` уже есть).
- Редактирование уже сохранённого боя.
- Нативный Capacitor-проект в git.
