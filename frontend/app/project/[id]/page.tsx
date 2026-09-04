"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { EditorTimeline } from "../../../components/editor/editor-timeline";
import { EditorWorkspace } from "../../../components/editor/editor-workspace";
import { EditorTab, ToolPanel } from "../../../components/editor/tool-panel";
import { VideoPreview } from "../../../components/editor/video-preview";
import { EditorDesignProvider } from "../../../components/editor/editor-design-context";
import { Project, getProject } from "../../../lib/api";
import { useAuth } from "../../../components/auth-provider";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectionPlayback, setSelectionPlayback] = useState(false);
  const [mode, setMode] = useState<"fit" | "crop">("crop");
  const [tab, setTab] = useState<EditorTab>("reference");
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const syncPanel = () => setPanelOpen(desktop.matches);
    syncPanel();
    desktop.addEventListener("change", syncPanel);
    return () => desktop.removeEventListener("change", syncPanel);
  }, []);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/#projects'); return; }
    getProject(id)
      .then((value) => {
        setProject(value);
        setEnd(value.duration ?? 0);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Project not found",
        ),
      );
  }, [authLoading, id, router, user]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      setCurrentTime(video.currentTime);
      setPlaying(!video.paused);
      if (selectionPlayback && video.currentTime >= end - 0.05) {
        video.pause();
        setSelectionPlayback(false);
      }
    };
    const pause = () => {
      setPlaying(false);
      setSelectionPlayback(false);
    };
    video.addEventListener("timeupdate", update);
    video.addEventListener("play", update);
    video.addEventListener("pause", pause);
    return () => {
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("play", update);
      video.removeEventListener("pause", pause);
    };
  }, [project, selectionPlayback, end]);
  const seek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  const playSelection = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < start || video.currentTime >= end - 0.1)
      video.currentTime = start;
    setSelectionPlayback(true);
    void video.play();
  };
  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-cream p-8 text-ink">
        <div className="rounded-[28px] bg-white p-10 text-center shadow-xl">
          <h1 className="font-serif text-4xl">Couldn’t open this project</h1>
          <p className="mt-3 text-muted">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-full bg-purple px-6 py-3 font-bold text-white"
          >
            Back to projects
          </button>
        </div>
      </main>
    );
  if (authLoading || !project)
    return (
      <main className="grid min-h-screen place-items-center bg-cream">
        <LoaderCircle className="animate-spin text-purple" size={35} />
      </main>
    );
  return (
    <EditorDesignProvider><main className="min-h-screen bg-cream text-ink">
      <header className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-ink/[.07] bg-white px-3 shadow-[0_6px_24px_rgba(32,20,46,.04)] sm:h-[72px] sm:gap-4 sm:px-4 lg:h-[78px] lg:px-6">
        <button
          onClick={() => router.push("/")}
          aria-label="Zurück zu Projekte"
          className="flex h-10 items-center gap-2 rounded-xl border border-ink/[.08] bg-cream/60 px-3 text-xs font-bold text-muted transition-colors hover:border-purple/25 hover:text-ink sm:px-3.5"
        >
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Projekte</span>
        </button>
        <div className="min-w-0 text-center">
          <div className="hidden items-center justify-center gap-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_0_4px_rgba(94,229,194,.16)]" />
            <p className="text-[9px] font-bold tracking-[.16em] text-purple">
              PROJEKT BEREIT
            </p>
          </div>
          <h1 className="truncate px-1 text-[11px] font-bold tracking-tight sm:mt-1 sm:text-[13px]">
            {project.original_filename}
          </h1>
        </div>
        <button
          onClick={() => {
            setTab("export");
            setPanelOpen(true);
          }}
          aria-label="Video exportieren"
          className="flex h-10 items-center gap-2 rounded-xl bg-ink px-3 text-xs font-bold text-white shadow-[0_8px_20px_rgba(32,20,46,.14)] transition-all hover:-translate-y-.5 hover:bg-purple sm:px-4"
        >
          <Download size={15} /> <span className="hidden sm:inline">Exportieren</span>
        </button>
      </header>
      <div
        className={`grid min-h-[calc(100vh-64px)] grid-cols-1 pb-[76px] transition-[grid-template-columns] duration-300 sm:min-h-[calc(100vh-72px)] lg:min-h-[calc(100vh-78px)] lg:pb-0 ${panelOpen ? "lg:grid-cols-[150px_minmax(0,1fr)_320px] xl:grid-cols-[174px_minmax(0,1fr)_400px] 2xl:grid-cols-[174px_minmax(0,1fr)_460px]" : "lg:grid-cols-[150px_minmax(0,1fr)_0px] xl:grid-cols-[174px_minmax(0,1fr)_0px]"}`}
      >
        <ToolPanel
          project={project}
          tab={tab}
          start={start}
          end={end}
          mode={mode}
          panelOpen={panelOpen}
          onPanelOpenChange={setPanelOpen}
          onModeChange={setMode}
          onTabChange={setTab}
          onSeek={seek}
          onSelectRange={(nextStart, nextEnd) => {
            setStart(nextStart);
            setEnd(nextEnd);
            seek(nextStart);
          }}
        />
        <section className="order-first min-w-0 bg-[#f0eee8] p-2.5 sm:p-4 lg:order-none lg:col-start-2 lg:row-start-1 xl:p-7">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
            <VideoPreview ref={videoRef} project={project} />
            <EditorTimeline
              project={project}
              start={start}
              end={end}
              currentTime={currentTime}
              playing={playing}
              onStartChange={(value) => {
                setStart(value);
                seek(value);
              }}
              onEndChange={setEnd}
              onSeek={seek}
              onPlaySelection={playSelection}
              onSelectAll={() => {
                setStart(0);
                setEnd(project.duration ?? 0);
                seek(0);
              }}
            />
            <EditorWorkspace
              project={project}
              start={start}
              end={end}
              activeTab={tab}
              onOpen={(nextTab) => {
                setTab(nextTab);
                setPanelOpen(true);
              }}
            />
          </div>
        </section>
      </div>
    </main></EditorDesignProvider>
  );
}
