"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3, Focus, Minus, Pause, Play, Plus, RotateCcw, Scissors,
} from "lucide-react";
import { Clip, Project, getClips, projectMediaUrl } from "../../lib/api";

type TimelineProps = {
  project: Project;
  start: number;
  end: number;
  currentTime: number;
  playing: boolean;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  onSeek: (value: number) => void;
  onPlaySelection: () => void;
  onSelectAll: () => void;
};

export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function EditorTimeline({
  project, start, end, currentTime, playing,
  onStartChange, onEndChange, onSeek, onPlaySelection, onSelectAll,
}: TimelineProps) {
  const duration = project.duration ?? 1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ x: number; y: number; time: number } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => getClips(project.id).then((next) => {
      if (active) setClips(next);
    }).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [project.id]);

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;
  const currentPercent = Math.min((currentTime / duration) * 100, 100);
  const activeClip = clips.find(
    (clip) => Math.abs(clip.start - start) < 0.2 && Math.abs(clip.end - end) < 0.2,
  );
  const markers = useMemo(
    () => clips.slice().sort((a, b) => a.start - b.start),
    [clips],
  );
  const setZoomLevel = (next: number) => {
    setZoom(Math.min(3, Math.max(1, next)));
    if (next <= 1 && viewportRef.current) viewportRef.current.scrollLeft = 0;
  };
  const timeFromPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * duration));
  };
  const selectClip = (clip: Clip) => {
    onStartChange(clip.start);
    onEndChange(clip.end);
    onSeek(clip.start);
  };

  return (
    <section className="rounded-[24px] border border-ink/[.08] bg-white p-4 shadow-[0_14px_42px_rgba(32,20,46,.08)] sm:p-5">
      <div className="flex flex-col gap-4 border-b border-ink/[.07] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <button
            aria-label={playing ? "Auswahl pausieren" : "Auswahl abspielen"}
            aria-pressed={playing}
            onClick={onPlaySelection}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-white/10 bg-ink text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_20px_rgba(32,20,46,.2)] transition-all duration-150 hover:scale-[1.04] hover:bg-purple hover:shadow-[0_8px_24px_rgba(147,0,255,.25)] active:scale-[.98]"
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play className="ml-0.5" size={18} fill="currentColor" />}
          </button>
          <div>
            <p className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-[.16em] text-purple"><Scissors size={11} /> AKTIVER SCHNITT</p>
            <div className="mt-1 flex items-baseline gap-2 font-bold tracking-[-.02em]">
              <span className="text-base sm:text-lg">{formatTime(start)}</span>
              <span className="text-muted/50">→</span>
              <span className="text-base sm:text-lg">{formatTime(end)}</span>
            </div>
            <p className="mt-0.5 text-[10px] font-semibold text-muted">{formatTime(end - start)} Dauer{activeClip ? ` · ${activeClip.title}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 text-[10px] font-bold tabular-nums text-muted sm:flex"><Clock3 size={12} />{formatTime(currentTime)}</span>
          <button title="Timeline einpassen" aria-label="Timeline einpassen" onClick={() => setZoomLevel(1)} className="timeline-tool"><Focus size={14} /></button>
          <button title="Herauszoomen" aria-label="Herauszoomen" disabled={zoom <= 1} onClick={() => setZoomLevel(zoom - 0.5)} className="timeline-tool"><Minus size={14} /></button>
          <button title="Hineinzoomen" aria-label="Hineinzoomen" disabled={zoom >= 3} onClick={() => setZoomLevel(zoom + 0.5)} className="timeline-tool"><Plus size={14} /></button>
          <button onClick={onSelectAll} className="ml-1 flex items-center gap-1.5 rounded-xl border border-ink/10 bg-cream/60 px-3 py-2 text-[10px] font-bold transition-colors hover:border-purple/30 hover:bg-white hover:text-purple"><RotateCcw size={12} /> Ganzes Video</button>
        </div>
      </div>

      {markers.length > 0 && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-[8px] font-extrabold tracking-[.14em] text-muted">SMART CUTS</span>
          {markers.map((clip, index) => (
            <button key={clip.id} onClick={() => selectClip(clip)} title={`${clip.title} · Score ${clip.score}%`}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[9px] font-bold transition-all duration-200 ${activeClip?.id === clip.id ? "border-purple bg-purple text-white shadow-[0_4px_12px_rgba(147,0,255,.18)]" : "border-ink/10 bg-cream/70 text-muted hover:border-purple/30 hover:text-ink"}`}>
              {String(index + 1).padStart(2, "0")} · {formatTime(clip.end - clip.start)}
            </button>
          ))}
        </div>
      )}

      <div ref={viewportRef} className="no-scrollbar mt-3 overflow-x-auto overflow-y-visible rounded-[16px] border border-ink/10 bg-[#140e18]">
        <div className="relative min-w-full" style={{ width: `${zoom * 100}%` }}>
          <div className="relative h-[112px] cursor-crosshair overflow-visible"
            onMouseMove={(event) => setHover({ x: event.clientX, y: event.clientY, time: timeFromPointer(event) })}
            onMouseLeave={() => setHover(null)}
            onClick={(event) => onSeek(timeFromPointer(event))}>
            <div className="absolute inset-0 grid grid-cols-8 gap-[3px] p-[3px]">
              {Array.from({ length: 8 }).map((_, index) => (
                <img key={index} loading="lazy" src={projectMediaUrl(project, `/api/projects/${project.id}/timeline/${index}`)} alt="" className="h-full w-full object-cover opacity-80 saturate-[.8]" />
              ))}
            </div>
            {markers.map((clip, index) => {
              const left = (clip.start / duration) * 100;
              const width = Math.max(((clip.end - clip.start) / duration) * 100, 0.35);
              const selected = activeClip?.id === clip.id;
              return (
                <button key={clip.id} onClick={(event) => { event.stopPropagation(); selectClip(clip); }}
                  title={`Clip ${String(index + 1).padStart(2, "0")} · ${formatTime(clip.start)}–${formatTime(clip.end)} · ${formatTime(clip.end - clip.start)} · Score ${clip.score}%`}
                  className={`absolute inset-y-[3px] z-[2] overflow-hidden border-2 text-left transition-all duration-200 ${selected ? "border-[#d900ff] bg-purple/10 shadow-[0_0_15px_rgba(217,0,255,.35)]" : "border-white/30 bg-ink/10 hover:border-purple/70"}`}
                  style={{ left: `${left}%`, width: `${width}%` }}>
                  <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[7px] font-extrabold tracking-wide ${selected ? "bg-[#d900ff] text-white" : "bg-ink/75 text-white/80"}`}>{String(index + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[3] bg-[#100b14]/70 backdrop-grayscale" style={{ width: `${startPercent}%` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[3] bg-[#100b14]/70 backdrop-grayscale" style={{ width: `${100 - endPercent}%` }} />
            <div className="pointer-events-none absolute inset-y-0 z-[4] border-y-2 border-purple bg-purple/[.04]" style={{ left: `${startPercent}%`, width: `${Math.max(endPercent - startPercent, 0.2)}%` }} />
            <div className="pointer-events-none absolute inset-y-0 z-[7] w-px bg-[#f000ff] shadow-[0_0_9px_rgba(240,0,255,.8)] will-change-transform" style={{ transform: `translateX(calc(${currentPercent}% - 1px))` }}>
              <span className="absolute -left-[5px] -top-1 h-3 w-3 rotate-45 rounded-[3px] bg-[#f000ff]" />
            </div>
            {hover && (
              <div className="pointer-events-none fixed z-50 w-32 -translate-x-1/2 -translate-y-full overflow-hidden rounded-xl border border-white/15 bg-ink p-1.5 text-white shadow-xl" style={{ left: hover.x, top: hover.y - 12 }}>
                <img src={projectMediaUrl(project, `/api/projects/${project.id}/timeline/${Math.min(7, Math.floor((hover.time / duration) * 8))}`)} alt="" className="aspect-video w-full rounded-lg object-cover" />
                <span className="mt-1 block text-center text-[9px] font-bold tabular-nums">{formatTime(hover.time)}</span>
              </div>
            )}
            <input aria-label="Clip start" className="timeline-range" type="range" min={0} max={duration} step={0.1} value={start} onChange={(event) => onStartChange(Math.min(Number(event.target.value), end - 0.1))} />
            <input aria-label="Clip end" className="timeline-range timeline-range-end" type="range" min={0} max={duration} step={0.1} value={end} onChange={(event) => onEndChange(Math.max(Number(event.target.value), start + 0.1))} />
          </div>
          <div className="relative h-8 border-t border-white/10 bg-[#100b14]">
            {Array.from({ length: 17 }).map((_, index) => {
              const major = index % 4 === 0;
              return <span key={index} className={`absolute top-0 border-l ${major ? "h-3 border-white/35" : "h-1.5 border-white/15"}`} style={{ left: `${(index / 16) * 100}%` }}>{major && <small className={`absolute top-3 whitespace-nowrap text-[8px] font-semibold text-white/50 ${index === 16 ? "-translate-x-full" : index ? "-translate-x-1/2" : ""}`}>{formatTime((duration * index) / 16)}</small>}</span>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
