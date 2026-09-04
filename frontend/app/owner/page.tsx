'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clapperboard, Clock3, Crown, Film, FolderKanban, HardDrive } from 'lucide-react';
import { useAuth } from '../../components/auth-provider';
import { getOwnerOverview, OwnerOverview } from '../../lib/api';

function formatBytes(value: number) {
  if (!value) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

export default function OwnerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<OwnerOverview | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/'); return; }
    void getOwnerOverview().then(setData).catch(() => router.replace('/'));
  }, [loading, router, user]);
  if (!data) return <main className="grid min-h-screen place-items-center bg-cream"><div className="text-center"><Crown className="mx-auto animate-pulse text-purple" size={34}/><p className="mt-3 text-sm font-bold">Owner-Zugang wird geprüft …</p></div></main>;
  const cards = [
    ['Projekte', data.projects, FolderKanban], ['Smart Cuts', data.clips, Clapperboard],
    ['Exporte', data.exports, Film], ['Export-Speicher', formatBytes(data.export_bytes), HardDrive],
  ] as const;
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(147,0,255,.12),transparent_34%),#f7f5ec] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-bold"><ArrowLeft size={14}/> Zur Website</Link>
      <div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-[10px] font-black tracking-[.18em] text-purple">PRIVATER BEREICH</p><h1 className="mt-2 font-serif text-4xl sm:text-6xl">Owner Studio</h1><p className="mt-3 text-sm text-muted">Nur dein verifiziertes Benutzerkonto kann diese Daten laden.</p></div><Crown className="hidden text-purple sm:block" size={56}/></div>
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value,Icon]) => <article key={label} className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-[0_14px_34px_rgba(32,20,46,.07)]"><Icon className="text-purple" size={20}/><p className="mt-5 text-3xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-muted">{label}</p></article>)}</section>
      <section className="mt-5 rounded-[28px] border border-ink/10 bg-ink p-6 text-white"><div className="flex items-center gap-3"><Clock3 className="text-mint"/><div><p className="text-xs font-bold text-white/60">Verarbeitetes Material</p><p className="text-2xl font-black">{(data.total_duration / 3600).toFixed(1)} Stunden</p></div></div></section>
      <section className="mt-5 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-7"><h2 className="font-serif text-3xl">Letzte Projekte</h2><div className="mt-5 divide-y divide-ink/10">{data.recent_projects.map(project => <a key={project.id} href={`/project/${project.id}`} className="flex items-center justify-between gap-4 py-4 transition-colors hover:text-purple"><div className="min-w-0"><p className="truncate text-sm font-bold">{project.name}</p><p className="mt-1 text-[10px] text-muted">{new Date(project.created_at).toLocaleString('de-AT')}</p></div><span className="rounded-full bg-mint/40 px-3 py-1 text-[9px] font-black uppercase">{project.status}</span></a>)}</div></section>
    </div>
  </main>;
}
