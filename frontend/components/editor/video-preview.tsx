'use client';

import { forwardRef, type PointerEvent as ReactPointerEvent, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { LoaderCircle, Maximize2, Move, Play } from 'lucide-react';
import { Job, Project, getJob, getReaction, projectMediaUrl, startPreview } from '../../lib/api';
import { useEditorDesign } from './editor-design-context';

type VideoPreviewProps = {
  project: Project;
};

const BROWSER_SAFE_CODECS = new Set(['h264', 'av1', 'vp8', 'vp9']);

export const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(function VideoPreview({ project }, forwardedRef) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const design = useEditorDesign();
  const [job, setJob] = useState<Job | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasReaction, setHasReaction] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [selected, setSelected] = useState<'mainVideo'|'reactionVideo'|'frame'|'caption'|'headline1'|'headline2'|null>(null);
  const [error, setError] = useState('');
  const needsProxy = !BROWSER_SAFE_CODECS.has((project.codec ?? '').toLowerCase());
  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);
  useEffect(()=>{void getReaction(project.id).then(value=>setHasReaction(Boolean(value))).catch(()=>{setHasReaction(false);design.setMainX(50);design.setMainY(50);});},[project.id]);
  useEffect(()=>{void fetch(projectMediaUrl(project, `/api/projects/${project.id}/frame/media`)).then(response=>setHasFrame(response.ok)).catch(()=>setHasFrame(false));},[project]);

  useEffect(() => {
    if (!needsProxy) return;
    let cancelled = false;
    let timer: number | undefined;
    const playlist = projectMediaUrl(project, `/api/projects/${project.id}/preview/index.m3u8`);
    const poll = async (jobId: string) => {
      if (cancelled) return;
      try {
        const [jobResult, playlistResult] = await Promise.allSettled([
          getJob(jobId),
          fetch(playlist, { cache: 'no-store', credentials: 'include' }),
        ]);
        if (cancelled) return;
        const playlistReady = playlistResult.status === 'fulfilled' && playlistResult.value.ok;
        if (playlistReady) setPreviewUrl(playlist);
        if (jobResult.status === 'fulfilled') {
          const nextJob = jobResult.value;
          setJob(nextJob);
          if (nextJob.status === 'failed') setError(nextJob.error ?? 'Preview processing failed.');
          if (nextJob.status !== 'failed' && (nextJob.status !== 'completed' || !playlistReady)) {
            timer = window.setTimeout(() => void poll(jobId), 1200);
          }
        } else {
          const replacement = await startPreview(project.id);
          if (!cancelled) { setJob(replacement); timer = window.setTimeout(() => void poll(replacement.id), 800); }
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(jobId), 1500);
      }
    };
    startPreview(project.id).then(initial => { if (!cancelled) { setJob(initial); void poll(initial.id); } }).catch(reason => setError(reason instanceof Error ? reason.message : 'Preview could not start.'));
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [needsProxy, project]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewUrl) return;
    let cancelled = false;
    let instance: { destroy: () => void } | null = null;
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          // Preview playlists and every relative segment are protected by the
          // same Supabase session cookie as the project API.
          xhrSetup: (xhr) => { xhr.withCredentials = true; },
        });
        instance = hls;
        hls.loadSource(previewUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setError(''));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          setError('Die Browser-Vorschau konnte nicht geladen werden. Bitte Seite neu laden.');
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = previewUrl;
      }
    });
    return () => { cancelled = true; instance?.destroy(); };
  }, [previewUrl]);

  const directSource = needsProxy ? undefined : projectMediaUrl(project, `/api/projects/${project.id}/media`);
  const progress = Math.round(job?.progress ?? 0);
  const moveOverlay = (kind:'mainVideo'|'reactionVideo'|'frame'|'caption'|'headline1'|'headline2', event:ReactPointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); const canvas=canvasRef.current; if(!canvas)return;
    setSelected(kind);
    const move=(next:PointerEvent)=>{const rect=canvas.getBoundingClientRect();const x=Math.max(-25,Math.min(125,((next.clientX-rect.left)/rect.width)*100));const y=Math.max(-25,Math.min(125,((next.clientY-rect.top)/rect.height)*100));if(kind==='caption')design.setCaptions(current=>({...current,x,y}));else if(kind==='headline1'){design.setHeadlineX(x);design.setHeadlineY(y);}else if(kind==='headline2'){design.setSecondaryHeadlineX(x);design.setSecondaryHeadlineY(y);}else if(kind==='mainVideo'){design.setMainX(x);design.setMainY(y);}else if(kind==='reactionVideo'){design.setReactionX(x);design.setReactionY(y);}else{design.setFrameX(x);design.setFrameY(y);}};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);
  };
  const resizeOverlay = (kind:'mainVideo'|'reactionVideo'|'frame'|'caption'|'headline', event:ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();event.stopPropagation();const startX=event.clientX;const startY=event.clientY;const initial=kind==='caption'?design.captions.size:kind==='headline'?design.headlineSize:kind==='mainVideo'?design.mainScale:kind==='reactionVideo'?design.reactionScale:design.frameScale;
    const move=(next:PointerEvent)=>{const delta=(next.clientX-startX+next.clientY-startY);if(kind==='caption')design.setCaptions(current=>({...current,size:Math.round(Math.max(36,Math.min(140,Number(initial)+delta/3)))}));else if(kind==='headline')design.setHeadlineSize(Math.round(Math.max(36,Math.min(110,Number(initial)+delta/3))));else{const scale=Math.max(.2,Math.min(3,Number(initial)+delta/220));if(kind==='mainVideo')design.setMainScale(scale);else if(kind==='reactionVideo')design.setReactionScale(scale);else design.setFrameScale(scale);}};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);
  };
  const captionText=['Das','ist','dein','Caption','jetzt'].slice(0,design.captions.words).join(' ');
  const captionLook=design.captions.style==='bold'?'text-yellow [text-shadow:0_3px_0_#30103b]':design.captions.style==='gaming'?'bg-purple text-white':design.captions.style==='creator'?'bg-coral text-white':design.captions.style==='karaoke'?'bg-white text-purple':design.captions.style==='boxed'?'border-2 border-white bg-cream text-ink':design.captions.style==='neon'?'border border-purple bg-[#170d22] text-[#ef66ff] shadow-[0_0_18px_rgba(147,0,255,.65)]':design.captions.style==='documentary'?'bg-black/70 font-serif text-white':'text-white [text-shadow:0_3px_8px_#000]';
  const headlineRadius=design.headlineStyle==='capsule'?'rounded-full':design.headlineStyle==='bubble'?'rounded-[28px] rounded-bl-[7px]':design.headlineStyle==='minimal'?'':'rounded-[22px]';
  const stacked=hasReaction&&(design.layout==='reaction_top'||design.layout==='main_top');
  const mainBox=hasReaction&&stacked?'h-[56%] w-full':design.layout==='picture_in_picture'?'h-full w-full':'h-[48%] w-[76%]';
  const reactionBox=stacked?'h-[44%] w-full':design.layout==='picture_in_picture'?'h-[28%] w-[34%]':'h-full w-full opacity-30 blur-xl';
  const socialSafe=design.ownerSafeLayout&&design.platform!=='youtube'&&design.layout==='reaction_top';
  const mainClass=!hasReaction?'inset-0 h-full w-full object-contain':design.layout==='reaction_top'?(socialSafe?'left-0 top-[42.5%] h-[31.7%] w-full object-cover':'left-0 top-[44%] h-[56%] w-full object-cover'):design.layout==='main_top'?'left-0 top-0 h-[44%] w-full object-cover':design.layout==='picture_in_picture'?'inset-0 h-full w-full object-cover':'left-[12%] top-[28%] h-[48%] w-[76%] object-cover shadow-2xl';
  const reactionClass=design.layout==='reaction_top'?(socialSafe?'left-0 top-0 h-[40%] w-full object-cover':'left-0 top-0 h-[44%] w-full object-cover'):design.layout==='main_top'?'left-0 top-[44%] h-[56%] w-full object-cover':design.layout==='picture_in_picture'?'right-[4%] top-[4%] h-[28%] w-[34%] rounded-xl border-2 border-white object-cover shadow-2xl':'inset-0 h-full w-full object-cover opacity-30 blur-xl';
  const selectedRing=(layer:typeof selected)=>selected===layer?'ring-2 ring-mint ring-offset-2 ring-offset-ink/40':'';
  return <div className="w-full rounded-[30px] border border-ink/[.08] bg-white p-2 shadow-[0_18px_55px_rgba(32,20,46,.10)]">
    <div className="flex items-center justify-between gap-3 px-3 py-2"><div><p className="text-[9px] font-black tracking-[.15em] text-purple">LIVE EDIT CANVAS</p><p className="text-[10px] font-bold text-muted">Text direkt greifen, bewegen und am Griff skalieren</p></div><span className="flex items-center gap-1 rounded-full bg-cream px-3 py-1.5 text-[9px] font-bold"><Move size={12}/>{design.platform==='youtube'?'16:9':'9:16'}</span></div>
    <div ref={canvasRef} className={`relative mx-auto w-full touch-none overflow-hidden rounded-[23px] bg-[#100b16] transition-all ${design.platform==='youtube'?'aspect-video max-w-[1100px]':'aspect-[9/16] max-h-[72vh] max-w-[430px]'}`}>
    {(stacked||design.layout==='blur_center')&&<div className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-55 blur-xl" style={{backgroundImage:`url(${projectMediaUrl(project, `/api/projects/${project.id}/thumbnail`)})`}}/>}
    {hasReaction&&<video src={projectMediaUrl(project, `/api/projects/${project.id}/reaction/media`)} autoPlay muted loop playsInline preload="metadata" className={`pointer-events-none absolute z-[4] ${reactionClass}`}/>} 
    <video ref={videoRef} src={directSource} poster={projectMediaUrl(project, `/api/projects/${project.id}/thumbnail`)} controls preload="metadata" onCanPlay={() => setReady(true)} className={`absolute z-[5] ${mainClass}`} />
    {hasFrame&&stacked&&<img src={projectMediaUrl(project, `/api/projects/${project.id}/frame/media`)} alt="Reaction-Rahmen" draggable={false} className={`pointer-events-none absolute left-0 z-[7] w-full object-contain ${design.layout==='reaction_top'?(socialSafe?'top-0 h-[40%]':'top-0 h-[44%]'):'top-[44%] h-[56%]'}`}/>} 
    <div className="pointer-events-none absolute inset-[3%] rounded-[18px] border border-dashed border-white/25" />
    {design.headlineEnabled && design.headline && <span onPointerDown={(event)=>moveOverlay('headline1',event)} style={{left:`${design.headlineX}%`,top:`${design.headlineY}%`,transform:'translate(-50%,-50%)',fontSize:`${design.headlineSize*.34}px`,color:design.headlineTextColor,backgroundColor:design.headlineStyle==='minimal'?'transparent':design.headlineBackgroundColor,cursor:'move'}} className={`absolute z-20 max-w-[88%] select-none whitespace-pre-wrap px-4 py-3 text-center font-black uppercase leading-[1.08] shadow-xl ${selectedRing('headline1')} ${headlineRadius}`}>{design.headline}{selected==='headline1'&&<button type="button" aria-label="Headline skalieren" onPointerDown={(event)=>resizeOverlay('headline',event)} className="absolute -bottom-4 -right-4 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-purple text-white shadow-xl"><Maximize2 size={14}/></button>}</span>}
    {design.secondaryHeadlineEnabled && design.secondaryHeadline && <span onPointerDown={(event)=>moveOverlay('headline2',event)} style={{left:`${design.secondaryHeadlineX}%`,top:`${design.secondaryHeadlineY}%`,transform:'translate(-50%,-50%)',fontSize:`${design.headlineSize*.28}px`,color:design.headlineTextColor,backgroundColor:design.headlineStyle==='minimal'?'transparent':design.headlineBackgroundColor,cursor:'move'}} className={`absolute z-20 max-w-[88%] select-none whitespace-pre-wrap px-4 py-3 text-center font-black uppercase leading-[1.08] shadow-xl ${selectedRing('headline2')} ${headlineRadius}`}>{design.secondaryHeadline}</span>}
    {design.captions.enabled && <span onPointerDown={(event)=>moveOverlay('caption',event)} style={{left:`${design.captions.x}%`,top:`${design.captions.y}%`,transform:'translate(-50%,-50%)',fontSize:`${design.captions.size*.34}px`,cursor:'move'}} className={`absolute z-20 max-w-[90%] select-none whitespace-nowrap rounded-lg px-3 py-2 text-center font-black ${selectedRing('caption')} ${captionLook}`}>{design.captions.uppercase?captionText.toUpperCase():captionText}{selected==='caption'&&<button type="button" aria-label="Caption skalieren" onPointerDown={(event)=>resizeOverlay('caption',event)} className="absolute -bottom-4 -right-4 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-coral text-white shadow-xl"><Maximize2 size={14}/></button>}</span>}
    {!ready && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/55 p-8 text-center backdrop-blur-[2px]"><div className="max-w-sm"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white"><LoaderCircle className="animate-spin" size={29} /></span><h3 className="mt-5 font-serif text-3xl text-white">Video wird vorbereitet</h3><p className="mt-2 text-sm leading-6 text-white/65">{needsProxy ? `Für eine flüssige Wiedergabe · ${progress}%` : 'Video wird geladen…'}</p>{job?.status === 'processing' && <div className="mx-auto mt-5 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${Math.max(progress, 3)}%` }} /></div>}</div></div>}
    {error && <div className="absolute inset-x-5 bottom-16 rounded-2xl bg-coral px-4 py-3 text-center text-xs font-bold text-white shadow-lg">{error}</div>}
    {!ready && !needsProxy && <Play className="absolute text-white/0" />}
    </div>
  </div>;
});
