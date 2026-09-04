-- ClipForge AI - complete Supabase database and storage foundation
-- Paste this entire file into Supabase Dashboard > SQL Editor > New query > Run.
-- Designed to be safe to run again while the schema is still empty/in development.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  plan text not null default 'free'
    check (plan in ('free', 'creator', 'pro', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name, avatar_url)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Projects and media
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  status text not null default 'ready'
    check (status in ('uploading', 'ready', 'processing', 'completed', 'failed', 'archived')),
  active_step text not null default 'reference'
    check (active_step in ('reference', 'format', 'frame', 'clips', 'transcript', 'captions', 'headline', 'export')),
  duration_seconds double precision
    check (duration_seconds is null or duration_seconds > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  fps double precision check (fps is null or fps > 0),
  codec text,
  selected_start double precision not null default 0 check (selected_start >= 0),
  selected_end double precision check (selected_end is null or selected_end > selected_start),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in (
    'main_video', 'reaction_video', 'reference_video', 'custom_frame',
    'thumbnail', 'preview', 'timeline_frame', 'caption_file', 'export'
  )),
  bucket_id text not null check (bucket_id in ('project-media', 'exports')),
  object_path text not null check (char_length(object_path) between 3 and 1024),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds double precision check (duration_seconds is null or duration_seconds >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  fps double precision check (fps is null or fps > 0),
  codec text,
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (bucket_id, object_path)
);

create table if not exists public.reaction_sync (
  project_id uuid primary key references public.projects(id) on delete cascade,
  reaction_asset_id uuid references public.media_assets(id) on delete set null,
  offset_seconds double precision not null default 0 check (offset_seconds between -120 and 120),
  confidence double precision not null default 0 check (confidence between 0 and 100),
  sync_method text not null default 'timeline'
    check (sync_method in ('timeline', 'audio_consensus', 'manual')),
  sample_offsets jsonb not null default '[]'::jsonb check (jsonb_typeof(sample_offsets) = 'array'),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- AI analysis and Smart Cuts
-- ---------------------------------------------------------------------------

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  language text not null default 'de' check (char_length(language) between 2 and 16),
  model_name text,
  full_text text not null default '',
  segments jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array'),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(full_text, ''))
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenes (
  id bigint generated by default as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  start_seconds double precision not null check (start_seconds >= 0),
  end_seconds double precision not null check (end_seconds > start_seconds),
  score double precision check (score is null or score between 0 and 100),
  label text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position > 0),
  start_seconds double precision not null check (start_seconds >= 0),
  end_seconds double precision not null check (end_seconds > start_seconds),
  title text not null check (char_length(title) between 1 and 255),
  hook text not null default '',
  score integer not null default 0 check (score between 0 and 100),
  reason text not null default '',
  platform text not null default 'shorts'
    check (platform in ('tiktok', 'instagram', 'shorts', 'youtube')),
  status text not null default 'suggested'
    check (status in ('suggested', 'selected', 'rendering', 'rendered', 'rejected')),
  output_asset_id uuid references public.media_assets(id) on delete set null,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, position)
);

-- ---------------------------------------------------------------------------
-- Editor state, style profiles and persistent jobs
-- ---------------------------------------------------------------------------

create table if not exists public.project_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  layout text not null default 'reaction_top'
    check (layout in ('standard', 'blur_center', 'reaction_top', 'main_top', 'picture_in_picture')),
  main_format text not null default 'source'
    check (main_format in ('source', 'square', 'portrait', 'fill')),
  crop_mode text not null default 'crop' check (crop_mode in ('fit', 'crop')),
  output_fps text not null default 'original' check (output_fps in ('original', '30', '60')),
  platform text not null default 'shorts'
    check (platform in ('tiktok', 'instagram', 'shorts', 'youtube')),
  reaction_scale double precision not null default 0.90 check (reaction_scale between 0.72 and 1.0),
  include_reaction boolean not null default true,
  captions_enabled boolean not null default true,
  caption_style text not null default 'bold'
    check (caption_style in ('minimal', 'bold', 'gaming', 'creator', 'karaoke', 'boxed', 'neon', 'documentary')),
  caption_uppercase boolean not null default false,
  words_per_caption integer not null default 4 check (words_per_caption between 2 and 5),
  caption_animation text not null default 'pop'
    check (caption_animation in ('none', 'pop', 'slide', 'karaoke')),
  headline text not null default '' check (char_length(headline) <= 120),
  headline_style text not null default 'clean'
    check (headline_style in ('clean', 'dark', 'capsule', 'bubble', 'glass', 'minimal')),
  headline_position text not null default 'split'
    check (headline_position in ('split', 'top', 'bottom')),
  headline_size integer not null default 64 check (headline_size between 36 and 110),
  headline_font text not null default 'Montserrat'
    check (headline_font in ('Anton', 'Bebas Neue', 'Montserrat', 'Inter', 'Archivo Black', 'Bangers', 'Pacifico', 'Permanent Marker')),
  headline_text_color text not null default '#EF1F1F'
    check (headline_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  headline_background_color text not null default '#FFFFFF'
    check (headline_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  custom_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_settings) = 'object'),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_settings (project_id)
  values (new.id)
  on conflict (project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
after insert on public.projects
for each row execute function public.handle_new_project();

insert into public.project_settings (project_id)
select id from public.projects
on conflict (project_id) do nothing;

create table if not exists public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('preview', 'transcription', 'smart_cut', 'render', 'sync', 'style_analysis')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress double precision not null default 0 check (progress between 0 and 100),
  message text not null default 'Waiting to start',
  error text,
  output_asset_id uuid references public.media_assets(id) on delete set null,
  preview_url text,
  unique_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Public example gallery. Writes are intentionally reserved for service_role.
create table if not exists public.example_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  bucket_id text not null default 'examples' check (bucket_id = 'examples'),
  object_path text not null unique check (char_length(object_path) between 3 and 1024),
  thumbnail_path text,
  duration_seconds double precision check (duration_seconds is null or duration_seconds > 0),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- Automatic updated_at timestamps
-- ---------------------------------------------------------------------------

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_reaction_sync_updated_at on public.reaction_sync;
create trigger set_reaction_sync_updated_at before update on public.reaction_sync
for each row execute function public.set_updated_at();

drop trigger if exists set_transcripts_updated_at on public.transcripts;
create trigger set_transcripts_updated_at before update on public.transcripts
for each row execute function public.set_updated_at();

drop trigger if exists set_clips_updated_at on public.clips;
create trigger set_clips_updated_at before update on public.clips
for each row execute function public.set_updated_at();

drop trigger if exists set_project_settings_updated_at on public.project_settings;
create trigger set_project_settings_updated_at before update on public.project_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_style_profiles_updated_at on public.style_profiles;
create trigger set_style_profiles_updated_at before update on public.style_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_example_videos_updated_at on public.example_videos;
create trigger set_example_videos_updated_at before update on public.example_videos
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_projects_owner_created
  on public.projects (owner_id, created_at desc);
create index if not exists idx_projects_owner_status
  on public.projects (owner_id, status);
create index if not exists idx_media_assets_project_kind
  on public.media_assets (project_id, kind, created_at desc);
create index if not exists idx_transcripts_search
  on public.transcripts using gin (search_vector);
create index if not exists idx_scenes_project_start
  on public.scenes (project_id, start_seconds);
create index if not exists idx_clips_project_start
  on public.clips (project_id, start_seconds);
create index if not exists idx_clips_project_score
  on public.clips (project_id, score desc);
create index if not exists idx_style_profiles_owner
  on public.style_profiles (owner_id, created_at desc);
create index if not exists idx_jobs_project_created
  on public.jobs (project_id, created_at desc);
create index if not exists idx_jobs_active
  on public.jobs (project_id, status)
  where status in ('queued', 'processing');
create unique index if not exists idx_jobs_active_unique_key
  on public.jobs (project_id, unique_key)
  where unique_key is not null and status in ('queued', 'processing');
create index if not exists idx_example_videos_published
  on public.example_videos (sort_order, created_at desc)
  where is_published = true;

-- ---------------------------------------------------------------------------
-- Row Level Security helpers and policies
-- ---------------------------------------------------------------------------

create or replace function public.is_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_project_owner(uuid) from public;
grant execute on function public.is_project_owner(uuid) to authenticated, service_role;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_project() from public;
revoke all on function public.set_updated_at() from public;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.media_assets enable row level security;
alter table public.reaction_sync enable row level security;
alter table public.transcripts enable row level security;
alter table public.scenes enable row level security;
alter table public.clips enable row level security;
alter table public.project_settings enable row level security;
alter table public.style_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.example_videos enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "media_assets_owner_all" on public.media_assets;
create policy "media_assets_owner_all" on public.media_assets
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "reaction_sync_owner_all" on public.reaction_sync;
create policy "reaction_sync_owner_all" on public.reaction_sync
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "transcripts_owner_all" on public.transcripts;
create policy "transcripts_owner_all" on public.transcripts
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "scenes_owner_all" on public.scenes;
create policy "scenes_owner_all" on public.scenes
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "clips_owner_all" on public.clips;
create policy "clips_owner_all" on public.clips
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "project_settings_owner_all" on public.project_settings;
create policy "project_settings_owner_all" on public.project_settings
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "style_profiles_owner_all" on public.style_profiles;
create policy "style_profiles_owner_all" on public.style_profiles
for all to authenticated
using (
  owner_id = (select auth.uid())
  and (project_id is null or public.is_project_owner(project_id))
)
with check (
  owner_id = (select auth.uid())
  and (project_id is null or public.is_project_owner(project_id))
);

drop policy if exists "jobs_owner_all" on public.jobs;
create policy "jobs_owner_all" on public.jobs
for all to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "example_videos_public_read" on public.example_videos;
create policy "example_videos_public_read" on public.example_videos
for select to anon, authenticated using (is_published = true);

-- Explicit grants: RLS still decides which individual rows are accessible.
revoke all on table
  public.profiles, public.projects, public.media_assets, public.reaction_sync,
  public.transcripts, public.scenes, public.clips, public.project_settings,
  public.style_profiles, public.jobs, public.example_videos
from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;
grant select, insert, update, delete on public.reaction_sync to authenticated;
grant select, insert, update, delete on public.transcripts to authenticated;
grant select, insert, update, delete on public.scenes to authenticated;
grant select, insert, update, delete on public.clips to authenticated;
grant select, insert, update, delete on public.project_settings to authenticated;
grant select, insert, update, delete on public.style_profiles to authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select on public.example_videos to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets and private per-user access
-- Object paths must start with: <auth-user-uuid>/<project-uuid>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'project-media',
    'project-media',
    false,
    null,
    array[
      'video/mp4', 'video/x-m4v', 'video/quicktime', 'video/x-matroska', 'video/webm',
      'image/png', 'image/webp', 'image/jpeg',
      'application/vnd.apple.mpegurl', 'application/x-mpegURL', 'video/mp2t', 'text/plain'
    ]
  ),
  (
    'exports',
    'exports',
    false,
    null,
    array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png']
  ),
  (
    'examples',
    'examples',
    true,
    null,
    array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- API privileges. Row Level Security policies below still decide which rows
-- an authenticated user can read or change.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles, public.projects, public.media_assets, public.reaction_sync,
  public.transcripts, public.scenes, public.clips, public.project_settings,
  public.style_profiles, public.jobs
to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on table public.example_videos to anon, authenticated;
grant insert, update, delete on table public.example_videos to authenticated;

drop policy if exists "project_files_select_own" on storage.objects;
create policy "project_files_select_own" on storage.objects
for select to authenticated
using (
  bucket_id in ('project-media', 'exports')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "project_files_insert_own" on storage.objects;
create policy "project_files_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('project-media', 'exports')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "project_files_update_own" on storage.objects;
create policy "project_files_update_own" on storage.objects
for update to authenticated
using (
  bucket_id in ('project-media', 'exports')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('project-media', 'exports')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "project_files_delete_own" on storage.objects;
create policy "project_files_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id in ('project-media', 'exports')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;

-- Quick verification. The result should contain exactly 11 table names.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'projects', 'media_assets', 'reaction_sync', 'transcripts',
    'scenes', 'clips', 'project_settings', 'style_profiles', 'jobs', 'example_videos'
  )
order by table_name;
