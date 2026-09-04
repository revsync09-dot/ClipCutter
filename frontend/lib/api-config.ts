const LOCAL_API = 'http://localhost:8000/api';

export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return /localhost|127\.0\.0\.1/.test(value);
  }
}

export function resolveApiBaseUrl(
  configured: string | undefined,
  options: { nodeEnv: string; pageHostname?: string },
): string {
  const trimmed = (configured ?? '').trim().replace(/\/$/, '');
  const pageIsLocal = options.pageHostname ? isLoopbackHost(options.pageHostname) : undefined;

  // A deployed page must never call a backend on the visitor's (or author's) PC,
  // even if a localhost URL was accidentally baked into NEXT_PUBLIC_API_URL.
  if (pageIsLocal === false) {
    if (!trimmed || isLoopbackUrl(trimmed)) return '';
    return trimmed;
  }

  if (pageIsLocal === true) {
    return trimmed || LOCAL_API;
  }

  if (options.nodeEnv !== 'production') {
    return trimmed || LOCAL_API;
  }
  if (!trimmed || isLoopbackUrl(trimmed)) return '';
  return trimmed;
}

export function videoServiceUnreachableMessage(pageHostname?: string): string {
  if (pageHostname && !isLoopbackHost(pageHostname)) {
    return 'Der Videodienst ist derzeit nicht erreichbar. Bitte später erneut versuchen.';
  }
  return 'Der lokale ClipForge-Cutter-Dienst ist nicht erreichbar.';
}

export function videoServiceUnconfiguredMessage(pageHostname?: string): string {
  if (pageHostname && !isLoopbackHost(pageHostname)) {
    return 'Der Videodienst ist für diese Website nicht konfiguriert. NEXT_PUBLIC_API_URL muss auf das öffentliche HTTPS-Backend zeigen.';
  }
  return 'Der lokale ClipForge-Cutter-Dienst ist nicht erreichbar. Bitte das Backend auf Port 8000 starten.';
}

export function videoServiceHttpsRequiredMessage(): string {
  return 'Der Videodienst muss auf der veröffentlichten Website per HTTPS erreichbar sein.';
}

export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export function supabaseAuthMessage(error: { message: string; status?: number }): string {
  const message = error.message.trim();
  const lowered = message.toLowerCase();
  if (error.status === 429 || lowered.includes('rate limit')) {
    return 'Zu viele Versuche. Bitte einen Moment warten und erneut versuchen.';
  }
  if (lowered.includes('error sending confirmation email') || lowered.includes('error sending magic link')) {
    return 'Supabase konnte die Bestätigungs-E-Mail nicht versenden. SMTP in Authentication → Email ist noch nicht korrekt eingerichtet.';
  }
  if (lowered.includes('email not confirmed')) {
    return 'Bitte zuerst den Bestätigungslink in der E-Mail öffnen.';
  }
  if (lowered.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort ist falsch.';
  }
  return message;
}
