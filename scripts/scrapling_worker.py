#!/usr/bin/env python3
"""
Scrapling fetch worker for the Shirayuki-Anime-API Node bridge.

Reads a JSON request object from stdin:
{
  "url": "https://...",
  "js": false,                 # true => render with a real browser
  "stealth": false,            # true => StealthyFetcher (anti-bot; needs fetchers extras)
  "proxy": "http://...",       # optional
  "headers": {"key": "val"},   # optional extra headers
  "extract": [                 # optional list of selectors to pull from the page
    {"name": "title", "kind": "css", "selector": "h1::text"},
    {"name": "links", "kind": "xpath", "selector": "//a/@href", "many": true}
  ],
  "timeout": 25               # seconds, best-effort
}

Writes a JSON result object to stdout: { ok, status, url, text, extracts, error }.
The worker runs inside the project .venv which already has `scrapling` installed.
`js`/`stealth` require the fetcher/browser extras
(`pip install "scrapling[fetchers]"` then `scrapling install`), which may not be
present - we report that cleanly instead of crashing the bridge.
"""
import json
import sys
import traceback


def fetch_page(req):
    """Return the parsed page from fetching `url`. Raises on failure."""
    from scrapling.fetchers import Fetcher, DynamicFetcher, StealthyFetcher

    headers = req.get("headers") or {}
    proxy = req.get("proxy")
    timeout = req.get("timeout") or 25

    if req.get("stealth"):
        if not hasattr(StealthyFetcher, "fetch"):
            raise RuntimeError("stealth features not installed - run: pip install 'scrapling[fetchers]' && scrapling install")
        return StealthyFetcher.fetch(req["url"], headless=True, network_idle=True)

    if req.get("js"):
        if not hasattr(DynamicFetcher, "fetch"):
            raise RuntimeError("js features not installed - run: pip install 'scrapling[fetchers]' && scrapling install")
        return DynamicFetcher.fetch(req["url"], headless=True, network_idle=True)

    return Fetcher.get(req["url"], headers=headers, proxy=proxy, timeout=timeout)


def run_extracts(page, extracts):
    out = {}
    for spec in extracts or []:
        name = spec.get("name") or spec.get("selector") or "item"
        kind = (spec.get("kind") or "css").lower()
        selector = spec.get("selector")
        many = bool(spec.get("many"))
        try:
            if kind == "xpath":
                nodes = page.xpath(selector)
            else:  # css (supports ::text)
                nodes = page.css(selector)
            if hasattr(nodes, "getall"):
                values = [str(n) for n in nodes.getall()]
            elif isinstance(nodes, list):
                values = [str(n) for n in nodes]
            elif hasattr(nodes, "get"):
                got = nodes.get()
                values = [str(got)] if got is not None else []
            else:
                values = [str(nodes)]
            out[name] = values if many else (values[0] if values else None)
        except Exception:
            out[name] = None
    return out


def main():
    raw = sys.stdin.read()
    try:
        req = json.loads(raw or "{}")
        if not req.get("url"):
            raise ValueError("missing 'url'")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"bad request: {exc}"}))
        return

    result = {"ok": False, "url": req.get("url"), "status": None, "text": None, "extracts": None}
    try:
        page = fetch_page(req)
        result["status"] = getattr(page, "status", None) or getattr(page, "status_code", None)
        text = getattr(page, "html_content", None) or getattr(page, "text", None)
        result["text"] = str(text)[:200000] if text is not None else None
        if req.get("extract"):
            result["extracts"] = run_extracts(page, req["extract"])
        result["ok"] = bool(result["text"])
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc(limit=3)
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
