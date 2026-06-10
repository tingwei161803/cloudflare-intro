#!/usr/bin/env python3
"""Generate one .html entry point per page in data/data.js.

Run:  uv run python scripts/gen_pages.py
Each page's <body data-page> + empty <main id="page"> is filled by shell.js + app.js.
GA4 (gtag.js) is injected at the top of every <head>.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SITE_URL = "https://tingwei161803.github.io/cloudflare-intro/"
GA4_ID = "G-CTETKN2KDW"
THEME_COLOR = "#F6821F"

# Safety: GA4 id is injected verbatim into <head>; never inject an unvalidated string.
if not re.fullmatch(r"G-[A-Z0-9]+", GA4_ID):
    print(f"FATAL: GA4 id {GA4_ID!r} fails ^G-[A-Z0-9]+$ — refusing to inject.", file=sys.stderr)
    sys.exit(1)


def load_global(js_text, name):
    """Extract `window.<name> = <json>;` from data.js robustly."""
    marker = f"window.{name} = "
    i = js_text.index(marker) + len(marker)
    obj, _ = json.JSONDecoder().raw_decode(js_text, i)
    return obj


def zh(obj, fallback=""):
    if isinstance(obj, dict):
        return obj.get("zh") or obj.get("en") or fallback
    return obj or fallback


def en(obj, fallback=""):
    if isinstance(obj, dict):
        return obj.get("en") or obj.get("zh") or fallback
    return obj or fallback


GA4 = (
    "  <!-- Google tag (gtag.js) -->\n"
    f'  <script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script>\n'
    "  <script>\n"
    "    window.dataLayer = window.dataLayer || [];\n"
    "    function gtag(){dataLayer.push(arguments);}\n"
    "    gtag('js', new Date());\n"
    f"    gtag('config', '{GA4_ID}');\n"
    "  </script>\n"
)

FONTS = (
    '  <link rel="preconnect" href="https://fonts.googleapis.com" />\n'
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
    '  <link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,400..700'
    "&family=Noto+Sans+TC:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap\" rel=\"stylesheet\" />\n"
    '  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
    '&display=swap" rel="stylesheet" />\n'
)


def jsonld(page, site_title, url):
    layout = page.get("layout")
    if layout in ("lesson",):
        node = {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": zh(page.get("title")),
            "description": zh(page.get("subtitle")),
            "inLanguage": "zh-Hant",
            "url": url,
            "isPartOf": {"@type": "WebSite", "name": site_title, "url": SITE_URL},
        }
    else:
        node = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": zh(page.get("title")) + " · " + site_title,
            "description": zh(page.get("subtitle")),
            "inLanguage": "zh-Hant",
            "url": url,
        }
    return json.dumps(node, ensure_ascii=False)


def build_html(page, meta):
    slug = page["slug"]
    fname = "index.html" if slug == "home" else f"{slug}.html"
    url = SITE_URL if slug == "home" else SITE_URL + fname
    site_title = zh(meta["title"])
    page_title_zh = zh(page.get("title"))
    full_title = page_title_zh if slug == "home" else f"{page_title_zh} · {site_title}"
    desc = zh(page.get("subtitle")) or zh(meta.get("subtitle"))
    e = html.escape

    head = (
        "<!DOCTYPE html>\n"
        '<html lang="zh" data-theme="light">\n'
        "<head>\n"
        '  <meta charset="UTF-8" />\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n'
        + GA4
        + f"  <title>{e(full_title)}</title>\n"
        f'  <meta name="description" content="{e(desc)}" />\n'
        f'  <meta name="theme-color" content="{THEME_COLOR}" />\n'
        f'  <link rel="canonical" href="{e(url)}" />\n'
        '  <meta property="og:type" content="website" />\n'
        f'  <meta property="og:title" content="{e(full_title)}" />\n'
        f'  <meta property="og:description" content="{e(desc)}" />\n'
        f'  <meta property="og:url" content="{e(url)}" />\n'
        f'  <meta property="og:site_name" content="{e(site_title)}" />\n'
        '  <meta property="og:locale" content="zh_TW" />\n'
        '  <meta name="twitter:card" content="summary" />\n'
        f'  <meta name="twitter:title" content="{e(full_title)}" />\n'
        f'  <meta name="twitter:description" content="{e(desc)}" />\n'
        + FONTS
        + '  <link rel="stylesheet" href="assets/styles.css" />\n'
        f'  <script type="application/ld+json">{jsonld(page, site_title, url)}</script>\n'
        "</head>\n"
        f'<body data-page="{e(slug)}">\n'
        "  <main id=\"page\"></main>\n"
        '  <script src="data/data.js"></script>\n'
        '  <script src="assets/shell.js"></script>\n'
        '  <script src="assets/app.js"></script>\n'
        "</body>\n"
        "</html>\n"
    )
    return fname, head


def main():
    js = (DATA / "data.js").read_text(encoding="utf-8")
    meta = load_global(js, "SITE_META")
    pages = load_global(js, "SITE_PAGES")

    written = []
    for page in pages:
        fname, content = build_html(page, meta)
        (ROOT / fname).write_text(content, encoding="utf-8")
        written.append(fname)

    print(f"Generated {len(written)} HTML files (GA4 {GA4_ID} injected in every <head>).")
    print("  " + ", ".join(written[:12]) + (" …" if len(written) > 12 else ""))


if __name__ == "__main__":
    main()
