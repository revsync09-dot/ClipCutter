"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Film, Play } from "lucide-react";
import { ExampleVideo, absoluteApiUrl, getExamples } from "../lib/api";

const bundledExamples: ExampleVideo[] = [
  { id: "bundled-01", filename: "01-podcast-highlight.mp4", title: "Podcast Highlight 01", created_at: "", video_url: "/showcase/videos/01-podcast-highlight.mp4" },
  { id: "bundled-02", filename: "02-podcast-highlight.mp4", title: "Podcast Highlight 02", created_at: "", video_url: "/showcase/videos/02-podcast-highlight.mp4" },
];

export function ExamplesShowcase() {
  const [examples, setExamples] = useState<ExampleVideo[]>([]);
  useEffect(() => {
    getExamples()
      .then(remote => setExamples(remote.length ? remote : bundledExamples))
      .catch(() => setExamples(bundledExamples));
  }, []);

  const posterUrl = (example: ExampleVideo) => {
    if (!example.id.startsWith("source-") && !example.id.startsWith("bundled-")) return undefined;
    const stem = example.filename.replace(/\.[^.]+$/, "");
    return `/showcase/posters/${encodeURIComponent(stem)}.jpg`;
  };

  const videoUrl = (example: ExampleVideo) =>
    example.video_url.startsWith("/showcase/") ? example.video_url : absoluteApiUrl(example.video_url);

  return (
    <section id="examples" className="border-b border-ink/[.07] bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:gap-8">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.17em] text-purple">FERTIGE ERGEBNISSE</p>
            <h2 className="mt-3 max-w-2xl text-[clamp(2.25rem,11vw,4.9rem)] font-semibold leading-[.94] tracking-[-.055em]">So sehen deine <span className="font-serif font-normal italic text-purple">fertigen Clips</span> aus.</h2>
          </div>
          <div className="lg:justify-self-end lg:pb-1">
            <p className="max-w-lg text-sm leading-6 text-muted sm:leading-7">Hier erscheinen die fertigen Ergebnisse, die mit der Website erstellt wurden – inklusive Schnitt, Reaction, Captions und Headline.</p>
          </div>
        </div>
        {examples.length ? (
          <div className="mt-8 grid gap-5 sm:mt-10 md:grid-cols-2 xl:grid-cols-3">
            {examples.map((example, index) => (
              <article key={example.id} className="group min-w-0 overflow-hidden rounded-[22px] border border-ink/[.08] bg-cream shadow-[0_15px_40px_rgba(32,20,46,.07)]">
                <div className="relative overflow-hidden bg-ink">
                  <video
                    src={videoUrl(example)}
                    poster={posterUrl(example)}
                    controls
                    preload="metadata"
                    playsInline
                    className="aspect-[9/16] w-full bg-ink object-contain xl:max-h-[540px]"
                  />
                  <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-ink/80 px-2 py-1 text-[8px] font-extrabold tracking-[.13em] text-white backdrop-blur">CUT {String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0"><p className="text-[8px] font-extrabold tracking-[.14em] text-purple">SHOWCASE</p><h3 className="mt-1 truncate text-sm font-bold">{example.title}</h3></div>
                  <ArrowUpRight size={16} className="shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-purple" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 overflow-hidden rounded-[26px] border border-ink/[.08] bg-ink text-white shadow-[0_22px_60px_rgba(32,20,46,.14)]">
            <div className="grid min-h-[330px] place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(147,0,255,.24),transparent_48%)] p-8 text-center">
              <div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[.07] text-mint"><Film size={22}/></span><h3 className="mt-5 text-xl font-bold">Die besten Cuts erscheinen hier.</h3><p className="mt-2 text-sm leading-6 text-white/55">Die Galerie ist bewusst kuratiert und zeigt nur veröffentlichungsreife Ergebnisse.</p><span className="mt-5 inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-mint"><Play size={12} fill="currentColor"/> SHOWCASE WIRD VORBEREITET</span></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
