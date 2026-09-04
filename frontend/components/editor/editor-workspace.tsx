"use client";

import { Captions, Check, Download, Film, Sparkles, Type, UploadCloud } from "lucide-react";
import type { Project } from "../../lib/api";
import type { EditorTab } from "./tool-panel";
import { formatTime } from "./editor-timeline";

const steps: [EditorTab, string, string, typeof UploadCloud][] = [
  ["reference", "Vorlage & Reaction", "Videos verbinden", UploadCloud],
  ["clips", "Smart Cuts", "Highlights wählen", Sparkles],
  ["captions", "Captions", "Lesbarkeit formen", Captions],
  ["headline", "Headline", "Hook gestalten", Type],
  ["export", "Export", "Video ausgeben", Download],
];
const tabStep: Record<EditorTab, number> = {
  reference: 0, format: 0, frame: 0, clips: 1, transcript: 1,
  captions: 2, headline: 3, export: 4,
};

export function EditorWorkspace({
  project, start, end, activeTab, onOpen,
}: {
  project: Project;
  start: number;
  end: number;
  activeTab: EditorTab;
  onOpen: (tab: EditorTab) => void;
}) {
  const activeStep = tabStep[activeTab];
  const progress = `${(activeStep / (steps.length - 1)) * 100}%`;
  return (
    <section className="overflow-hidden rounded-[26px] border border-ink/[.07] bg-white shadow-[0_12px_36px_rgba(32,20,46,.05)]">
      <div className="flex flex-col gap-5 border-b border-ink/[.07] p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-purple" /><p className="text-[9px] font-extrabold tracking-[.16em] text-purple">PROJEKT-WORKFLOW</p></div>
          <h2 className="mt-2 text-xl font-bold tracking-[-.035em] sm:text-2xl">Vom Rohvideo zum fertigen Clip</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">Jeder Schritt öffnet direkt das passende Werkzeug. Dein aktueller Stand bleibt sichtbar.</p>
        </div>
        <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-ink/[.07] bg-cream/65 text-center">
          {[
            [formatTime(end - start), "AUSWAHL"],
            [`${project.width}×${project.height}`, "QUELLE"],
            [project.fps?.toFixed(0) ?? "–", "FPS"],
          ].map(([value, label], index) => (
            <div key={label} className={`min-w-20 px-3 py-2.5 ${index ? "border-l border-ink/[.07]" : ""}`}>
              <dt className="text-[8px] font-extrabold tracking-wider text-muted">{label}</dt>
              <dd className="mt-1 text-[11px] font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="p-4 sm:p-6">
        <div className="relative grid gap-2 sm:grid-cols-5 sm:gap-0">
          <div className="absolute left-[10%] right-[10%] top-[19px] hidden h-0.5 bg-ink/10 sm:block" aria-hidden="true">
            <span className="block h-full bg-purple transition-[width] duration-500" style={{ width: progress }} />
          </div>
          {steps.map(([tab, title, detail, Icon], index) => {
            const complete = index < activeStep;
            const active = index === activeStep;
            return (
              <button key={tab} onClick={() => onOpen(tab)} aria-current={active ? "step" : undefined}
                className={`group relative flex items-center gap-3 rounded-2xl p-2.5 text-left transition-all sm:flex-col sm:px-2 sm:pb-2 sm:pt-0 sm:text-center ${active ? "bg-purple/[.055]" : "hover:bg-cream/70"}`}>
                <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-4 border-white transition-all ${complete ? "bg-mint text-ink" : active ? "bg-purple text-white shadow-[0_5px_16px_rgba(147,0,255,.25)]" : "bg-cream text-muted"}`}>
                  {complete ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
                </span>
                <span className="min-w-0"><strong className={`block text-[11px] ${active ? "text-purple" : "text-ink"}`}>{index + 1}. {title}</strong><small className="mt-0.5 block text-[9px] leading-4 text-muted">{detail}</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-ink px-5 py-3 text-[9px] font-bold tracking-wide text-white/65">
        <span className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-50"/><span className="relative h-2 w-2 rounded-full bg-mint"/></span>LIVE-VORSCHAU AKTIV</span>
        <span className="flex items-center gap-1.5"><Film size={12} className="text-mint"/> Änderungen erscheinen vor dem Export im Player</span>
      </div>
    </section>
  );
}
