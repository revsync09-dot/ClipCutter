import { supabase } from './supabase';
import {
  resolveApiBaseUrl,
  videoServiceHttpsRequiredMessage,
  videoServiceUnconfiguredMessage,
  videoServiceUnreachableMessage,
} from './api-config';

function pageHostname(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.hostname;
}

// This is the only place where the browser API origin is selected. Vercel
// must provide NEXT_PUBLIC_API_URL; localhost is a development-only fallback
// and is ignored on the deployed website.
export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  pageHostname: pageHostname(),
});

export type Project = {
  id: string;
  filename: string;
  original_filename: string;
  created_at: string;
  status: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  thumbnail_path: string | null;
  media_token: string;
};
export type Job = {
  id: string;
  project_id: string;
  kind: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  error: string | null;
  output_url: string | null;
  preview_url: string | null;
};
export type TranscriptWord = { start: number; end: number; word: string };
export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};
export type Transcript = {
  id: number;
  project_id: string;
  language: string;
  full_text: string;
  segments: TranscriptSegment[];
  created_at: string;
};
export type Clip = {
  id: number;
  project_id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number;
  reason: string;
  output_path: string | null;
};
export type CaptionStyle =
  | "minimal" | "bold" | "gaming" | "creator"
  | "karaoke" | "boxed" | "neon" | "documentary";
export type CaptionAnimation = "none" | "pop" | "slide" | "karaoke";
export type HeadlineStyle =
  | "clean"
  | "dark"
  | "capsule"
  | "bubble"
  | "glass"
  | "minimal";
export type HeadlinePosition = "split" | "top" | "bottom";
export type HeadlineFont =
  | "Anton"
  | "Bebas Neue"
  | "Montserrat"
  | "Inter"
  | "Archivo Black"
  | "Bangers"
  | "Pacifico"
  | "Permanent Marker";
export type RenderOptions = {
  start: number;
  end: number;
  mode: "fit" | "crop";
  fps: "original" | "30" | "60";
  filename: string;
  captions: boolean;
  caption_style: CaptionStyle;
  caption_uppercase: boolean;
  words_per_caption: number;
  caption_animation: CaptionAnimation;
  caption_x: number;
  caption_y: number;
  caption_size: number;
  platform: "tiktok" | "instagram" | "shorts" | "youtube";
  layout:
    | "standard"
    | "blur_center"
    | "reaction_top"
    | "main_focus"
    | "main_top"
    | "picture_in_picture";
  headline: string;
  headline_style: HeadlineStyle;
  headline_position: HeadlinePosition;
  headline_size: number;
  headline_font: HeadlineFont;
  headline_text_color: string;
  headline_background_color: string;
  headline_x: number;
  headline_y: number;
  secondary_headline: string;
  secondary_headline_x: number;
  secondary_headline_y: number;
  blur_strength: number;
  background_dim: number;
  main_x: number;
  main_y: number;
  main_scale: number;
  reaction_x: number;
  reaction_y: number;
  reaction_scale: number;
  frame_x: number;
  frame_y: number;
  frame_scale: number;
  social_safe_layout: boolean;
  main_format: "source" | "square" | "portrait" | "fill";
  include_reaction: boolean;
  font_family: "auto" | "Anton" | "Bebas Neue" | "Montserrat" | "Inter";
};
export type ReferenceStyle = {
  filename: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  scene_count: number;
  average_shot_length: number;
  target_clip_duration: number;
  suggested_platform: "shorts" | "youtube";
  brightness: number;
  contrast: number;
  saturation: number;
  motion_score: number;
  text_activity: number;
  recommended_font: string;
  style_summary: string;
};
export type ReactionSync = {
  filename: string;
  duration: number;
  width: number;
  height: number;
  offset_seconds: number;
  confidence: number;
};
export type ExampleVideo = {
  id: string;
  filename: string;
  title: string;
  created_at: string;
  video_url: string;
};
export type HeadlineSuggestions = { main_headline: string; reaction_headline: string };
export type OwnerOverview = {
  projects: number; clips: number; transcripts: number; total_duration: number;
  exports: number; export_bytes: number;
  recent_projects: { id: string; name: string; status: string; created_at: string }[];
};
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;
export function absoluteApiUrl(path: string, mediaToken?: string): string {
  const raw = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
  if (!mediaToken) return raw;
  const url = new URL(raw);
  url.searchParams.set('media_token', mediaToken);
  return url.toString();
}

export function projectMediaUrl(project: Project, path: string): string {
  return absoluteApiUrl(path, project.media_token);
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.detail && typeof payload.detail === 'object') return JSON.stringify(payload.detail);
    return `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    pageHostname: pageHostname(),
  });
  if (!apiBaseUrl) {
    throw new Error(videoServiceUnconfiguredMessage(pageHostname()));
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && apiBaseUrl.startsWith('http://')) {
    throw new Error(videoServiceHttpsRequiredMessage());
  }
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  try {
    return await fetch(input, { ...init, headers, credentials: 'include' });
  } catch (reason) {
    if (reason instanceof TypeError) {
      throw new Error(videoServiceUnreachableMessage(pageHostname()));
    }
    throw reason;
  }
}

export async function getVideoServiceHealth(): Promise<boolean> {
  const apiBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    pageHostname: pageHostname(),
  });
  if (!apiBaseUrl) return false;
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}
export async function sendPresenceHeartbeat(page: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/presence/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page }),
    keepalive: true,
  });
  if (!response.ok) throw new Error(await parseError(response));
}
export async function getProjects(): Promise<Project[]> {
  const response = await authFetch(`${API_BASE_URL}/projects`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Project[]>;
}
export async function getExamples(): Promise<ExampleVideo[]> {
  const response = await authFetch(`${API_BASE_URL}/examples`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ExampleVideo[]>;
}
export async function uploadExample(file: File): Promise<ExampleVideo> {
  const body = new FormData();
  body.append("file", file);
  const response = await authFetch(`${API_BASE_URL}/examples`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ExampleVideo>;
}
export async function getReferenceStyle(
  id: string,
): Promise<ReferenceStyle | null> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/reference`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ReferenceStyle>;
}
export async function uploadReference(
  id: string,
  file: File,
): Promise<ReferenceStyle> {
  const body = new FormData();
  body.append("file", file);
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/reference`,
    { method: "POST", body },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ReferenceStyle>;
}
export async function uploadReaction(
  id: string,
  file: File,
): Promise<ReactionSync> {
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await authFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(id)}/reaction`,
      { method: "POST", body },
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json() as Promise<ReactionSync>;
  } catch (reason) {
    // A large upload may have finished on the local server even when the
    // browser lost the response. Restore that saved result before reporting
    // a failure to the creator.
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const saved = await getReaction(id).catch(() => null);
    if (saved && saved.filename === file.name) return saved;
    if (reason instanceof Error && reason.message !== "Failed to fetch") throw reason;
    throw new Error(videoServiceUnreachableMessage(pageHostname()));
  }
}
export async function getReaction(id: string): Promise<ReactionSync | null> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/reaction`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ReactionSync>;
}
export async function updateReactionOffset(
  id: string,
  offsetSeconds: number,
): Promise<ReactionSync> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/reaction`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset_seconds: offsetSeconds }),
    },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ReactionSync>;
}
export async function uploadFrame(
  id: string,
  file: File,
): Promise<{ filename: string; frame_url: string }> {
  const body = new FormData();
  body.append("file", file);
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/frame`,
    { method: "POST", body },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<{ filename: string; frame_url: string }>;
}
export async function getProject(id: string): Promise<Project> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Project>;
}
export async function startPreview(id: string): Promise<Job> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/preview`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Job>;
}
export async function getJob(id: string): Promise<Job> {
  const response = await authFetch(
    `${API_BASE_URL}/jobs/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Job>;
}
export async function renderClip(
  id: string,
  options: RenderOptions,
): Promise<Job> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/render`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Job>;
}
export async function getTranscript(id: string): Promise<Transcript | null> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/transcript`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Transcript>;
}
export async function startTranscription(id: string): Promise<Job> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/transcribe`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Job>;
}
export async function getClips(id: string): Promise<Clip[]> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/clips`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Clip[]>;
}
export async function startAutoCut(
  id: string,
  platform: "tiktok" | "instagram" | "shorts" | "youtube" = "shorts",
): Promise<Job> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(id)}/auto-cut`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    },
  );
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Job>;
}
export async function generateHeadlines(id: string, start: number, end: number, platform: "tiktok" | "instagram" | "shorts" | "youtube"): Promise<HeadlineSuggestions> {
  const response = await authFetch(`${API_BASE_URL}/projects/${encodeURIComponent(id)}/headline-suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end, platform }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<HeadlineSuggestions>;
}
export async function getOwnerIdentity(): Promise<boolean> {
  const response = await authFetch(`${API_BASE_URL}/owner/me`, { cache: 'no-store' });
  return response.ok;
}
export async function getOwnerOverview(): Promise<OwnerOverview> {
  const response = await authFetch(`${API_BASE_URL}/owner/overview`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<OwnerOverview>;
}
export function uploadVideo(
  file: File,
  onProgress: (progress: number) => void,
  uploadName = file.name,
): Promise<Project> {
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.reject(new Error('Das Video darf maximal 10 GB groß sein.'));
  }
  // Every source video travels in independently retryable blocks. The backend
  // accepts blocks out of order, so several connections can use the available
  // upload bandwidth instead of waiting for a round trip after every block.
  return uploadVideoInChunks(file, onProgress, uploadName);
}

export async function warmCutter(): Promise<void> {
  if (!API_BASE_URL) return;
  const response = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Der Video-Dienst konnte nicht gestartet werden.');
}

async function uploadVideoInChunks(
  file: File,
  onProgress: (progress: number) => void,
  uploadName: string,
): Promise<Project> {
  onProgress(1);
  try {
    return await uploadVideoToR2(file, onProgress, uploadName);
  } catch (reason) {
    // Local development and older backends use the resumable API upload.
    // Once R2 has accepted an upload, surface failures instead of duplicating
    // several gigabytes through a second transport.
    if (!(reason instanceof Error) || !reason.message.startsWith('R2_NOT_CONFIGURED')) throw reason;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Der direkte Cloudflare-R2-Upload ist im Produktions-Backend nicht aktiviert. Bitte R2-Variablen setzen und das Backend neu deployen.');
    }
  }
  onProgress(1);
  const initialized = await authFetch(`${API_BASE_URL}/projects/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: uploadName, content_type: file.type, size: file.size }),
  });
  if (!initialized.ok) throw new Error(await parseError(initialized));
  const upload = await initialized.json() as { upload_id: string; received_bytes: number; chunk_size: number };
  const chunks = Array.from(
    { length: Math.ceil(file.size / upload.chunk_size) },
    (_, index) => {
      const offset = index * upload.chunk_size;
      return { offset, block: file.slice(offset, Math.min(offset + upload.chunk_size, file.size)) };
    },
  );
  let nextChunk = 0;
  let completedBytes = upload.received_bytes;

  const sendChunk = async ({ offset, block }: { offset: number; block: Blob }) => {
    let lastError: unknown = null;
    let accepted = false;
    for (let attempt = 0; attempt < 4 && !accepted; attempt += 1) {
      try {
        const response = await authFetch(
          `${API_BASE_URL}/projects/upload/${encodeURIComponent(upload.upload_id)}/chunk?offset=${offset}`,
          { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: block },
        );
        if (!response.ok) throw new Error(await parseError(response));
        await response.json();
        accepted = true;
      } catch (reason) {
        lastError = reason;
        if (attempt < 3) await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    if (!accepted) {
      throw lastError instanceof Error ? lastError : new Error('Ein Video-Block konnte nicht übertragen werden.');
    }
    completedBytes += block.size;
    onProgress(Math.min(99, Math.max(2, Math.round((completedBytes / file.size) * 100))));
  };

  const worker = async () => {
    while (nextChunk < chunks.length) {
      const chunk = chunks[nextChunk];
      nextChunk += 1;
      await sendChunk(chunk);
    }
  };
  // Six is the practical per-origin browser limit and gives slow residential
  // upload connections enough work without overloading the free 512 MB worker.
  await Promise.all(Array.from({ length: Math.min(6, chunks.length) }, () => worker()));
  onProgress(100);
  const completed = await authFetch(
    `${API_BASE_URL}/projects/upload/${encodeURIComponent(upload.upload_id)}/complete`,
    { method: 'POST' },
  );
  if (!completed.ok) throw new Error(await parseError(completed));
  return completed.json() as Promise<Project>;
}

async function uploadVideoToR2(file: File, onProgress: (progress: number) => void, uploadName: string): Promise<Project> {
  let initialized: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      initialized = await authFetch(`${API_BASE_URL}/projects/upload/r2/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadName, content_type: file.type, size: file.size }),
        signal: controller.signal,
      });
      if (initialized.ok || initialized.status === 404 || initialized.status === 503) break;
    } catch {
      initialized = null;
    } finally {
      window.clearTimeout(timeout);
    }
    if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 1000));
  }
  if (!initialized) throw new Error('Der Upload-Dienst antwortet nicht. Bitte erneut versuchen.');
  if (initialized.status === 404 || initialized.status === 503) throw new Error('R2_NOT_CONFIGURED');
  if (!initialized.ok) throw new Error(await parseError(initialized));
  const upload = await initialized.json() as { upload_id: string; key: string; part_size: number; parts: { part_number: number; url: string }[] };
  onProgress(2);
  let nextPart = 0;
  const completed: { part_number: number; etag: string }[] = [];
  const partProgress = new Map<number, number>();
  const reportProgress = () => {
    const transferred = [...partProgress.values()].reduce((total, value) => total + value, 0);
    onProgress(Math.min(99, Math.max(2, Math.round((transferred / file.size) * 98) + 1)));
  };
  const sendPart = async (part: { part_number: number; url: string }) => {
    const start = (part.part_number - 1) * upload.part_size;
    const body = file.slice(start, Math.min(start + upload.part_size, file.size));
    let etag = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      partProgress.set(part.part_number, 0);
      try {
        etag = await new Promise<string>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('PUT', part.url);
          request.timeout = 120_000;
          request.upload.onprogress = event => {
            if (event.lengthComputable) {
              partProgress.set(part.part_number, event.loaded);
              reportProgress();
            }
          };
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve(request.getResponseHeader('ETag') ?? '');
            else reject(new Error(`R2-Upload fehlgeschlagen (${request.status})`));
          };
          request.onerror = () => reject(new Error('R2-Netzwerkfehler'));
          request.ontimeout = () => reject(new Error('R2-Upload-Timeout'));
          request.send(body);
        });
        if (etag) break;
      } catch {
        etag = '';
      }
      if (attempt < 3) await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)));
    }
    if (!etag) throw new Error('Ein R2-Upload-Block konnte nicht übertragen werden. Bitte erneut versuchen.');
    completed.push({ part_number: part.part_number, etag });
    partProgress.set(part.part_number, body.size);
    reportProgress();
  };
  const worker = async () => {
    while (nextPart < upload.parts.length) {
      const part = upload.parts[nextPart];
      nextPart += 1;
      await sendPart(part);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, upload.parts.length) }, () => worker()));
  const completedResponse = await authFetch(`${API_BASE_URL}/projects/upload/r2/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: upload.upload_id, key: upload.key, filename: uploadName, parts: completed }),
  });
  if (!completedResponse.ok) throw new Error(await parseError(completedResponse));
  onProgress(100);
  return completedResponse.json() as Promise<Project>;
}
