# Фехтовальщики, история боёв и статистика

Как устроены справочник людей, выбор перед стартом, запись результатов и агрегаты. Живой бой по-прежнему идёт только на устройстве. Турнирные протоколы живут в `tournament_bouts`, не в `matches` — см. [турнирный режим](./tournament-mode.md).

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
  name          text not null          -- задаёт создатель клуба
  created_at    timestamptz
  updated_at    timestamptz

club_members
  club_id       uuid                   -- → clubs.id
  user_id       uuid                   -- → auth.users.id
  role          owner | trainer | member
  created_at    timestamptz
  pk            (club_id, user_id)
```

Один клуб — несколько пользователей. В каждом клубе хотя бы один `owner`. Клиент роли не показывает и клуб не переключает: после входа берётся членство owner, иначе самое раннее. Аккаунт без клуба видит табло и настройки, без ростера, истории и турниров.

### Профиль

```text
profiles
  user_id       uuid pk                -- → auth.users.id
  name          text not null
  public_id     text not null unique   -- только цифры, без фиксированной длины
  created_at    timestamptz
  updated_at    timestamptz
```

Имя — одна строка. Сохраняется даже если клуб не создают.

`public_id` выдаётся на сервере: существующим профилям по `created_at` с 1001, новым — `max + 1`. Клиент его не задаёт и не меняет. В Account поле ID только для чтения. На чек-ине турнира по этому номеру можно добавить бойца (`lookup_checkin_by_public_id`).

### Фехтовальщик

```text
fencers
  id            uuid pk
  club_id       uuid not null          -- → clubs.id
  user_id       uuid null              -- → auth.users.id
  role          owner | trainer | member | null  -- непусто, если есть user_id
  name          text not null
  archived_at   timestamptz null       -- soft-delete: история не дырявится
  created_at    timestamptz
  updated_at    timestamptz
```

Уникальность имени в клубе: `(club_id, lower(trim(name)))` среди неархивных. Пустые имена запрещены. `role` и `user_id` либо оба пустые, либо оба заданы. Непустой `user_id` уникален на всю таблицу (один профиль — один клуб, в том числе среди архива). Доступ в клуб: активная строка с `user_id` текущего пользователя (`is_club_member` / `is_club_owner`). `club_members` ещё пишется при создании клуба и при link/unlink, клиент его больше не читает.

Связать строку ростера с аккаунтом: `link_fencer_to_profile(fencer_id, public_id)` — ставит `user_id`, `role = member` и копирует имя из профиля (`fencing.fencer_link = 1`). Добавить нового человека по ID: `add_linked_fencer(public_id)` — вставляет строку в клуб вызывающего. Отвязать: `unlink_and_archive(fencer_id)` — `user_id` и `role` в null, архив, удаление из `club_members`. Последнего owner отвязать нельзя.

Имя связанной строки правит только владелец профиля (`save_own_profile`). Прямой UPDATE имени или архива на связанной строке отклоняется. В UI карандаш скрыт; свободную строку привязывают по ID; Archive для связанного человека идёт через unlink.

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

Логин: email + пароль (Sign in / Create account). Magic link нет.

Регистрация больше не создаёт клуб. После входа, если имени ещё нет, экран: имя (обязательно) и опции **Create club** (имя клуба) или **Skip**. Имя пишется в `profiles` через `save_own_profile()`; `public_id` ставит триггер. Клуб — `create_own_club()`: строка в `clubs`, членство `owner`, строка в `fencers` с именем профиля и `user_id`. Старые аккаунты уже в клубах; в Account у них имя и неизменяемый ID.

Без клуба закрыты ростер, история и турниры. Табло остаётся домашним экраном (локальный бой без Save); клуб можно создать в Account.

После сессии клиент читает `profiles` и свою активную строку в `fencers` (`user_id`). Если её нет, `club_id` остаётся пустым. Списки дополнительно фильтруются по `club_id`.

Политики: `is_club_member(club_id)` смотрит на активного бойца с `user_id = auth.uid()`, не `club_id = auth.uid()`. Сейчас все роли клуба имеют одинаковый доступ к ростеру и записи боёв. Владелец может UPDATE `clubs.name` (`is_club_owner`). `save_own_profile()` обновляет и связанную активную строку в `fencers`. Клиентский insert в `fencers` не ставит `user_id`; update не меняет `user_id` и `role`, и не меняет имя/архив у связанной строки. Link/unlink — только RPC. Anon таблицы не читает и не пишет. `matches` только INSERT+SELECT, без UPDATE/DELETE.

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

1. **Логин** — аккаунт или Quick bout; клуб создаётся отдельным шагом.
2. **`/fencers`** — список, добавление имени или **Add by ID**, переименование свободных имён, архив / restore. Свободную строку можно привязать к аккаунту (иконка цепочки, номер из Account). Связанный боец: имя только из Account, Archive = unlink. Без клуба маршрут закрыт.
3. **Табло `/`** — два combobox (Anonymous или человек из ростера). Start: оба пустые **или** двое разных. Один выбранный — ошибка, таймер не стартует. После первого Start селекты lock. Подпись победы — имя.
4. **`/history`** — табы History / Stats, как очередь / бои / таблица в турнире. History: `finished_at` desc, имена и счёт, «X won» / «Draw», фильтр по человеку из сохранённых боёв. Stats: по каждому, кто встречался в `matches`: число боёв, win/loss/draw, most bouts / wins / losses vs. Имя с ростера, если человек ещё там; иначе снимок из боя. Архивные помечены. `/stats` открывает вкладку Stats.
5. **`/fencers/:id/stats`** — тот же набор, что на общей вкладке Stats, по одному бойцу с ростера.
6. **Settings** — лимиты на устройстве; для вошедшего — кнопка Account.
7. **Account** `/settings/account` — переименовать себя (и строку в ростере); владелец меняет имя клуба; без клуба — создать клуб; Sign out.

Навигация с табло: иконки Users / Tournaments / History / Settings. У гостя вместо клубных — Sign in. У вошедшего без клуба клубных иконок нет, остаётся шестерёнка настроек.

```text
roster → синий/красный или оба Anonymous → Start → бой локально
   → Save (только именной) → matches
   → /history (табы History / Stats) и /fencers/:id/stats
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
- UI нескольких клубов, email-приглашений и разных прав ролей (привязка по ID с ростера есть; `owner` / `trainer` / `member` в схеме есть, в UI роли не показываются).
- Редактирование уже сохранённого клубного боя (`matches`). Турнирный оверрайд — в [турнирном режиме](./tournament-mode.md).
- Нативный Capacitor-проект в git.
