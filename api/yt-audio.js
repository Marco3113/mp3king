// Vercel Serverless Function — Node.js runtime (yt-dlp requires exec)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
const YTDLP_PATH = path.join(os.tmpdir(), 'yt-dlp');

// Download yt-dlp binary once per Lambda cold start
async function ensureYtDlp() {
  if (existsSync(YTDLP_PATH)) return;
  const res = await fetch(YTDLP_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`yt-dlp download failed: ${res.status}`);
  const { createWriteStream } = await import('node:fs');
  await pipeline(res.body, createWriteStream(YTDLP_PATH));
  await execFileAsync('chmod', ['+x', YTDLP_PATH]);
}

// Search YouTube for a video ID using Invidious (no API key needed)
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://invidious.io.lol',
  'https://vid.puffyan.us',
];

async function searchYouTube(query) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,lengthSeconds`,
        { signal: AbortSignal.timeout(6_000) }
      );
      if (!res.ok) continue;
      const items = await res.json();
      const filtered = (Array.isArray(items) ? items : []).filter(
        (v) => v?.videoId && (v.lengthSeconds || 0) > 45
      );
      if (filtered.length) return filtered[0];
    } catch {
      continue;
    }
  }
  return null;
}

// Extract direct audio URL via yt-dlp
async function extractAudio(videoId) {
  await ensureYtDlp();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const { stdout } = await execFileAsync(
    YTDLP_PATH,
    [
      '--no-playlist',
      '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      '--get-url',
      '--no-warnings',
      url,
    ],
    { timeout: 25_000 }
  );
  return stdout.trim().split('\n')[0];
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title')?.trim();
  const artist = searchParams.get('artist')?.trim();
  const videoId = searchParams.get('videoId')?.trim();

  if (!title && !videoId) {
    return json({ error: 'Missing title or videoId param' }, 400);
  }

  try {
    let vid = null;
    let resolvedVideoId = videoId;

    // If no videoId provided, search first
    if (!resolvedVideoId) {
      const query = artist ? `${title} ${artist}` : title;
      vid = await searchYouTube(query);
      if (!vid) return json({ error: 'No YouTube results found' }, 404);
      resolvedVideoId = vid.videoId;
    }

    // Validate videoId format
    if (!/^[\w-]{11}$/.test(resolvedVideoId)) {
      return json({ error: 'Invalid videoId format' }, 400);
    }

    const audioUrl = await extractAudio(resolvedVideoId);
    if (!audioUrl) return json({ error: 'yt-dlp returned no URL' }, 502);

    return json({
      url: audioUrl,
      videoId: resolvedVideoId,
      title: vid?.title || title,
      artist: vid?.author || artist || '',
      duration: vid?.lengthSeconds || 0,
      source: 'youtube-ytdlp',
    });
  } catch (e) {
    return json({ error: e.message || 'Extraction failed' }, 500);
  }
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
