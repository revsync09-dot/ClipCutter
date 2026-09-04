-- ClipForge: API permissions for tables created through the SQL editor.
-- RLS remains the actual security boundary; these grants only allow the
-- authenticated role to reach the policies.

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.projects,
  public.media_assets,
  public.reaction_sync,
  public.transcripts,
  public.scenes,
  public.clips,
  public.project_settings,
  public.style_profiles,
  public.jobs
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Only finished showcase examples are public. All user project tables stay
-- inaccessible to anonymous visitors.
grant select on table public.example_videos to anon, authenticated;
grant insert, update, delete on table public.example_videos to authenticated;

commit;
