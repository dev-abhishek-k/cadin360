import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ingestEvent } from '../../services/api.js';

export function getLandingSource(search, referrer = '') {
  const params = new URLSearchParams(search);
  const tagged = params.get('utm_source') || params.get('source') || params.get('ref') || params.get('src');
  if (tagged?.trim()) {
    const source = tagged.trim().toLowerCase();
    return ['x', 't.co', 'tw'].includes(source) ? 'twitter' : source;
  }

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com', 't.co'].includes(host)) return 'twitter';
  } catch (_error) {}
  return null;
}

export default function LandingAttribution() {
  const location = useLocation();
  const { user, loading, guestCredential, initGuestSession } = useAuth();
  const capturedLocation = useRef(null);

  useEffect(() => {
    if (loading) return;
    const source = getLandingSource(
      location.search,
      location.key === 'default' ? document.referrer : ''
    );
    if (!source) return;

    const visitKey = `${location.key}:${location.pathname}${location.search}`;
    if (capturedLocation.current === visitKey) return;
    capturedLocation.current = visitKey;

    async function captureArrival() {
      let credential = guestCredential;
      if (!user && !credential) {
        const result = await initGuestSession();
        if (!result.success) return;
        credential = result.guestCredential;
      }

      await ingestEvent({
        eventId: `arrival_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
        type: 'short_link_opened',
        occurredAt: new Date().toISOString(),
        canonicalRoute: location.pathname || '/',
        originalRoute: `${location.pathname || '/'}${location.search}`,
        source,
      }, credential);
    }

    captureArrival().catch(() => {
      // The visitor can continue browsing if tracking is temporarily unavailable.
    });
  }, [location, loading, user, guestCredential, initGuestSession]);

  return null;
}
