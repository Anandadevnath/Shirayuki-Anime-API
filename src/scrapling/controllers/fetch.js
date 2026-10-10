import scraplingFetch from "../index.js";

const parseJsonQuery = (value) => {
  if (!value) return {};
  try {
    const obj = JSON.parse(value);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
};

export const scraplingFetchController = async (c) => {
  const url = c.req.query("url") || null;
  const js = c.req.query("js") === "true";
  const proxy = c.req.query("proxy") || null;
  const headers = parseJsonQuery(c.req.query("headers"));
  const extract = Array.isArray(parseJsonQuery(c.req.query("extract")))
    ? parseJsonQuery(c.req.query("extract"))
    : null;
  const timeout = Number(c.req.query("timeout") || 25);

  if (!url) {
    return c.json({ success: false, error: "url query parameter is required" }, 400);
  }
  if (!/^https?:\/\//i.test(url)) {
    return c.json({ success: false, error: "url must be http(s)" }, 400);
  }

  const start = Date.now();
  try {
    const result = await scraplingFetch({ url, js, proxy, headers, extract, timeout });
    const extractionTimeSec = Number(((Date.now() - start) / 1000).toFixed(3));
    return c.json({
      success: !!result.ok,
      ...result,
      extractionTimeSec,
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
};
