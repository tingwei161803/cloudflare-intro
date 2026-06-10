#!/usr/bin/env python3
"""Assemble data/data.js from hand-authored site.json + parallel-written product / extra JSON.

Run:  uv run python scripts/assemble.py
Output: data/data.js  (window.SITE_META + window.SITE_CATEGORIES + window.SITE_PAGES)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PRODUCTS = DATA / "products"
EXTRA = DATA / "extra"
GUIDES = DATA / "guides"

CATEGORY_ORDER = ["compute", "ai", "storage", "media", "security", "performance"]
PRODUCT_ORDER = {
    "compute": ["workers", "containers", "durable-objects", "queues"],
    "ai": ["workers-ai", "ai-gateway", "agents", "vectorize", "browser-rendering"],
    "storage": ["r2", "d1", "kv", "hyperdrive", "pipelines"],
    "media": ["images", "stream", "realtime"],
    "security": ["waf", "ssl-tls", "turnstile", "tunnel", "access", "gateway"],
    "performance": ["dns", "cdn", "speed", "smart-shield", "web-analytics"],
}
ALL_SLUGS = {s for slugs in PRODUCT_ORDER.values() for s in slugs}

# Integration guides (category "integrations"), in display order grouped by sub-theme.
GUIDE_ORDER = [
    "fullstack-overview", "frontend-worker-d1-crud", "rest-api-worker", "form-to-database",
    "auth-fullstack", "file-upload-r2", "pages-functions-fullstack",
    "choose-your-database", "d1-schema-design", "d1-relationships", "kv-cache-layer",
    "durable-objects-state", "hyperdrive-postgres",
    "blueprint-blog-cms", "blueprint-ecommerce", "blueprint-saas", "blueprint-ai-rag",
    "blueprint-realtime-chat", "blueprint-image-pipeline", "blueprint-url-shortener",
    "request-lifecycle", "auth-flow-diagram", "cache-flow", "event-driven-queues",
]
GUIDE_SLUGS = set(GUIDE_ORDER)
ALL_SLUGS_REL = ALL_SLUGS | GUIDE_SLUGS                      # related may link to products OR guides
VALID_CATEGORIES = set(CATEGORY_ORDER) | {"integrations", "start"}

warnings = []


def warn(msg):
    warnings.append(msg)


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"FATAL: cannot parse {path}: {e}", file=sys.stderr)
        sys.exit(1)


def declutter(obj, parent_key=None):
    """Defensively undo accidental HTML-encoding of '&' in prose (never in code bodies)."""
    if isinstance(obj, dict):
        return {k: declutter(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [declutter(v, parent_key) for v in obj]
    if isinstance(obj, str) and parent_key != "body":
        return obj.replace("&amp;", "&")
    return obj


def check_bilingual(d, where):
    if not isinstance(d, dict) or "en" not in d or "zh" not in d:
        warn(f"{where}: expected a bilingual {{en,zh}} object, got {d!r}")


def validate_product(p, slug):
    if p.get("slug") != slug:
        warn(f"{slug}: slug field is {p.get('slug')!r} (file name mismatch)")
    if p.get("category") not in VALID_CATEGORIES:
        warn(f"{slug}: category {p.get('category')!r} not in {sorted(VALID_CATEGORIES)}")
    for f in ("title", "subtitle"):
        check_bilingual(p.get(f), f"{slug}.{f}")
    if not p.get("sections"):
        warn(f"{slug}: no sections")
    for r in p.get("related", []):
        if r.get("slug") not in ALL_SLUGS_REL:
            warn(f"{slug}: related slug {r.get('slug')!r} is not a known product/guide slug")
    if not p.get("icon"):
        warn(f"{slug}: missing icon")


def main():
    site = declutter(load(EXTRA / "site.json"))
    meta = site["meta"]
    categories = site["categories"]
    home = site["home"]
    category_pages = site["categoryPages"]
    tool_meta = site["toolPages"]

    # ----- products -----
    products_by_cat = {c: [] for c in CATEGORY_ORDER}
    seen = set()
    for cat in CATEGORY_ORDER:
        for slug in PRODUCT_ORDER[cat]:
            f = PRODUCTS / f"{slug}.json"
            if not f.exists():
                warn(f"MISSING product file: {f.name}")
                continue
            p = declutter(load(f))
            validate_product(p, slug)
            p["layout"] = "lesson"
            p["nav"] = False
            products_by_cat[cat].append(p)
            seen.add(slug)
    for extra_slug in sorted(ALL_SLUGS - seen):
        warn(f"product {extra_slug} declared but not assembled")

    # ----- start (a nav-level lesson) -----
    start = declutter(load(EXTRA / "start.json"))
    start["layout"] = "lesson"
    start["nav"] = True
    start.setdefault("icon", "rocket_launch")

    # ----- tool pages wrap their data arrays -----
    def tool_page(slug, layout, data_key, payload_key):
        m = tool_meta[slug]
        data = declutter(load(EXTRA / f"{slug}.json"))
        page = {
            "slug": slug, "layout": layout, "nav": True,
            "icon": m["icon"], "title": m["title"], "subtitle": m["subtitle"],
            "hero": m["hero"], payload_key: data[data_key],
        }
        return page

    glossary = tool_page("glossary", "glossary", "terms", "terms")
    quiz = tool_page("quiz", "quiz", "questions", "questions")
    flashcards = tool_page("flashcards", "flashcards", "cards", "cards")

    # ----- integration guides (category "integrations", nav:false; reached via its category page) -----
    guides = []
    seen_g = set()
    for slug in GUIDE_ORDER:
        f = GUIDES / f"{slug}.json"
        if not f.exists():
            warn(f"MISSING guide file: {f.name}")
            continue
        g = declutter(load(f))
        validate_product(g, slug)
        g["layout"] = "lesson"
        g["nav"] = False
        guides.append(g)
        seen_g.add(slug)
    for missing in sorted(GUIDE_SLUGS - seen_g):
        warn(f"guide {missing} declared but not assembled")

    # ----- assemble SITE_PAGES (nav order first, then product lessons) -----
    pages = [home, start]
    for cp in category_pages:
        cp["layout"] = "category"
        cp["nav"] = True
        pages.append(cp)
    pages += [glossary, quiz, flashcards]
    for cat in CATEGORY_ORDER:
        pages += products_by_cat[cat]
    pages += guides

    # slug uniqueness
    slugs = [p["slug"] for p in pages]
    dupes = {s for s in slugs if slugs.count(s) > 1}
    if dupes:
        warn(f"DUPLICATE slugs: {dupes}")

    site_categories = [
        {"key": c["key"], "icon": c["icon"], "title": c["title"], "blurb": c["blurb"]}
        for c in categories
    ]

    out = []
    out.append("/* Assembled data file — edit data/extra/site.json or data/products/*.json")
    out.append("   and re-run scripts/assemble.py; do not edit this file by hand. */")
    out.append("window.SITE_META = " + json.dumps(meta, ensure_ascii=False, indent=2) + ";")
    out.append("window.SITE_CATEGORIES = " + json.dumps(site_categories, ensure_ascii=False, indent=2) + ";")
    out.append("window.SITE_PAGES = " + json.dumps(pages, ensure_ascii=False, indent=2) + ";")
    (DATA / "data.js").write_text("\n".join(out) + "\n", encoding="utf-8")

    nav_pages = [p["slug"] for p in pages if p.get("nav") is not False]
    print(f"Wrote data/data.js: {len(pages)} pages total, {len(nav_pages)} in nav.")
    print(f"  nav order: {nav_pages}")
    print(f"  products: {sum(len(v) for v in products_by_cat.values())}/28")
    print(f"  guides: {len(guides)}/24")
    print(f"  glossary terms: {len(glossary['terms'])}, quiz Q: {len(quiz['questions'])}, flashcards: {len(flashcards['cards'])}")
    if warnings:
        print(f"\n{len(warnings)} WARNING(S):")
        for w in warnings:
            print("  - " + w)
    else:
        print("No warnings. ✓")


if __name__ == "__main__":
    main()
