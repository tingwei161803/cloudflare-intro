#!/usr/bin/env python3
"""Generate the .html entry points (zh at the root, en under /en/) from data/data.js.

Run:  uv run python scripts/gen_pages.py

Each page gets the full <head> (GA4, SEO, hreflang, og:image, fonts, JSON-LD,
an inline theme bootstrap) and a <body data-page> shell that shell.js + app.js
fill in the browser.

The <main id="page"> of an existing file is kept as-is: it holds the static
copy of the rendered page that crawlers and no-JS readers see. This script only
owns everything around it. After changing a renderer in assets/app.js, refresh
those static copies by loading each page in a headless browser and writing the
rendered <main> back (a prerender pass), then commit both.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SITE_URL = "https://cloudflare-intro.peteraim.com/"
OG_IMAGE = SITE_URL + "og-image.png"
GA4_ID = "G-CTETKN2KDW"
THEME_COLOR = "#F6821F"
LANGS = ("zh", "en")
TWIN_DIR = "en"   # English pages live under /en/

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


def pick(obj, lang, fallback=""):
    if isinstance(obj, dict):
        other = "en" if lang == "zh" else "zh"
        return obj.get(lang) or obj.get(other) or fallback
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

# Theme before first paint: a saved choice wins, otherwise follow the OS.
# shell.js repeats the same rule; this copy only prevents a light flash.
THEME_BOOT = (
    "  <script>try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light')"
    "t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';"
    "document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>\n"
)

# Archivo (grotesk with a width axis) for Latin, Noto Sans TC for Chinese,
# JetBrains Mono for code only. Material Symbols stays: the content data
# names its icons.
FONTS = (
    '  <link rel="preconnect" href="https://fonts.googleapis.com" />\n'
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
    '  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900'
    "&family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500&display=swap\" rel=\"stylesheet\" />\n"
    '  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
    '&display=swap" rel="stylesheet" />\n'
)

LOCALE = {"zh": "zh_TW", "en": "en_US"}
HTML_LANG = {"zh": "zh-Hant", "en": "en"}


def page_file(slug):
    return "index.html" if slug == "home" else f"{slug}.html"


def page_url(slug, lang):
    """Public URL. Home is the bare directory, never index.html."""
    base = SITE_URL if lang == "zh" else SITE_URL + TWIN_DIR + "/"
    return base if slug == "home" else base + page_file(slug)


def page_path(slug, lang):
    """Root-relative path used by the no-JS language link."""
    prefix = "/" if lang == "zh" else f"/{TWIN_DIR}/"
    return prefix if slug == "home" else prefix + page_file(slug)


def jsonld(page, lang, site_title, url):
    home = SITE_URL if lang == "zh" else SITE_URL + TWIN_DIR + "/"
    if page.get("layout") == "lesson":
        node = {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": pick(page.get("title"), lang),
            "description": pick(page.get("subtitle"), lang),
            "inLanguage": HTML_LANG[lang],
            "url": url,
            "isPartOf": {"@type": "WebSite", "name": site_title, "url": home},
        }
    else:
        title = pick(page.get("title"), lang)
        node = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": title if page["slug"] == "home" else f"{title} · {site_title}",
            "description": pick(page.get("subtitle"), lang),
            "inLanguage": HTML_LANG[lang],
            "url": url,
        }
    return json.dumps(node, ensure_ascii=False)


MAIN_RE = re.compile(r'<main id="page">\n?(.*)\n?</main>', re.S)


def existing_main(path):
    """The prerendered body of an existing file, or "" for a new page."""
    if not path.exists():
        return ""
    m = MAIN_RE.search(path.read_text(encoding="utf-8"))
    return m.group(1).rstrip("\n") if m else ""


def build_html(page, meta, lang, main_inner):
    e = html.escape
    slug = page["slug"]
    other = "en" if lang == "zh" else "zh"
    url = page_url(slug, lang)
    site_title = pick(meta["title"], lang)
    page_title = pick(page.get("title"), lang)
    full_title = page_title if slug == "home" else f"{page_title} · {site_title}"
    desc = pick(page.get("subtitle"), lang) or pick(meta.get("subtitle"), lang)
    up = "" if lang == "zh" else "../"
    alt_label = "English version" if lang == "zh" else "中文版"

    return (
        "<!DOCTYPE html>\n"
        f'<html lang="{HTML_LANG[lang]}" data-theme="light">\n'
        "<head>\n"
        '  <meta charset="UTF-8" />\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n'
        + GA4
        + THEME_BOOT
        + f"  <title>{e(full_title)}</title>\n"
        f'  <meta name="description" content="{e(desc)}" />\n'
        f'  <meta name="theme-color" content="{THEME_COLOR}" />\n'
        f'  <link rel="canonical" href="{e(url)}" />\n'
        f'  <link rel="alternate" hreflang="zh-Hant" href="{e(page_url(slug, "zh"))}" />\n'
        f'  <link rel="alternate" hreflang="en" href="{e(page_url(slug, "en"))}" />\n'
        f'  <link rel="alternate" hreflang="x-default" href="{e(page_url(slug, "zh"))}" />\n'
        '  <meta property="og:type" content="website" />\n'
        f'  <meta property="og:title" content="{e(full_title)}" />\n'
        f'  <meta property="og:description" content="{e(desc)}" />\n'
        f'  <meta property="og:url" content="{e(url)}" />\n'
        f'  <meta property="og:site_name" content="{e(site_title)}" />\n'
        f'  <meta property="og:locale" content="{LOCALE[lang]}" />\n'
        '  <meta name="twitter:card" content="summary_large_image" />\n'
        f'  <meta name="twitter:title" content="{e(full_title)}" />\n'
        f'  <meta name="twitter:description" content="{e(desc)}" />\n'
        + FONTS
        + f'  <link rel="stylesheet" href="{up}assets/styles.css" />\n'
        f'  <script type="application/ld+json">{jsonld(page, lang, site_title, url)}</script>\n'
        f'  <meta property="og:image" content="{OG_IMAGE}">\n'
        '  <meta property="og:image:width" content="1200">\n'
        '  <meta property="og:image:height" content="630">\n'
        f'  <meta name="twitter:image" content="{OG_IMAGE}">\n'
        "</head>\n"
        f'<body data-page="{e(slug)}">\n'
        '  <main id="page">\n'
        + (main_inner + "\n" if main_inner else "")
        + "</main>\n"
        f'  <script src="{up}data/data.js"></script>\n'
        f'  <script src="{up}assets/shell.js"></script>\n'
        f'  <script src="{up}assets/app.js"></script>\n'
        # No-JS language link. shell.js moves it into the footer once the chrome exists.
        f'<p class="lang-alt-link"><a href="{page_path(slug, other)}" hreflang="{HTML_LANG[other]}" '
        f'rel="alternate" lang="{HTML_LANG[other]}">{alt_label}</a></p>\n'
        "</body>\n"
        "</html>\n"
    )


def main():
    js = (DATA / "data.js").read_text(encoding="utf-8")
    meta = load_global(js, "SITE_META")
    pages = load_global(js, "SITE_PAGES")

    count = 0
    for lang in LANGS:
        outdir = ROOT if lang == "zh" else ROOT / TWIN_DIR
        outdir.mkdir(exist_ok=True)
        for page in pages:
            path = outdir / page_file(page["slug"])
            path.write_text(build_html(page, meta, lang, existing_main(path)), encoding="utf-8")
            count += 1

    print(f"Generated {count} HTML files ({len(pages)} pages × {len(LANGS)} languages).")


if __name__ == "__main__":
    main()
