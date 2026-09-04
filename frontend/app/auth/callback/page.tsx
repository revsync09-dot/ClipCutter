'use client';

import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth-provider';

export default function AuthCallbackPage() {
  const { loading, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [callbackError, setCallbackError] = useState('');

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDescription = search.get('error_description') ?? hash.get('error_description') ?? '';
    const errorTimer = window.setTimeout(() => setCallbackError(errorDescription), 0);
    if (!loading && user) {
      window.location.replace('/#projects');
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), 8_000);
    return () => { window.clearTimeout(errorTimer); window.clearTimeout(timer); };
  }, [loading, user]);

  const waiting = !callbackError && (loading || (!user && !timedOut));

  return (
    <main className="grid min-h-screen place-items-center bg-cream px-5 text-ink">
      <section className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-xl shadow-plum/10">
        {waiting ? (
          <>
            <LoaderCircle className="mx-auto mb-5 size-10 animate-spin text-fuchsia" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia">E-Mail bestätigt</p>
            <h1 className="mt-3 text-3xl font-black">Anmeldung wird abgeschlossen</h1>
            <p className="mt-3 text-sm text-ink/65">Du wirst gleich zu deinen Projekten weitergeleitet.</p>
          </>
        ) : user ? (
          <>
            <CheckCircle2 className="mx-auto mb-5 size-10 text-emerald-500" aria-hidden="true" />
            <h1 className="text-3xl font-black">Anmeldung erfolgreich</h1>
          </>
        ) : (
          <>
            <TriangleAlert className="mx-auto mb-5 size-10 text-red-500" aria-hidden="true" />
            <h1 className="text-3xl font-black">Link nicht mehr gültig</h1>
            <p className="mt-3 text-sm text-ink/65">{callbackError || 'Öffne ClipForge und fordere eine neue Bestätigungs-E-Mail an.'}</p>
            <Link className="mt-6 inline-flex rounded-full bg-plum px-6 py-3 text-sm font-black text-white" href="/#projects">
              Zur Anmeldung
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
