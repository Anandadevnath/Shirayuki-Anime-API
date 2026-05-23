import { load, axios } from '../../utils/scrapper-deps.js';
import { resolveMalId, getSkipTimes } from './aniskip.js';
import cloudscraper from 'cloudscraper';

const HIANIME_BASE_URL = 'https://hianime.ad';
const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CATEGORY_TAB = { sub: 'tab_1', dub: 'tab_2', hsub: 'tab_0' };

const normalizeAnimeId = (animeEpisodeId) => {
  if (!animeEpisodeId) return null;

  return animeEpisodeId
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/watch\//, '')
    .replace(/\/ep-\d+$/i, '')
    .replace(/\/$/, '')
    .trim() || null;
};

const parseEpisodeNumber = (animeEpisodeId, epQuery) => {
  if (epQuery && Number(epQuery) > 0) {
    return Number(epQuery);
  }

  if (!animeEpisodeId) return 1;

  const pathMatch = animeEpisodeId.match(/\/ep-(\d+)/i);
  if (pathMatch) return Number(pathMatch[1]);

  const queryMatch = animeEpisodeId.match(/[?#&]ep=(\d+)/i);
  if (queryMatch) return Number(queryMatch[1]);

  return 1;
};

const normalizeCategory = (category) => {
  const c = String(category || 'sub').toLowerCase().trim();
  if (c === 'dub' || c === 'd') return 'dub';
  if (c === 'hsub' || c === 'softsub') return 'hsub';
  return 'sub';
};

const normalizeServer = (server) => {
  const raw = String(server || 'hd-1').toLowerCase().replace(/\s+/g, '-').trim();
  return raw || 'hd-1';
};

const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  Referer: referer,
});

const parseServerList = ($, category) => {
  const block = $(`.player-servers .ps_-block[data-id="${category}"]`).first();
  if (!block.length) return [];

  const tab = CATEGORY_TAB[category] || null;

  return block
    .find('a.server-video')
    .map((_, el) => {
      const $el = $(el);
      const name = $el.text().trim() || null;
      const dataVideo = $el.attr('data-video') || null;
      const dataTab = $el.attr('data-tab') || null;
      return {
        name,
        nameId: name ? name.toLowerCase().replace(/\s+/g, '-') : null,
        embed: dataVideo,
        tab: dataTab,
      };
    })
    .get()
    .filter((s) => s.embed && (!tab || s.tab === tab));
};

const pickServer = (servers, requestedServer) => {
  if (!servers.length) return null;

  const target = String(requestedServer || 'hd-1').toLowerCase().trim();

  const exact = servers.find((s) => s.nameId === target);
  if (exact) return exact;

  return servers[0];
};

const extractTracksFromEmbedUrl = (embedUrl) => {
  if (!embedUrl) return [];

  const tracks = [];
  const seen = new Set();
  const url = (() => { try { return new URL(embedUrl); } catch { return null; } })();
  if (!url) return [];

  const params = url.searchParams;

  const directSub = params.get('sub');
  if (directSub && !seen.has(directSub)) {
    seen.add(directSub);
    tracks.push({ file: directSub, label: 'English', kind: 'captions', default: true, forced: false });
  }

  for (const [key, value] of params.entries()) {
    if (!value || !/^https?:\/\//i.test(value)) continue;
    if (seen.has(value)) continue;

    let label = null;
    if (/^caption_\d+$/i.test(key) || /^c\d+_file$/i.test(key) || /^sub_\d+$/i.test(key)) {
      const idx = key.replace(/[^0-9]/g, '');
      const labelKey = key.startsWith('caption_')
        ? `sub_${idx}`
        : key.startsWith('c') && key.endsWith('_file')
        ? `c${idx}_label`
        : null;
      label = labelKey ? params.get(labelKey) : null;
    }

    if (label || /\.(vtt|ass|srt)$/i.test(value)) {
      seen.add(value);
      tracks.push({
        file: value,
        label: label || 'English',
        kind: 'captions',
        default: tracks.length === 0,
        forced: false,
      });
    }
  }

  return tracks;
};

let browserInstance = null;
const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY ||
  process.env.CF_PAGES ||
  process.env.RENDER ||
  process.env.RAILWAY
);

async function getBrowser() {
  if (!browserInstance) {
    const puppeteer = (await import('puppeteer')).default;

    const launchConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process,SafeBrowsing',
        '--disable-client-side-phishing-detection',
        '--no-default-browser-check',
        '--disable-web-resources',
        '--disable-default-apps',
        '--disable-translate',
      ],
    };

    if (isServerless) {
      launchConfig.args.push(
        '--single-process',
        '--disable-gpu'
      );
    }

    browserInstance = await puppeteer.launch(launchConfig);
  }

  return browserInstance;
}

async function resolveEmbedM3u8(watchUrl, embedUrl) {
  if (!embedUrl) return null;

  // Fast path: sometimes the embed link itself is already an m3u8 URL.
  if (/\.m3u8(\?|$)/i.test(embedUrl)) {
    return embedUrl;
  }

  if (isServerless) {
    console.log('[resolveEmbedM3u8] In serverless environment, attempting lightweight extraction');

    // Vercel free tier cannot reliably run Chromium/Puppeteer for this route,
    // so attempt to resolve m3u8 directly from embed HTML/script payloads.
    const extractFirstM3u8 = (text) => {
      if (!text || typeof text !== 'string') return null;

      const match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/i);
      return match ? match[0] : null;
    };

    const tryExtractFromResponse = (payload) => {
      if (!payload) return null;

      if (typeof payload === 'string') {
        return extractFirstM3u8(payload);
      }

      if (typeof payload === 'object') {
        const direct =
          payload?.file ||
          payload?.url ||
          payload?.source ||
          payload?.src ||
          payload?.m3u8 ||
          null;

        if (typeof direct === 'string' && /\.m3u8(\?|$)/i.test(direct)) {
          return direct;
        }

        if (Array.isArray(payload?.sources)) {
          const fromSources = payload.sources.find(
            (s) =>
              (typeof s?.file === 'string' && /\.m3u8(\?|$)/i.test(s.file)) ||
              (typeof s?.url === 'string' && /\.m3u8(\?|$)/i.test(s.url)) ||
              (typeof s?.src === 'string' && /\.m3u8(\?|$)/i.test(s.src))
          );

          if (fromSources?.file) return fromSources.file;
          if (fromSources?.url) return fromSources.url;
          if (fromSources?.src) return fromSources.src;
        }
      }

      return null;
    };

    const headers = {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/json,application/javascript,*/*',
      Referer: watchUrl,
      Origin: HIANIME_BASE_URL,
    };

    // 1) Try cloudscraper first (better chance to bypass CF checks).
    try {
      const res = await cloudscraper({
        url: embedUrl,
        method: 'GET',
        headers,
        timeout: 20000,
        challengeTimeout: 20000,
      });

      const extracted = tryExtractFromResponse(res);
      if (extracted) return extracted;
    } catch (error) {
      console.log('[resolveEmbedM3u8] cloudscraper extraction failed:', error.message);
    }

    // 2) Fallback to axios and parse returned HTML/JSON for any m3u8 links.
    try {
      const res = await axios.get(embedUrl, {
        proxy: false,
        timeout: 20000,
        headers,
      });

      const extracted = tryExtractFromResponse(res?.data);
      if (extracted) return extracted;
    } catch (error) {
      console.log('[resolveEmbedM3u8] axios extraction failed:', error.message);
    }

    return null;
  }

  const timeoutMs = 30000;
  const navigationTimeoutMs = 45000;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(DEFAULT_UA);
    await page.setDefaultNavigationTimeout(navigationTimeoutMs);
    await page.setDefaultTimeout(timeoutMs);

    let capturedUrl = null;

    const capturePromise = page.waitForResponse((response) => {
      const responseUrl = response.url();
      const isM3u8 = /\.m3u8(\?|$)/i.test(responseUrl);
      if (isM3u8 && response.status() >= 200 && response.status() < 400) {
        capturedUrl = responseUrl;
        return true;
      }
      return false;
    }, { timeout: timeoutMs });

    try {
      const hostPageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>host</title></head><body><iframe id="player" src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:0;"></iframe></body></html>`;

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url() === watchUrl) {
          return req.respond({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: hostPageHtml,
          });
        }
        req.continue();
      });

      await page.goto(watchUrl, {
        waitUntil: 'networkidle2',
        timeout: navigationTimeoutMs,
      });

      await capturePromise;
      return capturedUrl;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (error) {
    console.error('[resolveEmbedM3u8] Puppeteer error:', error.message);
    return null;
  }
}

export const getHianimeEpisodeSources = async ({ animeEpisodeId, ep, server, category }) => {
  const animeId = normalizeAnimeId(animeEpisodeId);
  if (!animeId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const episodeNumber = parseEpisodeNumber(animeEpisodeId, ep);
  const normalizedCategory = normalizeCategory(category);
  const normalizedServer = normalizeServer(server);

  const watchUrl = `${HIANIME_BASE_URL}/watch/${animeId}/ep-${episodeNumber}`;

  const watchResp = await axios.get(watchUrl, {
    proxy: false,
    timeout: 20000,
    headers: pageHeaders(HIANIME_BASE_URL),
  });

  const watchHtml = String(watchResp?.data || '');
  if (!watchHtml) {
    throw new Error('Hianime watch page returned empty body');
  }

  const $watch = load(watchHtml);
  const title = $watch('title').first().text().trim() || null;
  const dTitleEl = $watch('.d-title').first();
  const searchTitle =
    dTitleEl.attr('data-jp') || dTitleEl.attr('data-en') || dTitleEl.text().trim() || null;

  const servers = parseServerList($watch, normalizedCategory);
  if (!servers.length) {
    throw new Error(`No ${normalizedCategory.toUpperCase()} servers available for this episode`);
  }

  const picked = pickServer(servers, normalizedServer);
  if (!picked?.embed) {
    throw new Error('Requested Hianime server is unavailable');
  }

  const [m3u8Result, malId] = await Promise.all([
    resolveEmbedM3u8(watchUrl, picked.embed).catch((error) => {
      console.error('[getHianimeEpisodeSources] Failed to resolve embed m3u8:', {
        error: error.message,
        isServerless,
        isVercel,
      });
      return null;
    }),
    resolveMalId(animeId, searchTitle),
  ]);

  const m3u8 = m3u8Result;
  const typeLabel = m3u8 ? 'm3u8' : 'iframe';
  if (!m3u8) {
    console.warn('[getHianimeEpisodeSources] Returning fallback iframe URL', {
      animeId,
      episodeNumber,
      isServerless,
    });
  }

  const { intro, outro } = await getSkipTimes(malId, episodeNumber);

  const tracks = extractTracksFromEmbedUrl(picked.embed);

  return {
    animeId,
    title,
    episode: episodeNumber,
    episodeSlug: `ep-${episodeNumber}`,
    sourcePage: watchUrl,
    malId: malId || null,
    sources: [
      {
        m3u8: m3u8 || picked.embed,
        type: typeLabel,
        quality: null,
        referer: picked.embed,
        server: picked.nameId || normalizedServer,
        category: normalizedCategory,
        embed: picked.embed,
      },
    ],
    tracks,
    intro,
    outro,
  };
};
