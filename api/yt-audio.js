// Vercel Edge Function — YouTube audio resolver via Invidious
// Server-side: tries all known instances, client hits one stable URL
export const config = { runtime: 'edge' };

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://inv.thepixora.com',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
];

// Also try Piped as a secondary fallback
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://pipedapi.adminforge.de',
];

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title  = (searchParams.get('title')   || '').trim();
  const artist = (searchParams.get('artist')  || '').trim();
  const vid    = (searchParams.get('videoId') || '').trim();

  if (!title && !vid) return err('Missing title or videoId', 400);

  try {
    // If videoId provided directly, skip search
    const videoId = vid || await searchVideoId(title, artist);
    if (!videoId) return err('No YouTube results found', 404);
    if (!/^[\w-]{11}$/.test(videoId)) return err('Invalid videoId', 400);

    // Try Invidious instances for streams
    const audio = await getAudioFromInvidious(videoId)
               || await getAudioFromPiped(videoId);

    if (!audio) return err('Could not extract audio stream', 502);

    return json({ ...audio, videoId });
  } catch (e) {
    return err(e.message || 'Unknown error', 500);
  }
}

async function searchVideoId(title, artist) {
  const q = artist ? `${title} ${artist} official audio` : `${title} official audio`;

  // Try Invidious search first
  for (const base of INVIDIOUS) {
    try {
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,author,lengthSeconds`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const items = await res.json();
      const hit = (Array.isArray(items) ? items : [])
        .find(v => v?.videoId && (v.lengthSeconds || 0) > 45);
      if (hit) return hit.videoId;
    } catch { continue; }
  }

  // Try Piped search as fallback
  for (const base of PIPED) {
    try {
      const res = await fetch(
        `${base}/search?q=${encodeURIComponent(q)}&filter=videos`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const items = (data.items || []).filter(it => it?.url && /v=[\w-]{11}/.test(it.url) && (it.duration || 0) > 45);
      if (!items.length) continue;
      const m = items[0].url.match(/v=([\w-]{11})/);
      if (m) return m[1];
    } catch { continue; }
  }

  return null;
}

async function getAudioFromInvidious(videoId) {
  for (const base of INVIDIOUS) {
    try {
      const res = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats,lengthSeconds,title,author`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const streams = (data.adaptiveFormats || [])
        .filter(f => f?.type?.startsWith('audio/') && f?.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!streams.length) continue;
      return {
        url: streams[0].url,
        title: data.title || '',
        artist: data.author || '',
        duration: data.lengthSeconds || 0,
        source: 'youtube',
      };
    } catch { continue; }
  }
  return null;
}

async function getAudioFromPiped(videoId) {
  for (const base of PIPED) {
    try {
      const res = await fetch(
        `${base}/streams/${videoId}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const streams = (data.audioStreams || [])
        .filter(a => a?.url)
        .sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0));
      if (!streams.length) continue;
      return {
        url: streams[0].url,
        title: data.title || '',
        artist: data.uploader || '',
        duration: data.duration || 0,
        source: 'youtube',
      };
    } catch { continue; }
  }
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function err(msg, status = 500) {
  return json({ error: msg }, status);
}
