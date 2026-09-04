'use client';

import { motion } from 'framer-motion';
import { ArrowDown, Check, Play, Scissors, ShieldCheck } from 'lucide-react';

export function DashboardHero() {
  const go=()=>document.querySelector('#projects')?.scrollIntoView({behavior:'smooth'});
  return <section id="top" className="relative border-b border-ink/[.07]">
    <div className="mx-auto grid w-full max-w-[1320px] items-center gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:px-10 xl:grid-cols-[1.02fr_.98fr] xl:gap-16 xl:py-24">
      <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.55,ease:[.22,1,.36,1]}} className="relative z-10 min-w-0">
        <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-[9px] font-extrabold tracking-[.13em] text-purple shadow-sm sm:mb-6 sm:px-3.5 sm:text-[10px] sm:tracking-[.17em]"><Scissors size={13}/> VIDEO CLIPPER FÜR CREATOR</div>
        <h1 className="max-w-[760px] text-[clamp(2.75rem,13vw,6.9rem)] font-semibold leading-[.92] tracking-[-.06em] sm:tracking-[-.065em]">Aus langen Videos werden <span className="font-serif font-normal italic text-purple">starke Clips.</span></h1>
        <p className="mt-7 max-w-[590px] text-base leading-7 text-muted sm:text-lg sm:leading-8">Für Creator, Teams und Agenturen: Video hochladen, beste Stellen auswählen, Untertitel und Headlines gestalten und als Reel, Short oder TikTok exportieren.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><motion.button whileHover={{y:-2}} whileTap={{scale:.98}} onClick={go} className="flex w-full items-center justify-center gap-2.5 rounded-full bg-purple px-6 py-4 text-sm font-bold text-white shadow-[0_12px_30px_rgba(147,0,255,.22)] sm:w-auto">Video schneiden <ArrowDown size={17}/></motion.button><div className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-muted sm:justify-start"><ShieldCheck size={17} className="text-[#248c69]"/> Sicher verarbeitet · Account-geschützt</div></div>
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-bold text-muted">{['Bis 8 Stunden','10–20 Smart Cuts','Reaction-Layouts'].map(item=><span key={item} className="flex items-center gap-1.5"><Check size={13} className="text-purple"/>{item}</span>)}</div>
      </motion.div>
      <motion.div initial={{opacity:0,scale:.97}} animate={{opacity:1,scale:1}} transition={{delay:.12,duration:.6}} className="relative mx-auto w-full max-w-[560px] xl:mr-0">
        <div className="absolute -inset-4 -rotate-2 rounded-[38px] bg-mint/55 sm:-inset-7"/>
        <div className="relative overflow-hidden rounded-[28px] border border-ink/10 bg-white p-3 shadow-[0_28px_75px_rgba(32,20,46,.18)] sm:rounded-[34px] sm:p-4">
          <div className="overflow-hidden rounded-[20px] bg-ink sm:rounded-[25px]">
            <div className="relative aspect-[16/7] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#873bd0_0%,#351847_42%,#160e20_100%)]"><div className="absolute inset-x-[12%] bottom-0 h-[72%] rounded-t-[50%] bg-[#846391]/70"/><span className="absolute left-3 top-3 rounded-full bg-white/10 px-2.5 py-1.5 text-[8px] font-bold tracking-wider text-white backdrop-blur">REACTION</span></div>
            <div className="relative z-10 mx-auto -my-4 w-fit rounded-xl bg-white px-5 py-2 text-center text-lg font-black leading-[.95] text-[#dc2727] shadow-xl sm:text-2xl">DIESER MOMENT<br/>ÄNDERT ALLES</div>
            <div className="relative aspect-[16/9] bg-[radial-gradient(circle_at_55%_20%,#565a67_0%,#24242c_50%,#111116_100%)]"><div className="absolute bottom-0 left-1/2 h-[78%] w-[34%] -translate-x-1/2 rounded-t-[46%] bg-[#9ea3ad]/80"/><button aria-label="Beispiel abspielen" className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-xl"><Play size={17} fill="currentColor"/></button><div className="absolute inset-x-4 bottom-4 h-1.5 overflow-hidden rounded-full bg-white/15"><span className="block h-full w-[62%] rounded-full bg-mint"/></div></div>
          </div>
          <div className="flex items-center justify-between gap-4 px-1 pb-1 pt-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-mint text-ink"><Check size={14} strokeWidth={3}/></span><div><p className="text-[8px] font-extrabold tracking-[.15em] text-purple">EXPORTVORSCHAU</p><p className="mt-1 text-xs font-bold">Zwei Spuren. Ein perfekter Moment.</p></div></div><span className="rounded-xl border border-ink/[.07] bg-cream px-3 py-2 text-[9px] font-bold">REEL · BEREIT</span></div>
        </div>
      </motion.div>
    </div>
  </section>;
}
