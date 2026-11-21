-- Dialect Archive · database schema for Supabase (Postgres)
--
-- Run this once in a new Supabase project: Dashboard → SQL Editor → paste → Run.
-- It is safe to re-run: every statement checks whether its object already exists.
--
-- Phase 1 covers "record a word": speakers sign in, answer word prompts with a
-- recording, and every upload waits for a linguist-moderator to approve it.
--
-- Roles
--   speaker    – anyone who signs up. Can record, sees their own uploads.
--   moderator  – linguists. Can see and approve/reject every upload.
--   Make someone a moderator in the SQL editor:
--     update public.profiles set role = 'moderator' where id = '<user uuid>';

-- ─────────────────────────────────────────────────────────────── profiles ──
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  role          text not null default 'speaker' check (role in ('speaker', 'moderator')),
  -- What the speaker tells us once, then reused for every recording.
  language_id   text,            -- matches an id in data/languages.js, e.g. 'hakka'
  variety       text,            -- free text in their own words, e.g. 'Meixian'
  hometown      text,            -- free text, e.g. '梅县 松口镇'
  age_group     text check (age_group in ('under-20', '20-39', '40-59', '60-79', '80+')),
  created_at    timestamptz not null default now()
);

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by the policies below.
create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'moderator');
$$;

-- ───────────────────────────────────────────────────────────── recordings ──
create table if not exists public.recordings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prompt_id     text not null,   -- matches an id in data/prompts.js, e.g. 'eat'
  language_id   text not null,
  variety       text,
  hometown      text,
  age_group     text,
  transcription text,            -- how the speaker writes it (characters), optional
  romanisation  text,            -- optional
  note          text,            -- anything else the speaker wants to say
  audio_path    text not null,   -- path inside the 'recordings' storage bucket
  duration_ms   integer,
  consent       boolean not null check (consent),        -- must be true
  licence       text not null default 'CC BY-SA 4.0',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now()
);

create index if not exists recordings_language_status on public.recordings (language_id, status);
create index if not exists recordings_user on public.recordings (user_id);

-- ────────────────────────────────────────────────────────────── revisions ──
-- Every change to a recording is kept here: who, when, before and after.
-- This is the wiki-style history; later phases add more tables to it.
create table if not exists public.revisions (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      uuid not null,
  user_id     uuid default auth.uid(),
  action      text not null,     -- INSERT / UPDATE / DELETE
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists revisions_row on public.revisions (table_name, row_id);

create or replace function public.log_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.revisions (table_name, row_id, action, before, after)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists recordings_history on public.recordings;
create trigger recordings_history
  after insert or update or delete on public.recordings
  for each row execute function public.log_revision();

-- Speakers may only change the words around their own pending recordings;
-- status and review fields are for moderators.
create or replace function public.guard_recording_update()
returns trigger language plpgsql as $$
begin
  if not public.is_moderator() then
    if old.status <> 'pending'
       or new.status is distinct from old.status
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note
       or new.audio_path is distinct from old.audio_path
       or new.user_id is distinct from old.user_id then
      raise exception 'Only moderators can review recordings';
    end if;
  else
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists recordings_guard on public.recordings;
create trigger recordings_guard
  before update on public.recordings
  for each row execute function public.guard_recording_update();

-- ─────────────────────────────────────────────────────── row-level rules ──
alter table public.profiles   enable row level security;
alter table public.recordings enable row level security;
alter table public.revisions  enable row level security;

-- profiles: you see and edit your own; moderators see everyone's.
drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_moderator());
create policy "own profile update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- recordings: everyone can hear approved ones; you see your own; moderators see all.
drop policy if exists "read recordings"   on public.recordings;
drop policy if exists "add own recording" on public.recordings;
drop policy if exists "edit recordings"   on public.recordings;
drop policy if exists "delete recordings" on public.recordings;
create policy "read recordings" on public.recordings for select
  using (status = 'approved' or user_id = auth.uid() or public.is_moderator());
create policy "add own recording" on public.recordings for insert
  with check (user_id = auth.uid() and status = 'pending' and consent);
create policy "edit recordings" on public.recordings for update
  using (user_id = auth.uid() or public.is_moderator());
create policy "delete recordings" on public.recordings for delete
  using ((user_id = auth.uid() and status = 'pending') or public.is_moderator());

-- revisions: moderators read the history; nobody writes to it directly.
drop policy if exists "moderators read history" on public.revisions;
create policy "moderators read history" on public.revisions for select using (public.is_moderator());

-- ──────────────────────────────────────────────────────── audio storage ──
-- A private bucket. Files live at <user id>/<recording id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 10485760,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do nothing;

drop policy if exists "upload own audio" on storage.objects;
drop policy if exists "read audio"       on storage.objects;
drop policy if exists "delete own audio" on storage.objects;

create policy "upload own audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- Audio is readable when its recording is approved, it is yours, or you moderate.
create policy "read audio" on storage.objects for select
  using (
    bucket_id = 'recordings' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator()
      or exists (select 1 from public.recordings r where r.audio_path = name and r.status = 'approved')
    )
  );

create policy "delete own audio" on storage.objects for delete
  using (bucket_id = 'recordings' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));
