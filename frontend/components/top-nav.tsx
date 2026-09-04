'use client';

import { Clapperboard, Crown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { getOwnerIdentity } from '../lib/api';

const links = [
  ['#examples', 'Beispiele'],
  ['#projects', 'Projekte'],
  ['#how-it-works', 'So funktioniert’s'],
  ['#privacy', 'Datenschutz'],
];

export function TopNav() {
  const { user, loading, signOut } = useAuth();
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void getOwnerIdentity().then((owner) => { if (active) setOwnerUserId(owner ? user.id : null); }).catch(() => { if (active) setOwnerUserId(null); });
    return () => { active = false; };
  }, [user]);
  const isOwner = Boolean(user && ownerUserId === user.id);
  return <header className="relative z-30 border-b border-ink/[.07] bg-cream/90 backdrop-blur-xl">
    <div className="mx-auto flex min-h-[72px] w-full max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
      <a className="group flex min-w-0 items-center gap-2.5 font-bold tracking-[-.03em]" href="#top" aria-label="ClipForge Cutter Startseite"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-ink text-white shadow-[0_5px_0_#a9f3de] transition-transform group-hover:-translate-y-.5"><Clapperboard size={19}/></span><span className="truncate text-base sm:text-lg">ClipForge <span className="text-purple">Cutter</span></span></a>
      <nav className="hidden items-center gap-7 text-[13px] font-semibold text-muted lg:flex" aria-label="Hauptnavigation">{links.map(([href,label])=><a key={href} href={href} className="transition-colors hover:text-ink">{label}</a>)}</nav>
      <div className="flex items-center gap-2">{isOwner && <a href="/owner" className="flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-[11px] font-bold text-white shadow-sm"><Crown size={14} className="text-yellow"/><span className="hidden sm:inline">Owner Studio</span></a>}{user ? <button onClick={() => void signOut()} title={`${user.email} – abmelden`} className="flex max-w-[190px] shrink-0 items-center gap-2 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[11px] font-bold shadow-sm transition-all hover:border-purple/25 hover:text-purple sm:px-4"><UserRound size={14} className="text-[#20966c]"/><span className="hidden truncate sm:inline">{user.email}</span><LogOut size={13}/></button> : <a href="#projects" className="flex shrink-0 items-center gap-2 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[11px] font-bold shadow-sm transition-all hover:border-purple/25 hover:text-purple sm:px-4"><UserRound size={14} className="text-purple"/><span>{loading ? 'Laden …' : 'Anmelden'}</span></a>}</div>
    </div>
  </header>;
}
