import { axios } from '../../utils/scrapper-deps.js';
import cloudscraper from 'cloudscraper';
import cache from '../../utils/cache.js';
import * as zlib from 'zlib';
import { USER_AGENT } from '../../utils/constants.js';

const MIRURO_BASE_URL = 'https://www.miruro.tv';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADLESS_TIMEOUT_MS = 25000;
const PIPE_OBF_KEY = '71951034f8fbcf53d89db52ceb3dc22c';
const PIPE_PROTOCOL_VERSION = '0.2.0';
const HEADLESS_BLOCKED_RESOURCES = new Set(['image', 'stylesheet', 'font']);

let headlessBrowserInstance = null;

const getHeadlessBrowser = async () => {
  if (headlessBrowserInstance) return headlessBrowserInstance;

  const puppeteerModule = await import('puppeteer');
  const puppeteer = puppeteerModule.default || puppeteerModule;
  headlessBrowserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-features=TranslateUI',
      '--disable-sync',
      '--no-first-run',
      '--no-zygote',
      '--window-size=1280,720',
    ],
  });

  return headlessBrowserInstance;
};

process.on('exit', () => {
  if (headlessBrowserInstance) {
    headlessBrowserInstance.close().catch(() => {});
  }
});

const fetchHtmlWithCloudscraper = async (url, referer) => {
  try {
    const result = await cloudscraper({
      url,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: referer || MIRURO_BASE_URL,
      },
      timeout: 12000,
      challengeTimeout: 12000,
    });

    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && typeof result.body === 'string') return result.body;
  } catch {
    return null;
  }

  return null;
};

const fetchHtml = async (url, referer) => {
  const viaCloudscraper = await fetchHtmlWithCloudscraper(url, referer);
  if (viaCloudscraper) return viaCloudscraper;

  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: referer || MIRURO_BASE_URL,
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  return data;
};

const fetchJsonWithCloudscraper = async (url, referer) => {
  try {
    const result = await cloudscraper({
      url,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json,text/plain,*/*',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer || MIRURO_BASE_URL,
      },
      timeout: 12000,
      challengeTimeout: 12000,
    });

    if (result && typeof result === 'object') return result;
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return { raw: result };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const parseEpisodeNumber = (animeEpisodeId, epQuery) => {
  if (epQuery && Number(epQuery) > 0) {
    return Number(epQuery);
  }

  if (!animeEpisodeId) return 1;

  const queryMatch = animeEpisodeId.match(/[?#&]ep=(\d+)/i);
  if (queryMatch) return Number(queryMatch[1]);

  return 1;
};

const normalizeAnimeId = (animeEpisodeId) => {
  if (!animeEpisodeId) return null;

  return animeEpisodeId
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/info\//, '')
    .replace(/^\/watch\//, '')
    .trim();
};

const normalizeCategory = (category) => {
  const c = String(category || 'sub').toLowerCase().trim();
  if (c === 'dub' || c === 'sub') return c;
  return 'sub';
};

const normalizeServer = (server) => {
  const s = String(server || 'telli').toLowerCase().trim();
  const validServers = ['telli', 'ally', 'bee', 'bun', 'nun', 'kiwi', 'dune'];
  if (validServers.includes(s)) return s;
  return 'telli';
};

const parseSubtitleTracksFromM3u8 = (m3u8Content, m3u8Url) => {
  const tracks = [];
  if (!m3u8Content || typeof m3u8Content !== 'string') return tracks;

  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const mediaRegex = /#EXT-X-MEDIA:TYPE=SUBTITLES[^,\n]*(?:,[^,\n]*)*/g;
  const matches = m3u8Content.match(mediaRegex) || [];

  for (const match of matches) {
    const nameMatch = match.match(/NAME="([^"]+)"/);
    const langMatch = match.match(/LANGUAGE="([^"]+)"/);
    const uriMatch = match.match(/URI="([^"]+)"/);
    const defaultMatch = match.match(/DEFAULT=([^,\s]+)/);
    const forcedMatch = match.match(/FORCED=([^,\s]+)/);

    if (uriMatch) {
      let fileUrl = uriMatch[1];

      if (fileUrl.startsWith('//')) {
        fileUrl = 'https:' + fileUrl;
      } else if (fileUrl.startsWith('/')) {
        const urlObj = new URL(m3u8Url);
        fileUrl = `${urlObj.origin}${fileUrl}`;
      } else if (!fileUrl.startsWith('http')) {
        fileUrl = baseUrl + fileUrl;
      }

      tracks.push({
        file: fileUrl,
        label: nameMatch ? nameMatch[1] : (langMatch ? langMatch[1] : 'Unknown'),
        kind: 'subtitle',
        default: defaultMatch ? defaultMatch[1] === 'YES' : false,
        forced: forcedMatch ? forcedMatch[1] === 'YES' : false,
      });
    }
  }

  return tracks;
};

const normalizeTracks = (tracks) => {
  if (!Array.isArray(tracks)) return [];

  const seen = new Set();
  const normalized = [];

  for (const t of tracks) {
    const file = t?.file || t?.src || t?.url || null;
    if (!file || typeof file !== 'string') continue;

    const label = typeof t?.label === 'string' && t.label.trim() ? t.label.trim() : 'Unknown';
    const kind = typeof t?.kind === 'string' && t.kind.trim()
      ? t.kind.trim()
      : (typeof t?.type === 'string' && t.type.trim() ? t.type.trim() : 'captions');
    const def = Boolean(t?.default ?? t?.isDefault ?? false);
    const forced = Boolean(t?.forced ?? false);

    const key = `${file}|${label}|${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({ file, label, kind, default: def, forced });
  }

  return normalized;
};

const base64UrlEncode = (value) => {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const decodePipeResponse = (payload, obfuscatedHeader) => {
  if (!payload) return null;

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  const bytes = Buffer.from(base64 + pad, 'base64');

  let decoded = bytes;
  if (obfuscatedHeader === '2') {
    const keyBytes = PIPE_OBF_KEY.match(/.{2}/g).map((h) => parseInt(h, 16));
    const out = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    decoded = out;
  }

  try {
    const unzipped = zlib.gunzipSync(decoded).toString('utf8');
    return JSON.parse(unzipped);
  } catch {
    try {
      return JSON.parse(decoded.toString('utf8'));
    } catch {
      return null;
    }
  }
};

const fetchSecurePipe = async ({ path, method = 'GET', query = {}, body = null }) => {
  const payload = {
    path,
    method,
    query,
    body,
    version: PIPE_PROTOCOL_VERSION,
  };

  const url = `${MIRURO_BASE_URL}/api/secure/pipe?e=${base64UrlEncode(payload)}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Referer: MIRURO_BASE_URL,
    },
    responseType: 'text',
    timeout: 15000,
    validateStatus: () => true,
  });

  if (!response || response.status >= 400) return null;
  const obfuscated = response.headers?.['x-obfuscated'] || response.headers?.['X-Obfuscated'] || null;
  const text = typeof response.data === 'string' ? response.data : String(response.data || '');
  return decodePipeResponse(text, obfuscated);
};

const fetchMiruroSkipData = async (animeId, episodeNumber) => {
  if (!animeId || !episodeNumber) return { intro: null, outro: null };

  try {
    const data = await fetchSecurePipe({
      path: 'episodes',
      method: 'GET',
      query: { anilistId: String(animeId) },
    });

    const skipEntries = Array.isArray(data?.aniskip)
      ? data.aniskip
      : (Array.isArray(data?.mappings?.aniskip) ? data.mappings.aniskip : []);
    if (!skipEntries.length) {
      console.log('[getMiruroEpisodeSources] No aniskip entries found for animeId:', animeId);
    }
    const matching = skipEntries.filter((entry) => Number(entry?.episode) === Number(episodeNumber));
    if (!matching.length && skipEntries.length) {
      console.log('[getMiruroEpisodeSources] No aniskip match for episode:', episodeNumber);
    }
    const introEntry = matching.find((entry) => String(entry?.type || '').toLowerCase() === 'op');
    const outroEntry = matching.find((entry) => String(entry?.type || '').toLowerCase() === 'ed');

    const intro = introEntry
      ? { start: introEntry.start, end: introEntry.end, type: introEntry.type, provider: introEntry.provider }
      : null;
    const outro = outroEntry
      ? { start: outroEntry.start, end: outroEntry.end, type: outroEntry.type, provider: outroEntry.provider }
      : null;

    return { intro, outro };
  } catch (error) {
    console.log('[getMiruroEpisodeSources] Failed to fetch skip data:', error?.message || 'unknown');
    return { intro: null, outro: null };
  }
};

const applySkipData = async (intro, outro, animeId, episodeNumber) => {
  if (intro || outro) return { intro, outro };
  return fetchMiruroSkipData(animeId, episodeNumber);
};

const resolveM3u8Metadata = async (m3u8Url, referer) => {
  if (!m3u8Url) return { tracks: [], intro: null, outro: null };

  try {
    const resp = await axios.get(m3u8Url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Referer: referer || MIRURO_BASE_URL,
      },
      timeout: 12000,
      validateStatus: () => true,
    });

    const tracks = normalizeTracks(parseSubtitleTracksFromM3u8(resp?.data || '', m3u8Url));
    return { tracks, intro: null, outro: null };
  } catch {
    return { tracks: [], intro: null, outro: null };
  }
};

const resolveUrl = (baseUrl, value) => {
  if (!value || !baseUrl) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('//')) {
    const base = new URL(baseUrl);
    return `${base.protocol}${trimmed}`;
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
};

const collectCandidateUrls = ($, scriptsText, baseUrl = null) => {
  const urls = new Set();
  const attrNames = ['data-embed', 'data-src', 'data-url', 'data-source', 'data-player', 'data-iframe', 'data-file'];

  attrNames.forEach((attr) => {
    `[${attr}]`;
    $(`[${attr}]`).each((_, el) => {
      const value = $(el).attr(attr);
      if (!value) return;
      const resolved = resolveUrl(baseUrl, value) || (value.startsWith('http') ? value.trim() : null);
      if (resolved) urls.add(resolved);
    });
  });

  $('iframe, video, source').each((_, el) => {
    const value = $(el).attr('src');
    if (!value) return;
    const resolved = resolveUrl(baseUrl, value) || (value.startsWith('http') ? value.trim() : null);
    if (resolved) urls.add(resolved);
  });

  if (scriptsText) {
    const matches = scriptsText.match(/https?:\/\/[^"'\s<>]+/g) || [];
    matches.forEach((url) => urls.add(url.trim()));

    const callRegex = /(fetch|axios\.(get|post)|\$\.(get|post))\(\s*['"]([^'"]+)['"]/gi;
    let match = callRegex.exec(scriptsText);
    while (match) {
      const value = match[4];
      const resolved = resolveUrl(baseUrl, value);
      if (resolved) urls.add(resolved);
      match = callRegex.exec(scriptsText);
    }
  }

  return [...urls];
};

const pickBestEmbedUrl = (candidates, serverName) => {
  if (!candidates || candidates.length === 0) return null;
  const serverKey = String(serverName || '').toLowerCase();

  const byServer = candidates.filter((url) => url.toLowerCase().includes(serverKey));
  const byEmbed = (list) => list.find((url) => /embed|player|source|stream/i.test(url));
  const byM3u8 = (list) => list.find((url) => url.toLowerCase().includes('.m3u8'));

  return (
    byM3u8(byServer) ||
    byEmbed(byServer) ||
    byM3u8(candidates) ||
    byEmbed(candidates) ||
    candidates[0]
  );
};

const extractTracksFromMediaData = (mediaData) => {
  if (!mediaData) return [];

  const candidates = [];
  if (Array.isArray(mediaData?.tracks)) candidates.push(...mediaData.tracks);
  if (Array.isArray(mediaData?.subtitles)) candidates.push(...mediaData.subtitles);
  if (Array.isArray(mediaData?.captions)) candidates.push(...mediaData.captions);
  if (mediaData?.track) {
    if (Array.isArray(mediaData.track)) candidates.push(...mediaData.track);
    else candidates.push(mediaData.track);
  }

  return normalizeTracks(candidates);
};

const extractSkipData = (mediaData) => {
  if (!mediaData) return { intro: null, outro: null };

  const intro = mediaData?.skip?.intro ?? mediaData?.intro ?? null;
  const outro = mediaData?.skip?.outro ?? mediaData?.outro ?? null;

  return { intro, outro };
};

const extractM3u8FromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
  return match ? match[0] : null;
};

const extractM3u8FromPayload = (payload) => {
  if (!payload) return null;
  if (typeof payload === 'string') return extractM3u8FromText(payload);

  const pick = (value) => (typeof value === 'string' && value.includes('.m3u8') ? value : null);
  const direct = pick(payload?.source) || pick(payload?.file) || pick(payload?.url) || pick(payload?.src);
  if (direct) return direct;

  const nested = payload?.data || payload?.result || payload?.stream || payload?.media;
  const nestedDirect = pick(nested?.source) || pick(nested?.file) || pick(nested?.url) || pick(nested?.src);
  if (nestedDirect) return nestedDirect;

  const sources = payload?.sources || payload?.data?.sources || payload?.result?.sources || payload?.stream?.sources;
  if (Array.isArray(sources)) {
    for (const entry of sources) {
      const url = pick(entry?.file) || pick(entry?.src) || pick(entry?.url) || pick(entry?.source);
      if (url) return url;
    }
  }

  return extractM3u8FromText(JSON.stringify(payload));
};

const tryFetchEmbedApiSources = async ({ candidates, referer }) => {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const filtered = candidates.filter((url) => /api|ajax|source|stream|playlist|player|media/i.test(url));
  const targets = filtered.length ? filtered : candidates;

  for (const url of targets.slice(0, 6)) {
    try {
      const cloudData = await fetchJsonWithCloudscraper(url, referer);
      const payload = cloudData?.raw ? cloudData.raw : cloudData;
      const m3u8 = extractM3u8FromPayload(payload);
      if (m3u8) return { m3u8Url: m3u8, mediaData: payload };

        const resp = await axios.get(url, {
        headers: {
          'User-Agent': DEFAULT_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: referer || MIRURO_BASE_URL,
          Accept: 'application/json,text/plain,*/*',
        },
        timeout: API_TIMEOUT_MS,
        validateStatus: () => true,
      });

      const m3u8Direct = extractM3u8FromPayload(resp?.data);
      if (m3u8Direct) return { m3u8Url: m3u8Direct, mediaData: resp?.data };
    } catch {
      continue;
    }
  }

  return null;
};

const extractM3u8WithPuppeteer = async (targetUrl, referer, serverName, category) => {
  if (process.env.MIRURO_USE_HEADLESS === 'false') return null;

  let browser;
  let page;
  let m3u8Url = null;
  let mediaData = null;
  const responsePromises = [];

  try {
    browser = await getHeadlessBrowser();

    page = await browser.newPage();
    await page.setCacheEnabled(true);
    await page.setUserAgent(DEFAULT_UA);
    if (referer) {
      await page.setExtraHTTPHeaders({ Referer: referer });
    }

    await page.setRequestInterception(true);

    const captureUrl = (url) => {
      if (url && url.includes('.m3u8')) {
        m3u8Url = url;
      }
    };

    page.on('request', (req) => {
      captureUrl(req.url());
      const type = req.resourceType();
      if (HEADLESS_BLOCKED_RESOURCES.has(type)) {
        req.abort().catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    page.on('response', (res) => {
      captureUrl(res.url());
      const headers = res.headers();
      const contentType = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
      if (!contentType.includes('application/json')) return;

      responsePromises.push(
        res.text()
          .then((text) => {
            const payload = JSON.parse(text);
            if (payload && typeof payload === 'object') {
              mediaData = payload;
            }
          })
          .catch(() => null)
      );
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: HEADLESS_TIMEOUT_MS });

    // Additional wait for video player to initialize
    await new Promise((resolve) => setTimeout(resolve, 4000));

    let initialM3u8 = m3u8Url;
    let selectionResult = null;

    // Try to interact with controls inside iframe (where the actual player is)
    const iframeElement = await page.$('iframe[src*="2anime"]');
    if (iframeElement) {
      try {
        const frame = await iframeElement.contentFrame();
        if (frame) {
          // Wait for iframe to load its content
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Try to capture m3u8 from iframe network requests
          frame.on('request', (req) => {
            const url = req.url();
            if (url && url.includes('.m3u8')) {
              m3u8Url = url;
            }
          });

          // Try to click server/category buttons inside iframe
          selectionResult = await frame.evaluate(
            async ({ server, categoryLabel }) => {
              const normalize = (value) => String(value || '').toLowerCase().trim();
              const targetServer = normalize(server);
              const targetCategory = normalize(categoryLabel);

              // Try multiple selector patterns for controls
              const getTriggers = () => {
                return Array.from(document.querySelectorAll('button, [role="button"], .btn, [class*="trigger"], [class*="button"], [class*="select"]'));
              };
              const getItems = () => {
                return Array.from(document.querySelectorAll('[class*="item"], [class*="option"], li, .dropdown-item'));
              };

              const clickItem = (textMatch) => {
                const items = getItems();
                for (const node of items) {
                  const text = normalize(node.textContent || '');
                  if (text === textMatch) {
                    node.click();
                    return true;
                  }
                }
                return false;
              };

              let categoryTrigger = null;
              let serverTrigger = null;
              let currentCategory = null;
              let currentServer = null;

              // Find all buttons and categorize them
              for (const trigger of getTriggers()) {
                const text = normalize(trigger.textContent || '');
                if (text === 'sub' || text === 'dub') {
                  categoryTrigger = trigger;
                  currentCategory = text;
                } else if (['telli', 'ally', 'bee', 'bun', 'nun', 'kiwi', 'dune'].includes(text)) {
                  serverTrigger = trigger;
                  currentServer = text;
                }
              }

              const needsCategoryChange = currentCategory && currentCategory !== targetCategory;
              const needsServerChange = currentServer && currentServer !== targetServer;
              const changeRequested = needsCategoryChange || needsServerChange;

              // Check if target server/category exists in available items
              const availableItems = getItems().map(n => normalize(n.textContent || ''));
              const hasTargetCategory = availableItems.includes(targetCategory);
              const hasTargetServer = availableItems.includes(targetServer);

              if (needsCategoryChange && categoryTrigger && hasTargetCategory) {
                categoryTrigger.click();
                await new Promise((resolve) => setTimeout(resolve, 600));
                clickItem(targetCategory);
                await new Promise((resolve) => setTimeout(resolve, 800));
              }

              if (needsServerChange && serverTrigger && hasTargetServer) {
                serverTrigger.click();
                await new Promise((resolve) => setTimeout(resolve, 600));
                clickItem(targetServer);
                await new Promise((resolve) => setTimeout(resolve, 800));
              }

              return { changeRequested, currentCategory, currentServer, hasTargetCategory, hasTargetServer, availableItems };
            },
            { server: serverName, categoryLabel: category }
          );
        }
      } catch (iframeError) {
        console.log('[extractM3u8WithPuppeteer] Iframe interaction error:', iframeError.message);
      }
    }

    // Fallback: try parent page controls if iframe didn't work
    if (!selectionResult) {
      selectionResult = await page.evaluate(
        async ({ server, categoryLabel }) => {
          const normalize = (value) => String(value || '').toLowerCase().trim();
          const targetServer = normalize(server);
          const targetCategory = normalize(categoryLabel);

          const getTriggers = () => Array.from(document.querySelectorAll('button[class*="_trigger_"], [class*="server"], [class*="category"]'));
          const getItems = () => Array.from(document.querySelectorAll('[class*="_item_"], [class*="option"]'));

          const clickItem = (textMatch) => {
            for (const node of getItems()) {
              const text = normalize(node.textContent || '');
              if (text === textMatch) {
                const target = node.closest('button') || node;
                target.click();
                return true;
              }
            }
            return false;
          };

          let categoryTrigger = null;
          let serverTrigger = null;
          let currentCategory = null;
          let currentServer = null;

          for (const trigger of getTriggers()) {
            const text = normalize(trigger.textContent || '');
            if (text === 'sub' || text === 'dub') {
              categoryTrigger = trigger;
              currentCategory = text;
            } else if (['telli', 'ally', 'bee', 'bun', 'nun', 'kiwi', 'dune'].includes(text)) {
              serverTrigger = trigger;
              currentServer = text;
            }
          }

          const needsCategoryChange = currentCategory && currentCategory !== targetCategory;
          const needsServerChange = currentServer && currentServer !== targetServer;
          const changeRequested = needsCategoryChange || needsServerChange;

          if (needsCategoryChange && categoryTrigger) {
            categoryTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 600));
            clickItem(targetCategory);
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          if (needsServerChange && serverTrigger) {
            serverTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 600));
            clickItem(targetServer);
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          return { changeRequested, currentCategory, currentServer };
        },
        { server: serverName, categoryLabel: category }
      );
    }

    if (!selectionResult?.changeRequested && initialM3u8) {
      await Promise.allSettled(responsePromises);
      return { m3u8Url: initialM3u8, mediaData };
    }

    m3u8Url = null;
    const endAt = Date.now() + 8000;
    while ((!m3u8Url || m3u8Url === initialM3u8) && Date.now() < endAt) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!m3u8Url || m3u8Url === initialM3u8) {
      await page.evaluate(
        async ({ server, categoryLabel }) => {
          const normalize = (value) => String(value || '').toLowerCase().trim();
          const targetServer = normalize(server);
          const targetCategory = normalize(categoryLabel);

          const getItems = () => Array.from(document.querySelectorAll('[class*="_item_"]'));
          const getTriggers = () => Array.from(document.querySelectorAll('button[class*="_trigger_"]'));

          const clickItem = (textMatch) => {
            for (const node of getItems()) {
              const text = normalize(node.textContent || '');
              if (text === textMatch) {
                const target = node.closest('button') || node;
                target.click();
                return true;
              }
            }
            return false;
          };

          const triggers = getTriggers();
          const categoryTrigger = triggers.find((t) => {
            const text = normalize(t.textContent || '');
            return text === 'sub' || text === 'dub';
          });
          const serverTrigger = triggers.find((t) => {
            const text = normalize(t.textContent || '');
            return text && text !== 'sub' && text !== 'dub';
          });

          const items = getItems().map((node) => normalize(node.textContent || ''));
          const otherCategory = items.find((text) => text && text !== targetCategory && (text === 'sub' || text === 'dub'));
          const otherServer = items.find((text) => text && text !== targetServer && text !== 'sub' && text !== 'dub');

          if (categoryTrigger && otherCategory) {
            categoryTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            clickItem(otherCategory);
            await new Promise((resolve) => setTimeout(resolve, 800));
            categoryTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            clickItem(targetCategory);
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          if (serverTrigger && otherServer) {
            serverTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            clickItem(otherServer);
            await new Promise((resolve) => setTimeout(resolve, 800));
            serverTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            clickItem(targetServer);
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        },
        { server: serverName, categoryLabel: category }
      );

      const retryEndAt = Date.now() + 8000;
      while ((!m3u8Url || m3u8Url === initialM3u8) && Date.now() < retryEndAt) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    await Promise.allSettled(responsePromises);
  } catch {
    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }

  return { m3u8Url, mediaData };
};

export const getMiruroEpisodeSources = async ({ animeEpisodeId, ep, server, category }) => {
  const startedAt = Date.now();
  const animeId = normalizeAnimeId(animeEpisodeId);

  if (!animeId) {
    throw new Error('animeEpisodeId query parameter is required');
  }

  const episodeNumber = parseEpisodeNumber(animeEpisodeId, ep);
  const normalizedServer = normalizeServer(server);
  const normalizedCategory = normalizeCategory(category);
  const cacheKey = `miruro:sources:${animeId}:${episodeNumber}:${normalizedServer}:${normalizedCategory}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const watchUrl = `${MIRURO_BASE_URL}/watch/${animeId}?ep=${episodeNumber}`;

  const withCache = (payload) => {
    const finalized = {
      ...payload,
      extractionTimeMs: Date.now() - startedAt,
    };
    cache.set(cacheKey, finalized);
    return finalized;
  };

  // Try to fetch the watch page to get video source
  try {
    const { load } = await import('cheerio');
    const html = await fetchHtml(watchUrl, MIRURO_BASE_URL);

    const $ = load(html);

    // Look for video sources in the page
    const videoSrc = $('video source').attr('src') || $('video').attr('src') || null;
    const iframeSrc = $('iframe').attr('src') || null;

    // Look for any m3u8 or mp4 URLs in scripts
    const scripts = $('script:not([src])').map((_, el) => $(el).text()).get().join(' ');

    // Multiple patterns for m3u8 URLs
    const m3u8Patterns = [
      /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/,
      /(https?:\/\/[^"'\s]+\.m3u8)/,
      /["'](https?:\/\/[^"'\s]*stream[^"'\s]*\.m3u8[^"'\s]*)["']/,
      /["'](https?:\/\/[^"'\s]*video[^"'\s]*\.m3u8[^"'\s]*)["']/,
      /["'](https?:\/\/[^"'\s]*embed[^"'\s]*\.m3u8[^"'\s]*)["']/,
    ];

    let m3u8Url = null;
    for (const pattern of m3u8Patterns) {
      const match = scripts.match(pattern);
      if (match) {
        m3u8Url = match[1] || match[0];
        break;
      }
    }

    // Also check for .file or .url properties in JSON data
    if (!m3u8Url) {
      const fileMatch = scripts.match(/["']file["']\s*:\s*["'](https?:\/\/[^"'\s]+)["']/);
      const urlMatch = scripts.match(/["']url["']\s*:\s*["'](https?:\/\/[^"'\s]+)["']/);
      const sourceMatch = scripts.match(/["']source["']\s*:\s*["'](https?:\/\/[^"'\s]+)["']/);
      m3u8Url = fileMatch?.[1] || urlMatch?.[1] || sourceMatch?.[1] || null;
      if (m3u8Url && !m3u8Url.includes('.m3u8')) {
        m3u8Url = null;
      }
    }

    // Check for embed URLs that might lead to m3u8
    const embedMatch = scripts.match(/["']embed["']\s*:\s*["'](https?:\/\/[^"'\s]+)["']/);
    const candidates = collectCandidateUrls($, scripts, watchUrl);
    const embedUrl = embedMatch?.[1] || iframeSrc || pickBestEmbedUrl(candidates, normalizedServer) || null;

    const source = m3u8Url || (videoSrc && videoSrc.includes('.m3u8') ? videoSrc : null);

    if (source) {
      const [meta, skipData] = await Promise.all([
        resolveM3u8Metadata(source, MIRURO_BASE_URL),
        fetchMiruroSkipData(animeId, episodeNumber),
      ]);
      return withCache({
        animeId,
        episode: episodeNumber,
        sourcePage: watchUrl,
        sources: [
          {
            source,
            type: 'm3u8',
            quality: null,
            referer: MIRURO_BASE_URL,
            server: normalizedServer,
            category: normalizedCategory,
          },
        ],
        tracks: meta.tracks,
        intro: skipData.intro ?? meta.intro,
        outro: skipData.outro ?? meta.outro,
        note: 'Direct m3u8 stream found',
      });
    }

    if (embedUrl) {
      const embedSource = await (async () => {
        try {
          const embedHtml = await fetchHtml(embedUrl, MIRURO_BASE_URL);

          const { load: loadEmbed } = await import('cheerio');
          const $embed = loadEmbed(embedHtml);
          const embedScripts = $embed('script:not([src])').map((_, el) => $embed(el).text()).get().join(' ');
          const embedCandidates = collectCandidateUrls($embed, embedScripts, embedUrl);
          return pickBestEmbedUrl(embedCandidates, normalizedServer);
        } catch {
          return null;
        }
      })();

      if (embedSource && embedSource.includes('.m3u8')) {
          const [meta, skipData] = await Promise.all([
            resolveM3u8Metadata(embedSource, embedUrl),
            fetchMiruroSkipData(animeId, episodeNumber),
          ]);
          return withCache({
          animeId,
          episode: episodeNumber,
          sourcePage: watchUrl,
          sources: [
            {
              source: embedSource,
              type: 'm3u8',
              quality: null,
              referer: embedUrl,
              server: normalizedServer,
              category: normalizedCategory,
            },
          ],
          tracks: meta.tracks,
          intro: skipData.intro ?? meta.intro,
          outro: skipData.outro ?? meta.outro,
          note: 'm3u8 extracted from embed URL',
        });
      }
    }
  } catch (error) {
    console.log('[getMiruroEpisodeSources] Fetch error:', error.message);
  }

  // Try direct API call first (most reliable for sub/dub differentiation)
  try {
    const apiBaseUrls = {
      'telli': 'https://telli.2anime.xyz',
      'ally': 'https://ally.2anime.xyz',
      'bee': 'https://bee.2anime.xyz',
      'bun': 'https://bun.2anime.xyz',
      'nun': 'https://nun.2anime.xyz',
      'kiwi': 'https://kiwi.2anime.xyz',
      'dune': 'https://dune.2anime.xyz',
    };
    const apiBase = apiBaseUrls[normalizedServer] || apiBaseUrls['telli'];

    // Try multiple API endpoints that might return different m3u8 for sub/dub
    const apiEndpoints = [
      `${apiBase}/api/video?id=${animeId}&ep=${episodeNumber}&dub=${normalizedCategory === 'dub' ? 1 : 0}`,
      `${apiBase}/api/source?id=${animeId}&ep=${episodeNumber}&dub=${normalizedCategory === 'dub' ? 1 : 0}`,
      `${apiBase}/api/stream?id=${animeId}&ep=${episodeNumber}&dub=${normalizedCategory === 'dub' ? 1 : 0}`,
      `${apiBase}/api/v1/m3u8/${animeId}/${episodeNumber}?dub=${normalizedCategory === 'dub' ? 1 : 0}`,
    ];

    // Parallelize API endpoint requests and return on first successful m3u8
    try {
      const endpointPromises = apiEndpoints.map((apiUrl) =>
        axios
          .get(apiUrl, {
            headers: {
              'User-Agent': DEFAULT_UA,
              'X-Requested-With': 'XMLHttpRequest',
              Referer: `${apiBase}/`,
              Accept: 'application/json,text/plain,*/*',
            },
            timeout: API_TIMEOUT_MS,
            validateStatus: () => true,
          })
          .then((resp) => ({ apiUrl, data: resp?.data }))
          .catch(() => null)
      );

      const settled = await Promise.all(endpointPromises);
      for (const res of settled) {
        if (!res || !res.data) continue;
        const m3u8 = extractM3u8FromPayload(res.data);
        if (m3u8) {
          const meta = await resolveM3u8Metadata(m3u8, apiBase);
          const skipData = await applySkipData(meta.intro, meta.outro, animeId, episodeNumber);
          return withCache({
            animeId,
            episode: episodeNumber,
            sourcePage: watchUrl,
            sources: [{
              source: m3u8,
              type: 'm3u8',
              quality: null,
              referer: apiBase,
              server: normalizedServer,
              category: normalizedCategory,
            }],
            tracks: meta.tracks,
            intro: skipData.intro ?? meta.intro,
            outro: skipData.outro ?? meta.outro,
            note: `m3u8 from ${normalizedCategory} API`,
          });
        }
      }
    } catch (e) {
      console.log('[getMiruroEpisodeSources] Parallel API error:', e?.message || e);
    }
  } catch (apiError) {
    console.log('[getMiruroEpisodeSources] Direct API error:', apiError.message);
  }

  // Try to get embed page source
  try {
    // Construct potential embed URLs based on server and category (sub/dub)
    const dubParam = normalizedCategory === 'dub' ? '?dub=1' : '';
    const serverUrls = {
      'telli': `https://telli.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'ally': `https://ally.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'bee': `https://bee.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'bun': `https://bun.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'nun': `https://nun.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'kiwi': `https://kiwi.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
      'dune': `https://dune.2anime.xyz/embed/${animeId}/${episodeNumber}${dubParam}`,
    };

    const embedUrl = serverUrls[normalizedServer] || serverUrls['telli'];

    const embedHtml = await fetchHtml(embedUrl, MIRURO_BASE_URL);

    const { load } = await import('cheerio');
    const $embed = load(embedHtml);

    // Look for video in embed page
    const embedVideoSrc = $embed('video source').attr('src') || $embed('video').attr('src') || null;

    // Search scripts in embed page
    const embedScripts = $embed('script:not([src])').map((_, el) => $embed(el).text()).get().join(' ');
    const embedCandidates = collectCandidateUrls($embed, embedScripts, embedUrl);

    // Look for m3u8 in embed scripts - include ultracloud.cc pattern
    const embedM3u8Patterns = [
      /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i,
      /(https?:\/\/[^"'\s]+\.m3u8)/i,
      /["'](https?:\/\/[^"'\s]*\.m3u8[^"'\s]*)["']/i,
      /["'](https?:\/\/[^"'\s]*pl\.m3u8[^"'\s]*)["']/i,
      /["'](https?:\/\/[^"'\s]*index\.m3u8[^"'\s]*)["']/i,
      /file\s*:\s*["'](https?:\/\/[^"'\s]+)["']/i,
      /src\s*:\s*["'](https?:\/\/[^"'\s]+)["']/i,
      /url\s*:\s*["'](https?:\/\/[^"'\s]+)["']/i,
      /(https?:\/\/[^"'\s]*ultracloud[^"'\s]*\.m3u8[^"'\s]*)/i,
    ];

    let embedM3u8 = null;
    for (const pattern of embedM3u8Patterns) {
      const match = embedScripts.match(pattern);
      if (match) {
        embedM3u8 = match[1] || match[0];
        break;
      }
    }

    const embedSource = embedM3u8 || embedVideoSrc || null;

      if (embedSource) {
      const isM3u8 = embedSource.includes('.m3u8');
      const [meta, skipData] = isM3u8
        ? await Promise.all([resolveM3u8Metadata(embedSource, embedUrl), fetchMiruroSkipData(animeId, episodeNumber)])
        : [{ tracks: [], intro: null, outro: null }, await fetchMiruroSkipData(animeId, episodeNumber)];

      return withCache({
        animeId,
        episode: episodeNumber,
        sourcePage: watchUrl,
        sources: [
          {
            source: embedSource,
            type: isM3u8 ? 'm3u8' : 'mp4',
            quality: null,
            referer: embedUrl,
            server: normalizedServer,
            category: normalizedCategory,
          },
        ],
        tracks: meta.tracks,
        intro: skipData.intro ?? meta.intro,
        outro: skipData.outro ?? meta.outro,
        note: isM3u8 ? 'm3u8 extracted from embed page' : 'Video source from embed page',
      });
    }

    const apiResult = await tryFetchEmbedApiSources({ candidates: embedCandidates, referer: embedUrl });
    if (apiResult?.m3u8Url) {
      const [meta, skipDataFromApi] = await Promise.all([
        resolveM3u8Metadata(apiResult.m3u8Url, embedUrl),
        fetchMiruroSkipData(animeId, episodeNumber),
      ]);
      const extractedTracks = extractTracksFromMediaData(apiResult.mediaData);
      const skipData = extractSkipData(apiResult.mediaData);
      const tracks = extractedTracks.length ? extractedTracks : meta.tracks;
      const fallbackSkip = { intro: skipData.intro ?? skipDataFromApi.intro, outro: skipData.outro ?? skipDataFromApi.outro };
      return withCache({
        animeId,
        episode: episodeNumber,
        sourcePage: watchUrl,
        sources: [
          {
            source: apiResult.m3u8Url,
            type: 'm3u8',
            quality: null,
            referer: embedUrl,
            server: normalizedServer,
            category: normalizedCategory,
          },
        ],
        tracks,
        intro: fallbackSkip.intro ?? meta.intro,
        outro: fallbackSkip.outro ?? meta.outro,
        note: 'm3u8 extracted from embed API',
      });
    }
  } catch (embedError) {
    console.log('[getMiruroEpisodeSources] Embed fetch error:', embedError.message);
  }

  // Headless fallback to capture m3u8 from dynamic requests
  try {
    const serverList = ['telli', 'ally', 'bee', 'bun', 'nun', 'kiwi', 'dune'];
    let m3u8 = null;
    let mediaData = null;
    let usedServer = normalizedServer;
    let serverAvailable = true;

    // First try the requested server
    console.log(`[getMiruroEpisodeSources] Trying puppeteer for ${normalizedServer} ${normalizedCategory}`);
    const watchResult = await extractM3u8WithPuppeteer(
      watchUrl,
      MIRURO_BASE_URL,
      normalizedServer,
      normalizedCategory
    );

    if (watchResult?.m3u8Url) {
      m3u8 = watchResult.m3u8Url;
      mediaData = watchResult.mediaData;
    }

    // If no m3u8, try other servers as fallback
    if (!m3u8) {
      console.log(`[getMiruroEpisodeSources] ${normalizedServer} failed, trying other servers...`);
      for (const server of serverList) {
        if (server === normalizedServer) continue;

        try {
          console.log(`[getMiruroEpisodeSources] Trying fallback server: ${server}`);
          const fallbackResult = await extractM3u8WithPuppeteer(
            watchUrl,
            MIRURO_BASE_URL,
            server,
            normalizedCategory
          );

          if (fallbackResult?.m3u8Url) {
            m3u8 = fallbackResult.m3u8Url;
            mediaData = fallbackResult.mediaData;
            usedServer = server;
            serverAvailable = false;
            console.log(`[getMiruroEpisodeSources] Success with fallback server: ${server}`);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (m3u8) {
      const [meta, skipDataFromApi] = await Promise.all([
        resolveM3u8Metadata(m3u8, MIRURO_BASE_URL),
        fetchMiruroSkipData(animeId, episodeNumber),
      ]);
      const extractedTracks = extractTracksFromMediaData(mediaData);
      const skipData = extractSkipData(mediaData);
      const tracks = extractedTracks.length ? extractedTracks : meta.tracks;
      const fallbackSkip = { intro: skipData.intro ?? skipDataFromApi.intro, outro: skipData.outro ?? skipDataFromApi.outro };

      const note = serverAvailable
        ? 'm3u8 captured from headless browser requests'
        : `m3u8 captured from fallback server (${usedServer} instead of ${normalizedServer})`;

      return withCache({
        animeId,
        episode: episodeNumber,
        sourcePage: watchUrl,
        sources: [
          {
            source: m3u8,
            type: 'm3u8',
            quality: null,
            referer: MIRURO_BASE_URL,
            server: usedServer,
            category: normalizedCategory,
          },
        ],
        tracks,
        intro: fallbackSkip.intro ?? meta.intro,
        outro: fallbackSkip.outro ?? meta.outro,
        note,
      });
    }
  } catch (headlessError) {
    console.log('[getMiruroEpisodeSources] Headless fetch error:', headlessError.message);
  }

  // Final fallback: return the watch URL as iframe source
  return withCache({
    animeId,
    episode: episodeNumber,
    sourcePage: watchUrl,
    sources: [
      {
        source: watchUrl,
        type: 'iframe',
        quality: null,
        referer: MIRURO_BASE_URL,
        server: normalizedServer,
        category: normalizedCategory,
      },
    ],
    tracks: [],
    intro: null,
    outro: null,
    note: 'Miruro.tv uses client-side video loading. Try using puppeteer or browser automation to extract actual m3u8 sources.',
  });
};
