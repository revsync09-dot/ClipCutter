'use client';

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpFromLine, Check, Film, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MAX_VIDEO_BYTES, Project, getProjects, projectMediaUrl, uploadVideo, warmCutter } from '../lib/api';
import { useAuth } from './auth-provider';

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];
const MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': '.mp4',
  'application/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
};

function getSupportedExtension(file: File): string | null {
  const match = file.name.trim().match(/\.([a-z0-9]+)\s*$/i);
  const extension = match ? `.${match[1].toLowerCase()}` : null;
  if (extension && ALLOWED_EXTENSIONS.includes(extension)) return extension;
  return MIME_EXTENSIONS[file.type.toLowerCase()] ?? null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}` : `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  return <motion.button whileHover={{ y: -5 }} onClick={() => router.push(`/project/${project.id}`)} className="group min-w-0 overflow-hidden rounded-[26px] border border-ink/10 bg-white text-left shadow-[0_14px_35px_rgba(32,20,46,.07)]">
    <div className="relative aspect-video overflow-hidden bg-ink/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={projectMediaUrl(project, `/api/projects/${project.id}/thumbnail`)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      <span className="absolute bottom-3 right-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{formatDuration(project.duration)}</span>
    </div>
    <div className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate font-bold">{project.original_filename}</h3><p className="mt-1 text-xs text-muted">{project.width}×{project.height} · {project.fps?.toFixed(2)} FPS · {project.codec?.toUpperCase()}</p></div><ArrowRight size={18} className="mt-1 shrink-0 text-purple transition-transform group-hover:translate-x-1" /></div><div className="mt-4 flex items-center justify-between text-[11px]"><span className="inline-flex items-center gap-1.5 rounded-full bg-mint/60 px-2.5 py-1 font-bold text-ink"><Check size={12} /> {project.status}</span><span className="text-muted">{new Date(project.created_at).toLocaleDateString()}</span></div></div>
  </motion.button>;
}

function AuthCard() {
  const { resendConfirmation, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null); setConfirmationEmail(null);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else {
        const signedIn = await signUp(email.trim(), password);
        if (!signedIn) {
          setMode('login');
          setPassword('');
          setConfirmationEmail(email.trim());
          setMessage('Registrierung angenommen. Supabase hat die Bestätigungs-E-Mail beim Mailserver angefordert. Prüfe auch Spam oder sende sie nach 60 Sekunden erneut.');
        }
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Anmeldung fehlgeschlagen.');
    } finally { setBusy(false); }
  };

  return <div className="mt-9 grid overflow-hidden rounded-[30px] border border-ink/10 bg-white shadow-[0_20px_55px_rgba(32,20,46,.09)] lg:grid-cols-[1.05fr_.95fr]">
    <div className="bg-ink p-7 text-white sm:p-10"><p className="text-[10px] font-extrabold tracking-[.17em] text-mint">DEIN PRIVATER ARBEITSBEREICH</p><h3 className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Beginne direkt dein Leben einfacher zu machen.</h3><p className="mt-4 max-w-lg text-sm leading-6 text-white/65">Melde dich an, damit Projekte, Schnitte und Einstellungen sicher und eindeutig deinem Konto zugeordnet werden.</p></div>
    <form onSubmit={submit} className="p-7 sm:p-10"><div className="mb-6 flex rounded-full bg-cream p-1"><button type="button" onClick={() => { setMode('login'); setMessage(null); }} className={`flex-1 rounded-full px-4 py-2.5 text-xs font-bold ${mode === 'login' ? 'bg-white text-purple shadow-sm' : 'text-muted'}`}>Anmelden</button><button type="button" onClick={() => { setMode('register'); setMessage(null); }} className={`flex-1 rounded-full px-4 py-2.5 text-xs font-bold ${mode === 'register' ? 'bg-white text-purple shadow-sm' : 'text-muted'}`}>Konto erstellen</button></div>
      <label className="text-xs font-bold">E-Mail<input required type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-2xl border border-ink/10 bg-cream/50 px-4 py-3.5 outline-none transition focus:border-purple" /></label>
      <label className="mt-4 block text-xs font-bold">Passwort<input required minLength={6} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-2 w-full rounded-2xl border border-ink/10 bg-cream/50 px-4 py-3.5 outline-none transition focus:border-purple" /></label>
      {message && <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-xs font-medium text-ink">{message}</p>}
      {confirmationEmail && <button type="button" disabled={busy} onClick={async () => { setBusy(true); setMessage(null); try { await resendConfirmation(confirmationEmail); setMessage('Bestätigungs-E-Mail wurde erneut angefordert. Bitte Posteingang und Spam prüfen.'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'E-Mail konnte nicht erneut gesendet werden.'); } finally { setBusy(false); } }} className="mt-3 w-full rounded-full border border-purple/25 px-5 py-3 text-xs font-bold text-purple disabled:opacity-50">Bestätigungs-E-Mail erneut senden</button>}
      <button disabled={busy} className="mt-5 w-full rounded-full bg-purple px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Bitte warten …' : mode === 'login' ? 'Sicher anmelden' : 'Kostenloses Konto erstellen'}</button>
    </form>
  </div>;
}

export function ProjectsSection() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Render's free service may be asleep. Wake it while the visitor signs in
    // or chooses a file, rather than making the first upload wait for startup.
    void warmCutter().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    getProjects().then(setProjects).catch((reason) => setError(
      reason instanceof Error ? reason.message : 'Videoverarbeitungsdienst ist momentan nicht erreichbar.',
    ));
    const preventFileNavigation = (event: globalThis.DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => { window.removeEventListener('dragover', preventFileNavigation); window.removeEventListener('drop', preventFileNavigation); };
  }, [loading, user]);

  const startUpload = useCallback(async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) { setError('Das Video darf maximal 10 GB groß sein.'); return; }
    const extension = getSupportedExtension(file);
    if (!extension) { setError(`„${file.name}“ wurde nicht als MP4-, MOV-, MKV- oder WebM-Video erkannt.`); return; }
    const trimmedName = file.name.trim();
    const uploadName = trimmedName.toLowerCase().endsWith(extension) ? trimmedName : `${trimmedName || 'video'}${extension}`;
    setError(null); setProgress(0); setStage('Video wird sicher hochgeladen');
    try {
      const project = await uploadVideo(file, value => { setProgress(value); if (value >= 100) setStage('Video wird geprüft und vorbereitet'); }, uploadName);
      setStage('Projekt ist bereit'); setProjects(current => [project, ...current]);
      window.setTimeout(() => router.push(`/project/${project.id}`), 350);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload fehlgeschlagen.'); setProgress(null); setStage('');
    }
  }, [router]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); setDragging(false); void startUpload(event.dataTransfer.files[0]); };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { void startUpload(event.target.files?.[0]); event.target.value = ''; };
  const isUploading = progress !== null;

  if (loading) return <section id="projects" className="grid min-h-72 place-items-center bg-cream"><LoaderCircle className="animate-spin text-purple" /></section>;

  return <section id="projects" className="bg-cream px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1240px]">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-3 text-[10px] font-extrabold tracking-[.17em] text-purple">DEIN ARBEITSBEREICH</p><h2 className="text-[clamp(2.7rem,5vw,4.8rem)] font-semibold leading-none tracking-[-.055em]">Projekte</h2><p className="mt-3 text-sm text-muted sm:text-base">Deine Projekte und Videos werden sicher deinem Konto zugeordnet.</p></div>{user && <button disabled={isUploading} onClick={() => inputRef.current?.click()} className="flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-white transition-transform hover:-translate-y-.5 disabled:opacity-50"><Plus size={17} /> Neues Projekt</button>}</div>
    {!user ? <AuthCard /> : <>
    <input ref={inputRef} type="file" accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/webm,video/x-matroska" onChange={onFileChange} className="hidden" />
    <motion.div onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop} animate={{ scale: dragging ? 1.01 : 1 }} className={`mt-8 grid min-h-60 place-items-center rounded-[26px] border border-dashed p-5 text-center transition-colors sm:mt-10 sm:min-h-64 sm:rounded-[32px] sm:p-9 ${dragging ? 'border-purple bg-purple/5' : 'border-purple/35 bg-cream/80'}`}>
      {isUploading ? <div className="w-full max-w-lg"><span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-purple text-white shadow-lg"><LoaderCircle className="animate-spin" size={27} /></span><h3 className="mt-5 text-2xl font-semibold">{stage}</h3><p className="mt-2 text-sm text-muted">ClipForge geöffnet lassen, bis die sichere Vorbereitung abgeschlossen ist.</p><div className="mt-7 h-3 overflow-hidden rounded-full bg-ink/10"><motion.div className="h-full rounded-full bg-purple" animate={{ width: `${Math.max(progress, 4)}%` }} /></div><p className="mt-2 text-xs font-bold text-purple">{progress}%</p></div> : <div><button onClick={() => inputRef.current?.click()} className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-purple text-white shadow-lg transition-transform hover:-translate-y-1" aria-label="Video auswählen"><ArrowUpFromLine size={26} /></button><h3 className="mt-5 text-2xl font-semibold">{dragging ? 'Loslassen und Projekt starten' : 'Video hier ablegen'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">MP4, MOV, MKV oder WebM · bis 8 Stunden. Dauer, Auflösung, Bildrate und Codec werden sicher ausgelesen.</p><button onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-muted shadow-sm transition-colors hover:text-purple"><Film size={15} /> Video auswählen</button></div>}
    </motion.div>
    {error && <div role="alert" className="mt-4 flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/10 px-5 py-4 text-sm font-medium text-ink"><TriangleAlert size={19} className="shrink-0 text-coral" />{error}</div>}
    {projects.length > 0 && <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>}
    </>}
  </div></section>;
}
