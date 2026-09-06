"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Captions,
  Check,
  Clipboard,
  ClipboardCheck,
  Download,
  Eye,
  Film,
  ImagePlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  RectangleHorizontal,
  Sparkles,
  Smartphone,
  Text,
  Trash2,
  Type,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";
import {
  CaptionStyle,
  CaptionAnimation,
  Clip,
  HeadlineFont,
  HeadlinePosition,
  HeadlineStyle,
  Job,
  Project,
  ReactionSync,
  ReferenceStyle,
  Transcript,
  projectMediaUrl,
  getClips,
  getJob,
  getOwnerIdentity,
  getReaction,
  getReferenceStyle,
  getTranscript,
  generateHeadlines,
  renderClip,
  startAutoCut,
  startTranscription,
  uploadFrame,
  uploadReaction,
  uploadReference,
  updateReactionOffset,
} from "../../lib/api";
import { formatTime } from "./editor-timeline";
import { CaptionSettings, LayoutMode, Platform, useEditorDesign } from "./editor-design-context";

export type EditorTab =
  | "reference"
  | "transcript"
  | "clips"
  | "captions"
  | "headline"
  | "frame"
  | "format"
  | "export";
type Props = {
  project: Project;
  tab: EditorTab;
  start: number;
  end: number;
  mode: "fit" | "crop";
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onModeChange: (mode: "fit" | "crop") => void;
  onTabChange: (tab: EditorTab) => void;
  onSeek: (time: number) => void;
  onSelectRange: (start: number, end: number) => void;
};
type TranscriptRange = { start: number; end: number; title: string } | null;
type MainFormat = "source" | "square" | "portrait" | "fill";
const tabs = [
  { id: "reference" as const, label: "Vorlage", icon: UploadCloud },
  { id: "format" as const, label: "Format", icon: Film },
  { id: "frame" as const, label: "Rahmen", icon: ImagePlus },
  { id: "clips" as const, label: "Smart Cuts", icon: Sparkles },
  { id: "transcript" as const, label: "Transcript", icon: Text },
  { id: "captions" as const, label: "Captions", icon: Captions },
  { id: "headline" as const, label: "Headline", icon: Type },
  { id: "export" as const, label: "Export", icon: Download },
];
const platforms: [Platform, string, string, typeof Smartphone][] = [
  ["tiktok", "TikTok", "9:16 · 1080×1920", Smartphone],
  ["instagram", "Instagram Reel", "9:16 · 1080×1920", Smartphone],
  ["shorts", "YouTube Short", "9:16 · 1080×1920", Smartphone],
  ["youtube", "YouTube Video", "16:9 · 1920×1080", RectangleHorizontal],
];
const layouts: [LayoutMode, string, string][] = [
  ["main_focus", "Main groß", "Hauptvideo dominant · Reaction kompakt oben"],
  ["reaction_top", "Reaction oben", "Reaction groß · Hauptvideo unten"],
  ["main_top", "Hauptvideo oben", "Hauptvideo oben · Reaction unten"],
  [
    "picture_in_picture",
    "Bild-in-Bild",
    "Reaction kompakt über dem Hauptvideo",
  ],
  ["blur_center", "Fokus", "Hauptvideo mittig auf Blur-Hintergrund"],
];
const layoutPreviewFiles: Record<LayoutMode, string> = {
  main_focus: "reaction-top.jpg",
  reaction_top: "reaction-top.jpg",
  main_top: "main-top.jpg",
  picture_in_picture: "picture-in-picture.jpg",
  blur_center: "focus.jpg",
};

function ProcessingButton({
  job,
  label,
  onClick,
}: {
  job: Job | null;
  label: string;
  onClick: () => void;
}) {
  const active = job?.status === "queued" || job?.status === "processing";
  const message = (() => {
    const raw = job?.message ?? "";
    const value = raw.toLowerCase();
    if (value.includes("speech audio") || value.includes("tonspur")) return "Tonspur wird vorbereitet";
    if (value.includes("whisper") || value.includes("spracherkennung")) return "Spracherkennung wird gestartet";
    if (value.includes("transcrib") || value.includes("gesprochene")) return "Gesprochene Stellen werden analysiert";
    if (value.includes("hooks") || value.includes("bewerte")) return "Hooks und starke Momente werden bewertet";
    if (value.includes("highlight") || value.includes("smart cut")) return "Die besten Clips werden zusammengestellt";
    if (value.includes("preview") || value.includes("browser")) return "Videovorschau wird vorbereitet";
    if (job?.status === "queued") return "Analyse wartet kurz auf freie Leistung";
    return raw || "Analyse läuft";
  })();
  return (
    <>
      {active ? (
        <div className="overflow-hidden rounded-[24px] border border-purple/20 bg-[linear-gradient(145deg,rgba(147,0,255,.09),rgba(169,243,222,.2))] p-4 shadow-[0_14px_35px_rgba(32,20,46,.08)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-mint shadow-lg">
              <LoaderCircle className="animate-spin" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-extrabold tracking-[.14em] text-purple">SMART CUT ANALYSE</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-ink shadow-sm">{Math.round(job.progress)}%</span>
              </div>
              <p className="mt-1 text-sm font-bold leading-5 text-ink">{message}</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/80 shadow-inner">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#9300ff,#d44cff,#54d7b4)] transition-[width] duration-500"
              style={{ width: `${Math.max(job.progress, 2)}%` }}
            />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-muted">Bei langen Videos ist die erste Sprachanalyse der größte Schritt.</p>
        </div>
      ) : (
        <button
          onClick={onClick}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-purple px-5 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-.5"
        >
          <WandSparkles size={17} /> {label}
        </button>
      )}
    </>
  );
}

function NextButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-purple"
    >
      {label}
      <ArrowRight size={16} />
    </button>
  );
}

function ReferenceView({
  project,
  onReady,
  onNext,
}: {
  project: Project;
  onReady: (profile: ReferenceStyle) => void;
  onNext: () => void;
}) {
  const [profile, setProfile] = useState<ReferenceStyle | null>(null);
  const [reaction, setReaction] = useState<ReactionSync | null>(null);
  const [styleJob, setStyleJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [timingSaving, setTimingSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([
      getReferenceStyle(project.id).then((saved) => {
        if (saved) {
          setProfile(saved);
          onReady(saved);
        }
      }),
      getReaction(project.id).then((saved) => {
        if (saved) setReaction(saved);
      }),
    ]).catch(() => undefined);
  }, [project.id, onReady]);
  useEffect(() => {
    if (!styleJob || !["queued", "processing"].includes(styleJob.status))
      return;
    const timer = window.setInterval(() => {
      getJob(styleJob.id)
        .then(setStyleJob)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [styleJob]);
  const choose = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const next = await uploadReference(project.id, file);
      setProfile(next);
      onReady(next);
      const transcript = await getTranscript(project.id);
      if (transcript)
        setStyleJob(await startAutoCut(project.id, next.suggested_platform));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Vorlage konnte nicht analysiert werden.",
      );
    } finally {
      setLoading(false);
    }
  };
  const chooseReaction = async (file?: File) => {
    if (!file) return;
    setReactionLoading(true);
    setError("");
    try {
      setReaction(await uploadReaction(project.id, file));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Reaction konnte nicht synchronisiert werden.",
      );
    } finally {
      setReactionLoading(false);
    }
  };
  const saveReactionTiming = async () => {
    if (!reaction) return;
    setTimingSaving(true);
    setError("");
    try {
      setReaction(await updateReactionOffset(project.id, reaction.offset_seconds));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Timing konnte nicht gespeichert werden.");
    } finally {
      setTimingSaving(false);
    }
  };
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[.14em] text-purple">
        SCHRITT 1
      </p>
      <h3 className="mt-2 font-serif text-3xl">Main & Reaction verbinden</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Dein Main-Video ist fertig. Als Nächstes wählst du die separate Aufnahme
        von dir oder deiner Kamera aus. Wir setzen beide Videos automatisch auf
        exakt denselben Moment.
      </p>
      <div className="mt-5 rounded-[22px] border border-mint bg-mint/20 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-mint text-ink">
            <Check size={18} strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-bold tracking-[.14em] text-[#247a61]">1 · MAIN-VIDEO BEREIT</p>
            <p className="mt-1 truncate text-xs font-bold">{project.original_filename}</p>
            <p className="mt-1 text-[10px] text-muted">{project.width}×{project.height} · vollständige Timeline</p>
          </div>
        </div>
      </div>
      <div className="my-2 flex justify-center">
        <span className="h-5 w-px bg-gradient-to-b from-mint to-coral" />
      </div>
      <label
        className={`grid min-h-32 cursor-pointer place-items-center rounded-[22px] border border-dashed p-5 text-center transition-all ${reactionLoading ? "border-coral bg-coral/5" : "border-coral/35 bg-white hover:border-coral"}`}
      >
        <input
          type="file"
          accept=".mp4,.m4v,.mov,.mkv,.webm,video/*"
          className="sr-only"
          disabled={reactionLoading}
          onChange={(event) => void chooseReaction(event.target.files?.[0])}
        />
        {reactionLoading ? (
          <>
            <LoaderCircle className="animate-spin text-coral" size={25} />
            <span className="mt-2 text-xs font-bold">Komplette Timeline wird abgeglichen…</span>
            <span className="mt-1 text-[9px] text-muted">Main und Reaction werden vollständig durchsucht</span>
          </>
        ) : (
          <div>
            <Film className="mx-auto text-coral" size={22} />
            <span className="mt-3 block text-[9px] font-bold tracking-[.14em] text-coral">SCHRITT 2</span>
            <strong className="mt-1 block text-sm">Deine Kamera-/Reaction-Datei auswählen</strong>
            <span className="mx-auto mt-2 block max-w-[230px] text-[10px] leading-4 text-muted">
              Lade hier die Facecam, Podcast-Kamera oder Kommentaraufnahme hoch – nicht noch einmal das Main-Video.
            </span>
            <span className="mt-3 inline-flex rounded-full bg-coral px-4 py-2 text-[10px] font-bold text-white shadow-sm">
              Reaction auswählen
            </span>
          </div>
        )}
      </label>
      {reaction && (
        <div className="mt-3 rounded-[18px] border border-mint bg-mint/20 p-3">
          <p className="text-xs font-bold">
            <Check className="mr-2 inline text-[#247a61]" size={14} />
            Gemeinsame Timeline verbunden
          </p>
          <p className="mt-1 truncate text-[10px] text-muted">
            {reaction.filename} · Versatz {reaction.offset_seconds.toFixed(2)}s · Sicherheit {reaction.confidence}%
          </p>
          <div className="mt-3 border-t border-ink/10 pt-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="reaction-offset" className="text-[10px] font-bold">Timing feinjustieren</label>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold tabular-nums">
                {reaction.offset_seconds > 0 ? "+" : ""}{reaction.offset_seconds.toFixed(1)} s
              </span>
            </div>
            <input
              id="reaction-offset"
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={reaction.offset_seconds}
              onChange={(event) => setReaction({ ...reaction, offset_seconds: Number(event.target.value) })}
              className="mt-2 w-full accent-purple"
            />
            <div className="mt-1 flex justify-between text-[9px] text-muted">
              <span>Reaction früher</span><span>Reaction später</span>
            </div>
            <button
              type="button"
              disabled={timingSaving}
              onClick={() => void saveReactionTiming()}
              className="mt-2 w-full rounded-full bg-white px-3 py-2 text-[10px] font-bold text-ink shadow-sm disabled:opacity-60"
            >
              {timingSaving ? "Speichert…" : "Timing speichern"}
            </button>
          </div>
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="text-[9px] font-bold tracking-[.12em] text-muted">OPTIONALER LOOK</span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>
      <label
        className={`mt-3 grid min-h-32 cursor-pointer place-items-center rounded-[22px] border border-dashed p-5 text-center transition-all ${loading ? "border-purple bg-purple/5" : "border-ink/20 bg-cream/55 hover:border-purple/45"}`}
      >
        <input
          type="file"
          accept=".mp4,.m4v,.mov,.mkv,.webm,video/*"
          className="sr-only"
          disabled={loading}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        {loading ? (
          <LoaderCircle className="animate-spin text-purple" size={26} />
        ) : (
          <div>
            <UploadCloud className="mx-auto text-purple" size={22} />
            <strong className="mt-3 block text-sm">Stilvorlage (optional)</strong>
            <span className="mt-1 block text-[10px] text-muted">
              Schnitt, Länge und Format übernehmen
            </span>
          </div>
        )}
      </label>
      {profile && (
        <div className="mt-3 overflow-hidden rounded-[18px] border border-mint bg-mint/15">
          <div className="flex items-center gap-2 border-b border-mint/60 px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-mint text-ink">
              <Check size={14} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{profile.filename}</p>
              <p className="text-[9px] font-bold tracking-wider text-purple">
                STIL AKTIV ANGEWENDET
              </p>
            </div>
          </div>
          <p className="px-4 pt-3 text-[11px] leading-5 text-muted">
            {profile.style_summary}
          </p>
          <div className="grid grid-cols-3 gap-2 p-3">
            <span className="rounded-xl bg-white px-2 py-2 text-center text-[9px] font-bold">
              <b className="block text-xs text-ink">
                {Math.round(profile.target_clip_duration)}s
              </b>
              Cliplänge
            </span>
            <span className="rounded-xl bg-white px-2 py-2 text-center text-[9px] font-bold">
              <b className="block text-xs text-ink">
                {Math.round(profile.motion_score * 100)}%
              </b>
              Tempo
            </span>
            <span className="rounded-xl bg-white px-2 py-2 text-center text-[9px] font-bold">
              <b className="block truncate text-xs text-ink">
                {profile.recommended_font}
              </b>
              Schrift
            </span>
          </div>
          <p className="border-t border-mint/60 px-4 py-2.5 text-[9px] font-bold text-[#247a61]">
            Format · Schnitttempo · Schrift · Captions übernommen
          </p>
        </div>
      )}
      {styleJob && ["queued", "processing"].includes(styleJob.status) && (
        <div className="mt-4 rounded-2xl bg-purple/[.06] p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-purple">
            <LoaderCircle className="animate-spin" size={13} />
            Beste Cuts werden an die Vorlage angepasst ·{" "}
            {Math.round(styleJob.progress)}%
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-purple/10">
            <div
              className="h-full rounded-full bg-purple transition-all"
              style={{ width: `${styleJob.progress}%` }}
            />
          </div>
        </div>
      )}
      {styleJob?.status === "completed" && (
        <p className="mt-4 rounded-2xl bg-mint/35 px-4 py-3 text-[10px] font-bold text-[#247a61]">
          <Check className="mr-1.5 inline" size={13} />
          Cuts wurden mit dem Vorlagenstil neu erstellt.
        </p>
      )}
      {!styleJob || !["queued", "processing"].includes(styleJob.status) ? (
        <NextButton label="Weiter zum Format" onClick={onNext} />
      ) : null}
      {error && (
        <p className="mt-4 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
          {error}
        </p>
      )}
    </div>
  );
}

function TranscriptView({
  project,
  onSeek,
  range,
  onClearRange,
}: {
  project: Project;
  onSeek: (time: number) => void;
  range: TranscriptRange;
  onClearRange: () => void;
}) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [showCombined, setShowCombined] = useState(false);
  const load = useCallback(
    () =>
      getTranscript(project.id)
        .then(setTranscript)
        .catch((reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : "Transcript konnte nicht geladen werden.",
          ),
        ),
    [project.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      getJob(job.id)
        .then((next) => {
          setJob(next);
          if (next.status === "completed") void load();
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job, load]);
  const start = async () => {
    setError("");
    try {
      setJob(await startTranscription(project.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Transkription konnte nicht starten.",
      );
    }
  };
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("Kopieren wurde vom Browser blockiert.");
    }
  };
  const visibleSegments =
    transcript?.segments.filter(
      (segment) =>
        !range || (segment.end > range.start && segment.start < range.end),
    ) ?? [];
  const visibleText = visibleSegments.map((segment) => segment.text).join(" ");
  return (
    <div>
      <h3 className="font-serif text-3xl">
        {range ? "Clip Transcript" : "Vollständiges Transcript"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        {range
          ? "Hier siehst du exakt die gesprochenen Sätze, die im ausgewählten Clip liegen."
          : "Whisper erkennt jedes gesprochene Segment mit Wort-Zeitstempeln. Ein Klick springt exakt zur Stelle."}
      </p>
      {range && (
        <div className="mt-4 rounded-2xl border border-purple/25 bg-purple/5 p-4">
          <p className="text-xs font-bold text-purple">{range.title}</p>
          <p className="mt-1 text-xs text-muted">
            {formatTime(range.start)} – {formatTime(range.end)} ·{" "}
            {visibleSegments.length} Segmente
          </p>
          <button
            onClick={onClearRange}
            className="mt-3 text-xs font-bold text-ink underline decoration-purple underline-offset-4"
          >
            Ganzes Transcript anzeigen
          </button>
        </div>
      )}
      <div className="mt-5">
        <ProcessingButton
          job={job}
          label={
            transcript
              ? "Transcript neu erstellen"
              : "Gesamtes Video transkribieren"
          }
          onClick={start}
        />
      </div>
      {transcript && (
        <>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-mint/45 px-4 py-3 text-xs font-bold">
            <span>
              {range ? visibleSegments.length : transcript.segments.length}{" "}
              Segmente
            </span>
            <span className="uppercase text-purple">{transcript.language}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => void copy(visibleText, "all")}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink px-3 py-3 text-xs font-bold text-white"
            >
              {copied === "all" ? (
                <ClipboardCheck size={15} />
              ) : (
                <Clipboard size={15} />
              )}{" "}
              {copied === "all" ? "Kopiert" : "Alles kopieren"}
            </button>
            <button
              onClick={() => setShowCombined((value) => !value)}
              className="flex items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-3 text-xs font-bold"
            >
              <List size={15} />
              {showCombined ? "Segmente" : "Gesamttext"}
            </button>
          </div>
          {showCombined ? (
            <textarea
              readOnly
              value={visibleText}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 h-[52vh] w-full resize-none rounded-2xl border border-ink/10 bg-white p-4 text-xs leading-6 outline-none focus:border-purple"
            />
          ) : (
            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {visibleSegments.map((segment, index) => (
                <article
                  key={`${segment.start}-${index}`}
                  className="rounded-2xl border border-ink/8 bg-white p-3 transition-all hover:border-purple/40 hover:bg-purple/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSeek(segment.start)}
                      className="text-[10px] font-bold text-purple hover:underline"
                    >
                      {formatTime(segment.start)}
                    </button>
                    <button
                      aria-label="Segment kopieren"
                      onClick={() =>
                        void copy(segment.text, `${segment.start}`)
                      }
                      className="grid h-7 w-7 place-items-center rounded-full bg-cream text-muted hover:text-purple"
                    >
                      {copied === `${segment.start}` ? (
                        <ClipboardCheck size={13} />
                      ) : (
                        <Clipboard size={13} />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 select-text text-xs leading-5 text-ink">
                    {segment.text}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {(error || job?.error) && (
        <p className="mt-4 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
          {error || job?.error}
        </p>
      )}
    </div>
  );
}

function CutGallery({
  project,
  platform,
  onSelectRange,
  onShowTranscript,
  onNext,
  onPreview,
  onHeadline,
}: {
  project: Project;
  platform: Platform;
  onSelectRange: (start: number, end: number) => void;
  onShowTranscript: (clip: Clip) => void;
  onNext: () => void;
  onPreview: (clip: Clip) => void;
  onHeadline: (value: string) => void;
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const load = useCallback(
    () =>
      getClips(project.id)
        .then(setClips)
        .catch((reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : "Cuts konnten nicht geladen werden.",
          ),
        ),
    [project.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      getJob(job.id)
        .then((next) => {
          setJob(next);
          if (next.status === "completed") void load();
        })
        .catch(() => {
          setJob(null);
          setError("Die vorherige Analyse wurde beendet. Bitte Smart Cut erneut starten.");
        });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job, load]);
  const start = async () => {
    setError("");
    try {
      setJob(await startAutoCut(project.id, platform));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Smart Cut konnte nicht starten.",
      );
    }
  };
  const select = (clip: Clip) => {
    setSelected(clip.id);
    onHeadline(clip.title);
    onSelectRange(clip.start, clip.end);
  };
  const selectedClip = clips.find((clip) => clip.id === selected);
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold tracking-[.14em] text-purple">
            <LayoutGrid size={13} /> SCHRITT 3 · CUT-GALERIE
          </p>
          <h3 className="mt-2 font-serif text-3xl">Deine besten Szenen</h3>
        </div>
        {clips.length > 0 && (
          <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold">
            {clips.length} Cuts
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        Smart Cut übernimmt die Länge und das Tempo deiner Vorlage. Klicke eine
        Karte an, um sie im Editor zu öffnen.
      </p>
      <div className="mt-5">
        <ProcessingButton
          job={job}
          label={clips.length ? "Cuts neu erstellen" : "Cutting starten"}
          onClick={start}
        />
      </div>
      {clips.length > 0 && (
        <div className="mt-5 grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
          {clips.map((clip, index) => {
            const frame = Math.min(
              7,
              Math.max(
                0,
                Math.floor(
                  (clip.start / Math.max(project.duration ?? 1, 1)) * 8,
                ),
              ),
            );
            const active = selected === clip.id;
            return (
              <article
                key={clip.id}
                className={`group overflow-hidden rounded-[18px] border bg-white transition-all ${active ? "border-purple shadow-[0_0_0_2px_rgba(147,0,255,.14)]" : "border-ink/10 hover:border-purple/35"}`}
              >
                <button
                  onClick={() => select(clip)}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-video overflow-hidden bg-ink">
                    <img
                      src={projectMediaUrl(project, `/api/projects/${project.id}/timeline/${frame}`)}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute bottom-2 left-2 rounded-full bg-ink/75 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">
                      {formatTime(clip.start)} – {formatTime(clip.end)}
                    </span>
                    <strong className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] text-ink shadow">
                      {clip.score}
                    </strong>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] font-bold tracking-wider text-purple">
                      CUT {String(index + 1).padStart(2, "0")}
                    </p>
                    <h4 className="mt-1 line-clamp-2 text-xs font-bold leading-4">
                      {clip.title}
                    </h4>
                  </div>
                </button>
                <div className="grid grid-cols-2 border-t border-ink/[.07]">
                  <button
                    onClick={() => select(clip)}
                    className="py-2.5 text-[10px] font-bold text-ink hover:bg-cream"
                  >
                    Öffnen
                  </button>
                  <button
                    onClick={() => onShowTranscript(clip)}
                    className="border-l border-ink/[.07] py-2.5 text-[10px] font-bold text-purple hover:bg-purple/5"
                  >
                    Text
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selectedClip && (
        <button
          onClick={() => onPreview(selectedClip)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-purple px-5 py-3.5 text-sm font-bold text-white"
        >
          <Eye size={16} /> Ergebnis ansehen
        </button>
      )}
      {clips.length > 0 && (
        <NextButton label="Weiter zu Captions" onClick={onNext} />
      )}{" "}
      {clips.length === 0 && !job && (
        <div className="mt-5 grid min-h-40 place-items-center rounded-[22px] border border-dashed border-ink/15 bg-cream/55 p-6 text-center">
          <div>
            <LayoutGrid className="mx-auto text-muted/50" size={24} />
            <p className="mt-3 text-xs font-bold text-muted">
              Nach dem Cutting erscheinen hier alle Vorschläge als anklickbare
              Karten.
            </p>
          </div>
        </div>
      )}
      {(error || job?.error) && (
        <p className="mt-4 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
          {error || job?.error}
        </p>
      )}
    </div>
  );
}

function CaptionsView({
  project,
  value,
  onChange,
}: {
  project: Project;
  value: CaptionSettings;
  onChange: (next: CaptionSettings) => void;
}) {
  const [showLargePreview, setShowLargePreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const styles: { id: CaptionStyle; label: string; sample: string }[] = [
    { id: "minimal", label: "Minimal", sample: "Clean" },
    { id: "bold", label: "Bold", sample: "Impact" },
    { id: "gaming", label: "Gaming", sample: "Energy" },
    { id: "creator", label: "Creator", sample: "Social" },
    { id: "karaoke", label: "Karaoke", sample: "Word Sync" },
    { id: "boxed", label: "Boxed", sample: "Editorial" },
    { id: "neon", label: "Neon", sample: "Night" },
    { id: "documentary", label: "Doku", sample: "Subtle" },
  ];
  const animations: { id: CaptionAnimation; label: string }[] = [
    { id: "none", label: "Ruhig" },
    { id: "pop", label: "Pop" },
    { id: "slide", label: "Slide" },
    { id: "karaoke", label: "Wort-Sync" },
  ];
  const captionClass = `absolute max-w-[90%] select-none whitespace-nowrap rounded-lg px-3 py-2 text-center font-black ${value.animation !== "none" ? `caption-preview-${value.animation}` : ""} ${value.style === "minimal" ? "text-white [text-shadow:0_3px_8px_#000]" : value.style === "bold" ? "text-yellow [text-shadow:0_3px_0_#30103b]" : value.style === "gaming" ? "bg-purple text-white" : value.style === "creator" ? "bg-coral text-white" : value.style === "karaoke" ? "bg-white text-purple" : value.style === "boxed" ? "border-2 border-white bg-cream text-ink" : value.style === "neon" ? "border border-purple bg-[#170d22] text-[#ef66ff] shadow-[0_0_16px_rgba(147,0,255,.5)]" : "bg-black/70 font-serif text-white"}`;
  const sampleCaption = ["Das", "ist", "dein", "Caption", "jetzt"].slice(0, value.words).join(" ");
  const startMove = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); const canvas = previewRef.current; if (!canvas) return;
    const move = (next: PointerEvent) => { const rect = canvas.getBoundingClientRect(); onChange({...value,x:Math.max(5,Math.min(95,((next.clientX-rect.left)/rect.width)*100)),y:Math.max(5,Math.min(95,((next.clientY-rect.top)/rect.height)*100))}); };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); const startX=event.clientX; const startY=event.clientY; const initial=value.size;
    const move = (next: PointerEvent) => onChange({...value,size:Math.round(Math.max(36,Math.min(140,initial+(next.clientX-startX+next.clientY-startY)/3)))});
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const captionPreview = (large = false) => <div ref={large ? previewRef : undefined} className={`relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-[24px] bg-ink bg-cover bg-center ${large ? "max-h-[82vh] max-w-[min(92vw,460px)] touch-none" : ""}`} style={{backgroundImage:`linear-gradient(rgba(18,8,24,.15),rgba(18,8,24,.35)),url(${projectMediaUrl(project, `/api/projects/${project.id}/timeline/1`)})`}}>
    {large && <video src={projectMediaUrl(project, `/api/projects/${project.id}/media`)} poster={projectMediaUrl(project, `/api/projects/${project.id}/timeline/1`)} autoPlay muted loop playsInline className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
    <div className="pointer-events-none absolute inset-[4%] rounded-[18px] border border-dashed border-white/35" />
    <span onPointerDown={large ? startMove : undefined} key={`${value.style}-${value.animation}-${value.uppercase}-${value.words}-${large}`} style={{left:`${value.x}%`,top:`${value.y}%`,transform:"translate(-50%, -50%)",fontSize:`${large ? value.size*.34 : value.size*.24}px`,cursor:large?"move":"default"}} className={`${captionClass} ${large ? "ring-2 ring-white/90 ring-offset-2 ring-offset-purple/40" : ""}`}>{value.uppercase ? sampleCaption.toUpperCase() : sampleCaption}{large && <button type="button" aria-label="Caption-Größe ändern" onPointerDown={startResize} className="absolute -bottom-4 -right-4 grid h-9 w-9 touch-none place-items-center rounded-full border-2 border-white bg-purple text-white shadow-xl"><Maximize2 size={14}/></button>}</span>
    <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[8px] font-bold tracking-wider text-white">9:16 EXPORT · X {value.x}% · Y {value.y}%</span>
  </div>;
  return (
    <div>
      <h3 className="font-serif text-3xl">Smart Captions</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Verwendet echte Whisper-Wortzeiten und brennt lesbare Untertitel direkt
        in das exportierte Video.
      </p>
      <label className="mt-5 flex items-center justify-between rounded-2xl bg-cream p-4 text-sm font-bold">
        Captions exportieren
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
          className="h-5 w-5 accent-purple"
        />
      </label>
      <p className="mt-5 text-xs font-bold">Stil</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onChange({ ...value, style: style.id })}
            className={`relative overflow-hidden rounded-[15px] border p-3 text-left transition-all ${value.style === style.id ? "border-purple bg-purple/[.055] shadow-[0_0_0_1px_rgba(147,0,255,.3)]" : "border-ink/10 bg-white hover:border-purple/25"}`}
          >
            <span className={`block rounded-lg px-2 py-2 text-center text-[11px] font-black ${style.id === "minimal" ? "text-ink" : style.id === "bold" ? "bg-ink text-yellow" : style.id === "gaming" ? "bg-purple text-white" : style.id === "creator" ? "bg-coral text-white" : style.id === "karaoke" ? "bg-ink text-mint" : style.id === "boxed" ? "border border-ink/20 bg-cream text-ink" : style.id === "neon" ? "bg-[#170d22] text-[#ef66ff] shadow-[inset_0_0_10px_rgba(147,0,255,.35)]" : "bg-black/75 font-serif text-white"}`}>{style.sample}</span>
            <strong className="mt-2 block text-[10px]">{style.label}</strong>
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs font-bold">Animation</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {animations.map((animation) => <button key={animation.id} onClick={() => onChange({ ...value, animation: animation.id })} className={`rounded-xl border px-2 py-2.5 text-[9px] font-bold transition-colors ${value.animation === animation.id ? "border-ink bg-ink text-white" : "border-ink/10 bg-white hover:border-purple/30"}`}>{animation.label}</button>)}
      </div>
      <label className="mt-5 block text-xs font-bold">
        Wörter pro Caption: {value.words}
        <input
          type="range"
          min="2"
          max="5"
          value={value.words}
          onChange={(event) =>
            onChange({ ...value, words: Number(event.target.value) })
          }
          className="mt-3 w-full accent-purple"
        />
      </label>
      <label className="mt-4 flex items-center justify-between rounded-2xl border border-ink/10 p-4 text-sm font-bold">
        Großbuchstaben
        <input
          type="checkbox"
          checked={value.uppercase}
          onChange={(event) =>
            onChange({ ...value, uppercase: event.target.checked })
          }
          className="h-5 w-5 accent-purple"
        />
      </label>
      <label className="mt-4 block text-xs font-bold">Textgröße: {value.size}<input type="range" min="36" max="140" value={value.size} onChange={(event) => onChange({...value,size:Number(event.target.value)})} className="mt-3 w-full accent-purple" /></label>
      <p className="mt-4 rounded-2xl bg-mint/25 px-4 py-3 text-[10px] font-bold text-[#176b50]">Position und Größe direkt am Text im großen Canvas verändern.</p>
    </div>
  );
}

function FrameView({
  project,
  mainFormat,
  onMainFormatChange,
  blurStrength,
  onBlurStrengthChange,
  backgroundDim,
  onBackgroundDimChange,
  onNext,
}: {
  project: Project;
  mainFormat: MainFormat;
  onMainFormatChange: (value: MainFormat) => void;
  blurStrength: number;
  onBlurStrengthChange: (value: number) => void;
  backgroundDim: number;
  onBackgroundDimChange: (value: number) => void;
  onNext: () => void;
}) {
  const [frame, setFrame] = useState<{
    filename: string;
    frame_url: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const choose = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setFrame(await uploadFrame(project.id, file));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Rahmen konnte nicht gespeichert werden.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[.14em] text-purple">
        REACTION-DESIGN
      </p>
      <h3 className="mt-2 font-serif text-3xl">Eigener Rahmen</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Lade einen transparenten PNG- oder WebP-Rahmen hoch. Das Reaction-Video
        wird automatisch exakt in die transparente Innenöffnung eingesetzt.
      </p>
      <label className="mt-5 grid min-h-36 cursor-pointer place-items-center rounded-[22px] border border-dashed border-purple/25 bg-purple/[.035] p-5 text-center transition-all hover:border-purple/55">
        <input
          type="file"
          accept=".png,.webp,image/png,image/webp"
          className="sr-only"
          disabled={loading}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        {loading ? (
          <LoaderCircle className="animate-spin text-purple" size={25} />
        ) : (
          <div>
            <ImagePlus className="mx-auto text-purple" size={24} />
            <strong className="mt-3 block text-sm">Rahmen auswählen</strong>
            <span className="mt-1 block text-[10px] text-muted">
              Am besten 1080×844 mit transparentem Zentrum
            </span>
          </div>
        )}
      </label>
      {frame && (
        <div className="mt-3 rounded-2xl border border-mint bg-mint/20 p-3">
          <p className="truncate text-xs font-bold">
            <Check className="mr-2 inline text-[#248c69]" size={14} />
            {frame.filename}
          </p>
          <img
            src={projectMediaUrl(project, frame.frame_url)}
            alt="Hochgeladener Rahmen"
            className="mt-3 max-h-48 w-full rounded-xl bg-ink object-contain"
          />
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-mint bg-mint/20 px-4 py-3">
        <p className="text-xs font-bold text-[#176b50]"><Check className="mr-2 inline" size={14}/>Automatische Rahmen-Passform aktiv</p>
        <p className="mt-1 text-[9px] leading-4 text-muted">Die transparente Innenöffnung wird gemessen und ohne zusätzlichen Größenregler vollständig gefüllt.</p>
      </div>
      <div className="mt-4 rounded-[20px] border border-ink/10 bg-cream p-4">
        <div className="flex items-center justify-between"><p className="text-xs font-bold">Video-Hintergrund</p><span className="text-[9px] font-bold text-purple">LIVE IM EXPORT</span></div>
        <label className="mt-4 block text-[10px] font-bold">Blur-Stärke: {blurStrength}<input type="range" min="1" max="60" value={blurStrength} onChange={(event) => onBlurStrengthChange(Number(event.target.value))} className="mt-2 w-full accent-purple" /></label>
        <label className="mt-4 block text-[10px] font-bold">Abdunklung: {backgroundDim}%<input type="range" min="0" max="70" value={backgroundDim} onChange={(event) => onBackgroundDimChange(Number(event.target.value))} className="mt-2 w-full accent-purple" /></label>
      </div>
      <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10 bg-ink p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
        <div className="relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-[12px] bg-[#392840]">
          <img
            src="/editor-previews/frame-preview.png"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = projectMediaUrl(project, `/api/projects/${project.id}/timeline/1`);
            }}
            alt="Eigene Rahmenvorschau"
            className="h-full w-full object-cover opacity-85"
          />
          <span className="pointer-events-none absolute inset-[7%] rounded-[9px] border-[5px] border-purple/80 shadow-[0_0_14px_rgba(147,0,255,.35),inset_0_0_14px_rgba(147,0,255,.18)]" />
          <span className="absolute bottom-3 left-3 rounded-lg bg-ink/80 px-2 py-1 text-[7px] font-extrabold tracking-[.13em] text-white">REACTION PREVIEW</span>
        </div>
      </div>
      <p className="mt-6 text-xs font-bold">Hauptvideo unten</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">
        Bestimme, wie das Originalvideo im unteren Bereich angezeigt wird.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            ["source", "16:9 Original", "Vollständig auf Blur"],
            ["square", "Quadrat 1:1", "Mittig und kompakt"],
            ["portrait", "Portrait 4:5", "Mehr Fokus in der Mitte"],
            ["fill", "Bereich füllen", "Randlos zugeschnitten"],
          ] as [MainFormat, string, string][]
        ).map(([value, label, detail], index) => (
          <button
            key={value}
            type="button"
            onClick={() => onMainFormatChange(value)}
            className={`rounded-2xl border p-3 text-left transition-all ${mainFormat === value ? "border-purple bg-purple/[.05] shadow-[0_0_0_1px_rgba(147,0,255,.5)]" : "border-ink/10 bg-white hover:border-purple/35"}`}
          >
            <span className="relative grid h-16 place-items-center overflow-hidden rounded-xl bg-ink">
              <img
                src={projectMediaUrl(project, `/api/projects/${project.id}/timeline/${index + 3}`)}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-[2px]"
              />
              <span
                className={`relative block overflow-hidden border border-white/80 bg-ink shadow-md ${value === "source" ? "aspect-video w-[86%]" : value === "square" ? "aspect-square h-[78%]" : value === "portrait" ? "aspect-[4/5] h-[84%]" : "h-full w-full"}`}
              >
                <img
                  src={projectMediaUrl(project, `/api/projects/${project.id}/timeline/${index + 3}`)}
                  alt={`Vorschau: ${label}`}
                  className={`h-full w-full ${value === "source" ? "object-contain" : "object-cover"}`}
                />
              </span>
            </span>
            <strong className="mt-2 block text-[11px]">{label}</strong>
            <small className="mt-0.5 block text-[9px] text-muted">
              {detail}
            </small>
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-4 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
          {error}
        </p>
      )}
      <NextButton label="Weiter zu Smart Cuts" onClick={onNext} />
    </div>
  );
}

function HeadlineView({
  projectId,
  clipStart,
  clipEnd,
  platform,
  text,
  onTextChange,
  enabled,
  onEnabledChange,
  secondaryText,
  onSecondaryTextChange,
  secondaryEnabled,
  onSecondaryEnabledChange,
  style,
  onStyleChange,
  position,
  onPositionChange,
  size,
  onSizeChange,
  font,
  onFontChange,
  textColor,
  onTextColorChange,
  backgroundColor,
  onBackgroundColorChange,
  x,
  y,
  onXChange,
  onYChange,
  secondaryX,
  secondaryY,
  onSecondaryXChange,
  onSecondaryYChange,
  onNext,
}: {
  projectId: string;
  clipStart: number;
  clipEnd: number;
  platform: Platform;
  text: string;
  onTextChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  secondaryText: string;
  onSecondaryTextChange: (value: string) => void;
  secondaryEnabled: boolean;
  onSecondaryEnabledChange: (value: boolean) => void;
  style: HeadlineStyle;
  onStyleChange: (value: HeadlineStyle) => void;
  position: HeadlinePosition;
  onPositionChange: (value: HeadlinePosition) => void;
  size: number;
  onSizeChange: (value: number) => void;
  font: HeadlineFont;
  onFontChange: (value: HeadlineFont) => void;
  textColor: string;
  onTextColorChange: (value: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  x: number;
  y: number;
  onXChange: (value: number) => void;
  onYChange: (value: number) => void;
  secondaryX: number;
  secondaryY: number;
  onSecondaryXChange: (value: number) => void;
  onSecondaryYChange: (value: number) => void;
  onNext: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [showCanvasEditor, setShowCanvasEditor] = useState(false);
  const headlineCanvasRef = useRef<HTMLDivElement>(null);
  const startHeadlineMove = (which: "main" | "reaction", event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); const canvas=headlineCanvasRef.current; if (!canvas) return;
    const move=(next:PointerEvent)=>{const rect=canvas.getBoundingClientRect(); const nextX=Math.max(5,Math.min(95,((next.clientX-rect.left)/rect.width)*100)); const nextY=Math.max(5,Math.min(95,((next.clientY-rect.top)/rect.height)*100)); if(which==="main"){onXChange(nextX);onYChange(nextY);}else{onSecondaryXChange(nextX);onSecondaryYChange(nextY);}};
    const stop=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",stop);}; window.addEventListener("pointermove",move);window.addEventListener("pointerup",stop);
  };
  const startHeadlineResize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); const startX=event.clientX; const startY=event.clientY; const initial=size;
    const move=(next:PointerEvent)=>onSizeChange(Math.round(Math.max(36,Math.min(110,initial+(next.clientX-startX+next.clientY-startY)/3))));
    const stop=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",stop);}; window.addEventListener("pointermove",move);window.addEventListener("pointerup",stop);
  };
  const headlineWords = text.trim().split(/\s+/).filter(Boolean);
  const buildPreviewLines = (value: string) => {
    const lines: string[] = [];
    for (const manualLine of value.split(/\r?\n/)) {
      const words = manualLine.trim().split(/\s+/).filter(Boolean);
      for (let index = 0; index < words.length; index += 3) {
        const chunk = words.slice(index, index + 3);
        if (chunk.length) {
          lines.push(chunk.join(" "));
        }
      }
    }
    return lines;
  };
  const previewLines = buildPreviewLines(text);
  const previewText = previewLines.join("\n");
  const previewFontSize = Math.max(13, Math.min(20, size * 0.22));
  const longestPreviewLine = Math.max(
    8,
    ...previewLines.map((line) => line.length),
  );
  const preferredBadgeWidth = Math.ceil(
    longestPreviewLine * previewFontSize * 0.62 + 36,
  );
  const updateHeadline = (value: string) => {
    onTextChange(value);
    if (value.trim()) onEnabledChange(true);
  };
  const updateSecondaryHeadline = (value: string) => {
    onSecondaryTextChange(value);
    if (value.trim()) onSecondaryEnabledChange(true);
  };
  const styles: [HeadlineStyle, string, string][] = [
    ["clean", "Clean", "Weiche, runde Creator-Fläche"],
    ["dark", "Dark", "Dunkler Social-Media-Look"],
    ["capsule", "Capsule", "Komplett runde Pillenform"],
    ["bubble", "Bubble", "Moderne asymmetrische Kurve"],
    ["glass", "Glass", "Transparenter Insta-Look"],
    ["minimal", "Minimal", "Freier Text ohne Fläche"],
  ];
  const fonts: HeadlineFont[] = [
    "Montserrat",
    "Anton",
    "Bebas Neue",
    "Inter",
    "Archivo Black",
    "Bangers",
    "Pacifico",
    "Permanent Marker",
  ];
  const fontCss: Record<HeadlineFont, string> = {
    Montserrat: "Montserrat, sans-serif",
    Anton: "Anton, sans-serif",
    "Bebas Neue": '"Bebas Neue", sans-serif',
    Inter: "Inter, sans-serif",
    "Archivo Black": '"Archivo Black", sans-serif',
    Bangers: "Bangers, sans-serif",
    Pacifico: "Pacifico, cursive",
    "Permanent Marker": '"Permanent Marker", cursive',
  };
  const colorPresets = [
    ["#EF1F1F", "#FFFFFF"],
    ["#FFFFFF", "#171019"],
    ["#FFE600", "#171019"],
    ["#171019", "#B8FFE8"],
    ["#FFFFFF", "#9300FF"],
  ];
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[.14em] text-purple">
        SCHRITT 5
      </p>
      <h3 className="mt-2 font-serif text-3xl">Headline gestalten</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Zwei unabhängige Hooks: einer beschreibt das Hauptvideo, der zweite die
        Reaction. Beide lassen sich pixelgenau verschieben.
      </p>
      <button type="button" disabled={generating || clipEnd <= clipStart} onClick={async () => { setGenerating(true); setAiError(""); try { const result = await generateHeadlines(projectId, clipStart, clipEnd, platform); onTextChange(result.main_headline); onSecondaryTextChange(result.reaction_headline); onEnabledChange(true); onSecondaryEnabledChange(true); } catch (reason) { setAiError(reason instanceof Error ? reason.message : "KI-Titel konnten nicht erstellt werden."); } finally { setGenerating(false); } }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#9300ff,#d44cff)] px-4 py-3 text-xs font-bold text-white shadow-lg disabled:opacity-60">{generating ? <LoaderCircle className="animate-spin" size={15}/> : <WandSparkles size={15}/>} Beide Titel aus dem Clip erstellen</button>
      {aiError && <p className="mt-2 rounded-xl bg-coral/10 p-3 text-[10px] font-bold text-coral">{aiError}</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => onEnabledChange(!enabled)} className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${enabled ? "bg-mint/45 text-[#176b50]" : "bg-cream text-muted"}`}>{enabled ? "Headline 1 sichtbar" : "Headline 1 aus"}</button>
        <button type="button" onClick={() => { onTextChange(""); onEnabledChange(false); }} className="flex items-center gap-1.5 rounded-full border border-coral/20 px-3 py-2 text-[10px] font-bold text-coral"><Trash2 size={13}/> Löschen</button>
      </div>
      <label className="mt-5 block text-xs font-bold">
        1 · Hauptvideo-Headline
        <textarea
          maxLength={90}
          value={text}
          onChange={(event) => updateHeadline(event.target.value)}
          placeholder="Zum Beispiel: 500K MIT NUR EINEM PRODUKT?!"
          className="mt-2 h-24 w-full resize-none rounded-2xl border border-ink/10 bg-white p-4 text-sm font-bold outline-none focus:border-purple"
        />
      </label>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
        <span>Enter setzt eine neue Zeile</span>
        <span>{headlineWords.length} Wörter</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => onSecondaryEnabledChange(!secondaryEnabled)} className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${secondaryEnabled ? "bg-mint/45 text-[#176b50]" : "bg-cream text-muted"}`}>{secondaryEnabled ? "Headline 2 sichtbar" : "Headline 2 aus"}</button>
        <button type="button" onClick={() => { onSecondaryTextChange(""); onSecondaryEnabledChange(false); }} className="flex items-center gap-1.5 rounded-full border border-coral/20 px-3 py-2 text-[10px] font-bold text-coral"><Trash2 size={13}/> Löschen</button>
      </div>
      <label className="mt-4 block text-xs font-bold">
        2 · Reaction-Headline
        <textarea maxLength={120} value={secondaryText} onChange={(event) => updateSecondaryHeadline(event.target.value)} placeholder="Zum Beispiel: DAMIT HAT ER NICHT GERECHNET" className="mt-2 h-20 w-full resize-none rounded-2xl border border-ink/10 bg-white p-4 text-sm font-bold outline-none focus:border-purple" />
      </label>
      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold">Headline-Stil</p>
          <p className="mt-1 text-[10px] text-muted">Wähle den Look des Hooks</p>
        </div>
        <span className="rounded-full bg-purple/10 px-2.5 py-1 text-[9px] font-bold text-purple">
          LIVE
        </span>
      </div>
      <div className="no-scrollbar mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
        {styles.map(([value, label, detail]) => (
          <button
            key={value}
            type="button"
            onClick={() => onStyleChange(value)}
            className={`group relative min-w-[148px] snap-start overflow-hidden rounded-[22px] border p-2.5 text-left transition-all duration-300 ${style === value ? "-translate-y-0.5 border-purple shadow-[0_12px_28px_rgba(147,0,255,.16)]" : "border-ink/10 bg-white hover:-translate-y-0.5 hover:border-purple/30"}`}
          >
            <span
              className={`relative flex min-h-24 items-center justify-center overflow-hidden rounded-[16px] px-3 text-center text-[12px] font-black ${value === "clean" || value === "capsule" ? "bg-[radial-gradient(circle_at_top,#fff,#dedde2)] text-[#d71919]" : value === "dark" || value === "bubble" ? "bg-[radial-gradient(circle_at_top,#4e2858,#160d1a)] text-white" : "bg-[linear-gradient(145deg,#9b7ba6,#392840)] text-white"}`}
            >
              <span className={`${value === "minimal" ? "bg-transparent [text-shadow:0_2px_7px_#000]" : value === "capsule" ? "rounded-full bg-white px-4 py-2 shadow-lg" : value === "bubble" ? "rounded-[18px] rounded-bl-[5px] bg-[#9300ff] px-3 py-2 shadow-lg" : value === "glass" ? "rounded-[18px] border border-white/35 bg-white/20 px-3 py-2 shadow-lg backdrop-blur-md" : value === "dark" ? "rounded-xl bg-black/45 px-3 py-2 shadow-lg" : "rounded-xl bg-[#eeeeee] px-3 py-2 shadow-lg"}`}>
                DEINE<br />HEADLINE
              </span>
              {style === value && (
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-purple text-white shadow-lg">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </span>
            <strong className="mt-3 block text-xs">{label}</strong>
            <small className="mt-1 block text-[9px] leading-4 text-muted">
              {detail}
            </small>
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-[22px] border border-ink/[.08] bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold">Eigene Farben</p>
            <p className="mt-1 text-[10px] text-muted">Direkt in Vorschau und Export</p>
          </div>
          <div className="flex -space-x-1">
            <span className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ backgroundColor }} />
            <span className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ backgroundColor: textColor }} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="rounded-2xl bg-cream p-3 text-[10px] font-bold">
            Textfarbe
            <span className="mt-2 flex items-center gap-2 font-mono text-[9px] text-muted">
              <input
                type="color"
                value={textColor}
                onChange={(event) => onTextColorChange(event.target.value.toUpperCase())}
                className="h-9 w-9 cursor-pointer rounded-xl border-0 bg-transparent p-0"
              />
              {textColor}
            </span>
          </label>
          <label className="rounded-2xl bg-cream p-3 text-[10px] font-bold">
            Hintergrund
            <span className="mt-2 flex items-center gap-2 font-mono text-[9px] text-muted">
              <input
                type="color"
                value={backgroundColor}
                onChange={(event) => onBackgroundColorChange(event.target.value.toUpperCase())}
                className="h-9 w-9 cursor-pointer rounded-xl border-0 bg-transparent p-0"
              />
              {backgroundColor}
            </span>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          {colorPresets.map(([foreground, background]) => (
            <button
              key={`${foreground}-${background}`}
              type="button"
              aria-label={`Farben ${foreground} auf ${background}`}
              onClick={() => {
                onTextColorChange(foreground);
                onBackgroundColorChange(background);
              }}
              className="relative h-8 flex-1 overflow-hidden rounded-full border border-ink/10 shadow-sm transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: background }}
            >
              <span className="absolute inset-y-0 left-1/2 w-1/2" style={{ backgroundColor: foreground }} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#211126,#4a1f54)] p-4 text-white shadow-[0_16px_36px_rgba(32,20,46,.18)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold tracking-[.16em] text-white/55">AKTIVE SCHRIFT</p>
            <p className="mt-1 text-sm font-bold">{font}</p>
          </div>
          <span
            style={{ fontFamily: fontCss[font] }}
            className="grid h-14 w-20 place-items-center rounded-2xl bg-white/10 text-3xl"
          >
            Aa
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold">Schrift auswählen</p>
          <p className="mt-1 text-[10px] text-muted">Tippe auf eine Vorschau</p>
        </div>
        <span className="text-[10px] font-bold text-purple">{fonts.length} Fonts</span>
      </div>
      <div className="relative mt-3 overflow-hidden rounded-[22px] border border-ink/[.08] bg-cream/55 p-2">
        <div className="no-scrollbar grid max-h-[310px] grid-cols-2 gap-2 overflow-y-auto pr-0.5">
          {fonts.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onFontChange(value)}
              className={`relative min-h-24 overflow-hidden rounded-[18px] border bg-white p-3 text-left transition-all duration-300 ${font === value ? "border-purple shadow-[0_9px_22px_rgba(147,0,255,.14)]" : "border-ink/[.07] hover:-translate-y-0.5 hover:border-purple/30"}`}
            >
              <span
                style={{ fontFamily: fontCss[value] }}
                className={`block truncate text-2xl ${font === value ? "text-purple" : "text-ink"}`}
              >
                Aa
              </span>
              <span className="mt-3 block truncate font-sans text-[10px] font-bold text-muted">
                {value}
              </span>
              {font === value && (
                <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-purple text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 h-8 rounded-b-[16px] bg-gradient-to-t from-cream/90 to-transparent" />
      </div>
      <label className="mt-4 block text-xs font-bold">
        Größe: {size}
        <input
          type="range"
          min="36"
          max="110"
          value={size}
          onChange={(event) => onSizeChange(Number(event.target.value))}
          className="mt-3 w-full accent-purple"
        />
      </label>
      <p className="mt-4 rounded-2xl bg-mint/25 px-4 py-3 text-[10px] font-bold text-[#176b50]">Beide Headlines direkt im großen Canvas auswählen, verschieben und skalieren.</p>
      <NextButton label="Weiter zum Export" onClick={onNext} />
    </div>
  );
}

export function ToolPanel({
  project,
  tab,
  start,
  end,
  mode,
  panelOpen,
  onPanelOpenChange,
  onModeChange,
  onTabChange,
  onSeek,
  onSelectRange,
}: Props) {
  const [fps, setFps] = useState<"original" | "30" | "60">("original");
  const [filename, setFilename] = useState("clipforge-short");
  const {platform,setPlatform,layout,setLayout,captions,setCaptions,headline,setHeadline,secondaryHeadline,setSecondaryHeadline,headlineEnabled,setHeadlineEnabled,secondaryHeadlineEnabled,setSecondaryHeadlineEnabled,ownerSafeLayout,setOwnerSafeLayout,headlineStyle,setHeadlineStyle,headlinePosition,setHeadlinePosition,headlineSize,setHeadlineSize,headlineFont,setHeadlineFont,headlineTextColor,setHeadlineTextColor,headlineBackgroundColor,setHeadlineBackgroundColor,headlineX,setHeadlineX,headlineY,setHeadlineY,secondaryHeadlineX,setSecondaryHeadlineX,secondaryHeadlineY,setSecondaryHeadlineY,blurStrength,setBlurStrength,backgroundDim,setBackgroundDim,mainX,setMainX,mainY,setMainY,mainScale,setMainScale,reactionX,setReactionX,reactionY,setReactionY,reactionScale,setReactionScale,frameX,setFrameX,frameY,setFrameY,frameScale,setFrameScale}=useEditorDesign();
  const chooseLayout = (value: LayoutMode) => { setLayout(value); setMainScale(1); setReactionScale(1); setFrameScale(1); if(value==='reaction_top'||value==='main_focus'){setMainX(50);setMainY(72);setReactionX(50);setReactionY(18);setFrameX(50);setFrameY(18);}else if(value==='main_top'){setMainX(50);setMainY(22);setReactionX(50);setReactionY(72);setFrameX(50);setFrameY(72);}else if(value==='picture_in_picture'){setMainX(50);setMainY(50);setReactionX(79);setReactionY(18);setFrameX(79);setFrameY(18);}else{setMainX(50);setMainY(50);setReactionX(50);setReactionY(50);setFrameX(50);setFrameY(50);} };
  const [mainFormat, setMainFormat] = useState<MainFormat>("source");
  const [isOwner, setIsOwner] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [transcriptRange, setTranscriptRange] = useState<TranscriptRange>(null);
  useEffect(() => {
    void getOwnerIdentity().then((owner) => { setIsOwner(owner); setOwnerSafeLayout(owner); }).catch(() => { setIsOwner(false); setOwnerSafeLayout(false); });
  }, []);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      getJob(job.id)
        .then(setJob)
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job]);
  const applyProfile = useCallback(
    (profile: ReferenceStyle) => {
      setPlatform(profile.suggested_platform);
      setLayout(
        profile.suggested_platform === "youtube"
          ? "blur_center"
          : "reaction_top",
      );
      onModeChange(profile.width / profile.height > 1.45 ? "fit" : "crop");
      setCaptions({
        enabled: true,
        style:
          profile.text_activity > 0.16
            ? "creator"
            : profile.motion_score > 0.2
              ? "gaming"
              : "bold",
        uppercase: ["Anton", "Bebas Neue"].includes(profile.recommended_font),
        words: profile.motion_score > 0.16 ? 3 : 4,
        animation: profile.motion_score > 0.2 ? "pop" : "slide",
        x: 50,
        y: 68,
        size: 88,
      });
    },
    [onModeChange],
  );
  const renderOptions = (
    clipStart: number,
    clipEnd: number,
    title = headline,
  ) =>
    ({
      start: clipStart,
      end: clipEnd,
      mode,
      fps,
      filename,
      captions: captions.enabled,
      caption_style: captions.style,
      caption_uppercase: captions.uppercase,
      words_per_caption: captions.words,
      caption_animation: captions.animation,
      caption_x: captions.x,
      caption_y: captions.y,
      caption_size: captions.size,
      platform,
      layout,
      headline: headlineEnabled ? title : "",
      headline_style: headlineStyle,
      headline_position: headlinePosition,
      headline_size: headlineSize,
      headline_font: headlineFont,
      headline_text_color: headlineTextColor,
      headline_background_color: headlineBackgroundColor,
      headline_x: headlineX,
      headline_y: headlineY,
      secondary_headline: secondaryHeadlineEnabled ? secondaryHeadline : "",
      secondary_headline_x: secondaryHeadlineX,
      secondary_headline_y: secondaryHeadlineY,
      blur_strength: blurStrength,
      background_dim: backgroundDim,
      main_x: mainX,
      main_y: mainY,
      main_scale: mainScale,
      reaction_x: reactionX,
      reaction_y: reactionY,
      reaction_scale: reactionScale,
      frame_x: frameX,
      frame_y: frameY,
      frame_scale: frameScale,
      social_safe_layout: isOwner && ownerSafeLayout,
      main_format: mainFormat,
      include_reaction: true,
      font_family: "auto",
    }) as const;
  const startRender = async () => {
    setError("");
    try {
      setJob(await renderClip(project.id, renderOptions(start, end)));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Export fehlgeschlagen.",
      );
    }
  };
  const previewClip = async (clip: Clip) => {
    setHeadline(clip.title);
    setHeadlineEnabled(true);
    setHeadlineStyle("clean");
    setHeadlineTextColor("#EF1F1F");
    setHeadlineBackgroundColor("#FFFFFF");
    setPreviewOpen(true);
    setError("");
    try {
      setJob(
        await renderClip(
          project.id,
          renderOptions(clip.start, clip.end, clip.title),
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Vorschau fehlgeschlagen.",
      );
    }
  };
  return (
    <>
      {previewOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[28px] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-[.14em] text-purple">
                  ERGEBNIS-VORSCHAU
                </p>
                <h3 className="font-serif text-2xl">
                  So ist dein Video geworden
                </h3>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full bg-cream"
              >
                <X size={18} />
              </button>
            </div>
            {job?.status === "completed" && job.output_url ? (
              <video
                src={projectMediaUrl(project, job.output_url)}
                controls
                autoPlay
                className="max-h-[72vh] w-full rounded-2xl bg-black object-contain"
              />
            ) : (
              <div className="grid min-h-[420px] place-items-center rounded-2xl bg-ink text-center text-white">
                <div>
                  <LoaderCircle className="mx-auto animate-spin" size={30} />
                  <p className="mt-4 text-sm font-bold">
                    Vorschau wird gerendert · {Math.round(job?.progress ?? 0)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/95 p-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(32,20,46,.08)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:col-start-1 lg:row-start-1 lg:border-r lg:border-t-0 lg:bg-white/55 lg:p-2 lg:shadow-none xl:p-3">
        <nav className="no-scrollbar flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                onTabChange(id);
                onPanelOpenChange(true);
              }}
              className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-bold transition-all lg:gap-3 lg:rounded-2xl lg:py-3 lg:text-sm xl:px-4 ${tab === id ? "bg-ink text-white shadow-lg" : "text-muted hover:bg-white hover:text-ink"}`}
            >
              {tab === id && (
                <span className="absolute -top-1.5 h-1 w-7 rounded-b-full bg-purple lg:-left-3 lg:top-auto lg:h-7 lg:w-1 lg:rounded-r-full" />
              )}
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      {!panelOpen && (
        <button
          aria-label="Werkzeuge einblenden"
          onClick={() => onPanelOpenChange(true)}
          className="fixed right-3 top-[76px] z-40 grid h-11 w-11 place-items-center rounded-full bg-ink text-white shadow-xl sm:top-[84px] lg:top-24"
        >
          <PanelRightOpen size={18} />
        </button>
      )}
      <aside
        className={`fixed bottom-0 right-0 top-16 z-40 w-full max-w-full overflow-y-auto border-l border-ink/10 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[-18px_0_50px_rgba(32,20,46,.12)] transition-all duration-300 sm:top-[72px] sm:w-[min(92vw,420px)] lg:relative lg:inset-auto lg:z-auto lg:col-start-3 lg:row-start-1 lg:w-auto lg:max-h-[calc(100vh-78px)] lg:shadow-none xl:p-6 ${panelOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"}`}
      >
        <div className="sticky top-0 z-10 mb-4 flex justify-end bg-white/95 pb-2 backdrop-blur">
          <button
            aria-label="Werkzeuge einklappen"
            onClick={() => onPanelOpenChange(false)}
            className="flex items-center gap-2 rounded-full border border-ink/10 bg-cream px-3 py-2 text-[10px] font-bold text-muted hover:text-ink"
          >
            <PanelRightClose size={15} /> Einklappen
          </button>
        </div>
        <div>
          {tab === "reference" && (
            <ReferenceView
              project={project}
              onReady={applyProfile}
              onNext={() => onTabChange("format")}
            />
          )}{" "}
          {tab === "transcript" && (
            <div>
              <TranscriptView
                project={project}
                onSeek={onSeek}
                range={transcriptRange}
                onClearRange={() => setTranscriptRange(null)}
              />
              <NextButton
                label="Weiter zu Captions"
                onClick={() => onTabChange("captions")}
              />
            </div>
          )}{" "}
          {tab === "clips" && (
            <CutGallery
              project={project}
              platform={platform}
              onSelectRange={onSelectRange}
              onShowTranscript={(clip) => {
                setTranscriptRange({
                  start: clip.start,
                  end: clip.end,
                  title: clip.title,
                });
                onSelectRange(clip.start, clip.end);
                onTabChange("transcript");
              }}
              onNext={() => onTabChange("captions")}
              onPreview={(clip) => void previewClip(clip)}
              onHeadline={(value) => {
                setHeadline(value);
                setHeadlineEnabled(true);
                setHeadlineStyle("clean");
                setHeadlineTextColor("#EF1F1F");
                setHeadlineBackgroundColor("#FFFFFF");
              }}
            />
          )}{" "}
          {tab === "captions" && (
            <div>
              <CaptionsView project={project} value={captions} onChange={setCaptions} />
              <NextButton
                label="Weiter zur Headline"
                onClick={() => onTabChange("headline")}
              />
            </div>
          )}{" "}
          {tab === "headline" && (
            <HeadlineView
              projectId={project.id}
              clipStart={start}
              clipEnd={end}
              platform={platform}
              text={headline}
              onTextChange={setHeadline}
              enabled={headlineEnabled}
              onEnabledChange={setHeadlineEnabled}
              secondaryText={secondaryHeadline}
              onSecondaryTextChange={setSecondaryHeadline}
              secondaryEnabled={secondaryHeadlineEnabled}
              onSecondaryEnabledChange={setSecondaryHeadlineEnabled}
              style={headlineStyle}
              onStyleChange={(value) => {
                setHeadlineStyle(value);
                if (value === "clean") {
                  setHeadlineTextColor("#EF1F1F");
                  setHeadlineBackgroundColor("#FFFFFF");
                } else if (value === "dark") {
                  setHeadlineTextColor("#FFFFFF");
                  setHeadlineBackgroundColor("#171019");
                } else if (value === "capsule") {
                  setHeadlineTextColor("#EF1F1F");
                  setHeadlineBackgroundColor("#FFFFFF");
                } else if (value === "bubble") {
                  setHeadlineTextColor("#FFFFFF");
                  setHeadlineBackgroundColor("#9300FF");
                } else if (value === "glass") {
                  setHeadlineTextColor("#FFFFFF");
                  setHeadlineBackgroundColor("#24132B");
                } else {
                  setHeadlineTextColor("#FFFFFF");
                }
              }}
              position={headlinePosition}
              onPositionChange={setHeadlinePosition}
              size={headlineSize}
              onSizeChange={setHeadlineSize}
              font={headlineFont}
              onFontChange={setHeadlineFont}
              textColor={headlineTextColor}
              onTextColorChange={setHeadlineTextColor}
              backgroundColor={headlineBackgroundColor}
              onBackgroundColorChange={setHeadlineBackgroundColor}
              x={headlineX}
              y={headlineY}
              onXChange={setHeadlineX}
              onYChange={setHeadlineY}
              secondaryX={secondaryHeadlineX}
              secondaryY={secondaryHeadlineY}
              onSecondaryXChange={setSecondaryHeadlineX}
              onSecondaryYChange={setSecondaryHeadlineY}
              onNext={() => onTabChange("export")}
            />
          )}
          {tab === "frame" && (
            <FrameView
              project={project}
              mainFormat={mainFormat}
              onMainFormatChange={setMainFormat}
              blurStrength={blurStrength}
              onBlurStrengthChange={setBlurStrength}
              backgroundDim={backgroundDim}
              onBackgroundDimChange={setBackgroundDim}
              onNext={() => onTabChange("clips")}
            />
          )}
          {tab === "format" && (
            <div>
              <p className="text-[10px] font-bold tracking-[.14em] text-purple">
                SCHRITT 2
              </p>
              <h3 className="mt-2 font-serif text-3xl">Format & Aufbau</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Wähle Plattform, Bildfüllung und wie Haupt- und Reaction-Video
                zusammenspielen.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {platforms.map(([value, label, detail, Icon]) => (
                  <button
                    key={value}
                    onClick={() => setPlatform(value)}
                    className={`rounded-[18px] border p-3 text-left transition-all ${platform === value ? "border-purple bg-purple/[.06] shadow-[0_0_0_1px_rgba(147,0,255,.7)]" : "border-ink/10 bg-white hover:border-ink/25"}`}
                  >
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-xl ${platform === value ? "bg-purple text-white" : "bg-cream text-muted"}`}
                    >
                      <Icon size={17} />
                    </span>
                    <strong className="mt-3 block text-xs">{label}</strong>
                    <span className="mt-1 block text-[9px] font-semibold text-muted">
                      {detail}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-6 border-t border-ink/[.08] pt-5">
                <p className="text-[10px] font-bold tracking-[.14em] text-muted">
                  BILDFÜLLUNG
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {(["crop", "fit"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => onModeChange(value)}
                      className={`rounded-[18px] border px-3 py-4 text-left transition-all ${mode === value ? "border-ink bg-ink text-white" : "border-ink/10 bg-white hover:border-ink/25"}`}
                    >
                      <span
                        className={`block border-2 ${platform === "youtube" ? "h-8 w-14 rounded-md" : "h-14 w-8 rounded-lg"} ${mode === value ? "border-white/70 bg-white/15" : "border-ink/20 bg-cream"}`}
                      />
                      <strong className="mt-3 block text-xs">
                        {value === "crop" ? "Ausfüllen" : "Einpassen"}
                      </strong>
                      <span
                        className={`mt-1 block text-[9px] ${mode === value ? "text-white/60" : "text-muted"}`}
                      >
                        {value === "crop"
                          ? "Randlos zugeschnitten"
                          : "Ganzes Bild sichtbar"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 border-t border-ink/[.08] pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold tracking-[.14em] text-muted">
                    REACTION-LAYOUT
                  </p>
                  <span className="rounded-full bg-mint/35 px-2.5 py-1 text-[9px] font-bold">
                    Live im Ergebnis
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {layouts.map(([value, label, detail], index) => (
                    <button
                      key={value}
                    onClick={() => chooseLayout(value)}
                      className={`rounded-[18px] border p-3 text-left transition-all ${layout === value ? "border-purple bg-purple/[.05] shadow-[0_0_0_1px_rgba(147,0,255,.65)]" : "border-ink/10 bg-white hover:border-ink/25"}`}
                    >
                      <span className={`relative grid h-24 w-full overflow-hidden rounded-xl border bg-ink ${layout === value ? "border-purple/50" : "border-ink/10"}`}>
                        <img
                          src={`/editor-previews/layouts/${layoutPreviewFiles[value]}`}
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = projectMediaUrl(project, `/api/projects/${project.id}/timeline/${index + 2}`);
                          }}
                          alt={`Vorschau für ${label}`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent" />
                        <span className="absolute bottom-2 left-2 rounded-md bg-ink/75 px-1.5 py-1 text-[6px] font-extrabold tracking-[.1em] text-white backdrop-blur-sm">{value === "picture_in_picture" ? "PIP" : value === "blur_center" ? "FOCUS" : value === "main_focus" ? "MAIN + REACTION" : value === "reaction_top" ? "REACTION ↑" : "MAIN ↑"}</span>
                      </span>
                      <strong className="mt-2.5 block text-xs">{label}</strong>
                      <span className="mt-1 block text-[9px] leading-4 text-muted">
                        {detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {isOwner && platform !== "youtube" && (
                <div className="mt-6 rounded-[22px] border border-purple/20 bg-[linear-gradient(135deg,rgba(147,0,255,.08),rgba(184,255,232,.24))] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black tracking-[.16em] text-purple">OWNER SAFE-ZONE</p>
                      <p className="mt-1 text-sm font-bold">TikTok & Instagram freihalten</p>
                      <p className="mt-1 text-[10px] leading-4 text-muted">Reaction bündig ganz oben, Hauptvideo höher und unten Platz für App-Captions und Buttons.</p>
                    </div>
                    <button type="button" role="switch" aria-checked={ownerSafeLayout} onClick={() => { const enabled = !ownerSafeLayout; setOwnerSafeLayout(enabled); if (enabled) chooseLayout("reaction_top"); }} className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${ownerSafeLayout ? "bg-purple" : "bg-ink/15"}`}>
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${ownerSafeLayout ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                </div>
              )}
              <NextButton
                label="Weiter zum Rahmen"
                onClick={() => onTabChange("frame")}
              />
            </div>
          )}
          {tab === "export" && (
            <div>
              <h3 className="font-serif text-3xl">Video exportieren</h3>
              <div className="mt-5 rounded-[20px] border border-ink/[.07] bg-cream/70 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Plattform</span>
                  <strong>
                    {platforms.find((item) => item[0] === platform)?.[1]}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Länge</span>
                  <strong>{formatTime(end - start)}</strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Auflösung</span>
                  <strong>
                    {platform === "youtube" ? "1920×1080" : "1080×1920"}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Layout</span>
                  <strong>
                    {layouts.find((item) => item[0] === layout)?.[1]}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Captions</span>
                  <strong>{captions.enabled ? captions.style : "Aus"}</strong>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span className="text-muted">Headline</span>
                  <button
                    onClick={() => onTabChange("headline")}
                    className="max-w-[65%] truncate text-right font-bold text-purple"
                  >
                    {headline || "Aus"} · {headlineStyle}
                  </button>
                </div>
              </div>
              <label className="mt-5 block text-xs font-bold">
                Dateiname
                <input
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-purple"
                />
              </label>
              <label className="mt-4 block text-xs font-bold">
                Bildrate
                <select
                  value={fps}
                  onChange={(event) => setFps(event.target.value as typeof fps)}
                  className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  <option value="original">Original</option>
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </label>
              <button
                disabled={
                  job?.status === "queued" || job?.status === "processing"
                }
                onClick={startRender}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-purple px-5 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {job?.status === "processing" ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <Download size={17} />
                )}{" "}
                {job?.status === "processing"
                  ? `Rendering ${Math.round(job.progress)}%`
                  : "Video rendern"}
              </button>
              {job?.status === "processing" && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full bg-purple transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}
              {job?.status === "completed" && job.output_url && (
                <a
                  href={projectMediaUrl(project, job.output_url)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-full bg-mint px-5 py-3.5 text-sm font-bold text-ink"
                  download
                >
                  <Check size={17} /> Fertiges MP4 herunterladen
                </a>
              )}
              {(error || job?.error) && (
                <p className="mt-4 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
                  {error || job?.error}
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
