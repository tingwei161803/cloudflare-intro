/* =========================================================================
   multipage · shell.js   (vanilla, no build)

   The SHARED CHROME for every page: app bar, cross-page nav, footer and the
   detail <dialog>. It also owns global state (language + theme) and exposes a
   tiny toolkit on window.LDW that each page's app.js reuses.

   Loaded on EVERY page BEFORE app.js. It:
     1. reads the language from <html lang> and the theme from localStorage,
     2. injects app bar + nav + footer + dialog around <main id="page">,
     3. wires the theme toggle and points the language link at this page's
        counterpart in the other language,
     4. highlights the current page (from <body data-page="...">).

   Language belongs to the URL, not to the visitor: the Chinese pages live at
   the root and the English ones under /en/, so switching language is a
   navigation rather than an in-place repaint. Theme still persists in
   localStorage (an origin-wide store) and survives moving between pages.
   ========================================================================= */
(function () {
  "use strict";

  var META = window.SITE_META || { title: {}, subtitle: {}, footer: {} };
  var PAGES = Array.isArray(window.SITE_PAGES) ? window.SITE_PAGES : [];
  var REPO = "tingwei161803/cloudflare-intro";          // owner/name for the star button
  var REPO_URL = "https://github.com/" + REPO;

  /* ---------- chrome i18n (page content strings live in the data) ---------- */
  var I18N = {
    en: { close: "Close", menu: "Pages", skip: "Skip to content", home: "Home",
          note: "An unofficial study guide, put together from Cloudflare's developer docs. Product limits and pricing change, so check the official docs.",
          source: "Source on GitHub" },
    zh: { close: "關閉", menu: "頁面", skip: "跳到內容", home: "首頁",
          note: "非官方的學習整理，內容取自 Cloudflare 官方開發者文件。產品規格與價格可能調整，請以官方為準。",
          source: "GitHub 原始碼" }
  };

  /* ---------- sandbox-safe localStorage ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- global state ----------
     The URL decides the language, so <html lang> is what we read. localStorage
     must not seed it: a crawler has no localStorage and would always be handed
     the fallback, which is how the English half of the site ended up with no
     address of its own. Writing the choice back is gone too; the address
     carries it now. `lang` stays "zh"/"en" because it is the key into the
     content dictionaries — the document keeps the precise "zh-Hant". */
  function langFromDocument() {
    var declared = (document.documentElement.getAttribute("lang") || "zh").toLowerCase();
    return declared.indexOf("zh") === 0 ? "zh" : "en";
  }

  /* the same page in the other language — mirror the path, never guess */
  var TWIN_DIR = "/en";
  function altLangHref() {
    var path = location.pathname || "/";
    if (path === TWIN_DIR || path.indexOf(TWIN_DIR + "/") === 0) {
      return path.slice(TWIN_DIR.length) || "/";
    }
    return TWIN_DIR + path;
  }

  /* theme: a saved choice wins; otherwise follow the OS (and keep following it) */
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function savedTheme() { var v = lsGet("theme"); return v === "dark" || v === "light" ? v : null; }
  var state = {
    lang:  langFromDocument(),
    theme: savedTheme() || (darkQuery && darkQuery.matches ? "dark" : "light")
  };

  /* family pages wear their line colour + letter in the nav (matches app.js) */
  var LINE_CODES = { compute: "C", ai: "A", storage: "D", media: "M", security: "S",
                     performance: "P", integrations: "I", arcade: "G" };

  /* ---------- helpers shared with app.js ---------- */
  function t(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    return obj[state.lang] || obj.en || obj.zh || "";
  }
  function ui(key) { return (I18N[state.lang] || I18N.en)[key]; }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function r(n) { return Math.round(n * 100) / 100; }

  function pageHref(p) { return p.slug === "home" ? "index.html" : p.slug + ".html"; }
  function currentSlug() { return document.body.getAttribute("data-page") || "home"; }
  function currentPage() {
    var slug = currentSlug();
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].slug === slug) return PAGES[i];
    return PAGES[0] || null;
  }

  /* ---------- onTheme callback registry (app.js plugs in here) ---------- */
  var themeSubscribers = [];
  function onTheme(fn) { if (typeof fn === "function") themeSubscribers.push(fn); }

  /* =======================================================================
     CHROME INJECTION — app bar, nav, footer, dialog around <main id="page">
     ===================================================================== */
  function injectChrome() {
    var main = document.getElementById("page");
    if (!main) return;

    /* skip link */
    var skip = document.createElement("a");
    skip.className = "skip-link";
    skip.href = "#page";
    skip.id = "skipLink";
    document.body.insertBefore(skip, document.body.firstChild);

    /* app bar */
    var appbar = document.createElement("header");
    appbar.className = "appbar";
    appbar.innerHTML =
      '<div class="appbar__inner">' +
        '<a class="brand" href="index.html">' +
          '<span class="brand__logo" aria-hidden="true"><span class="material-symbols-rounded">cloud</span></span>' +
          '<span class="brand__name" id="brandName"></span>' +
        '</a>' +
        '<div class="appbar__actions">' +
          '<a class="gh-star" id="ghStar" href="' + REPO_URL + '" target="_blank" rel="noopener" ' +
              'title="Star on GitHub" aria-label="Star this project on GitHub / 到 GitHub 給專案加星">' +
            '<svg class="gh-star__mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
              '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path></svg>' +
            '<span class="gh-star__count" id="ghStarCount"><span class="material-symbols-rounded" aria-hidden="true">star</span><b></b></span>' +
          '</a>' +
          '<a class="icon-btn" id="langToggle" href="' + escapeHtml(altLangHref()) + '" ' +
             'hreflang="' + (state.lang === "en" ? "zh-Hant" : "en") + '" rel="alternate" ' +
             'title="Language" aria-label="' +
             (state.lang === "en" ? "切換到中文版 / View in Chinese" : "View in English / 切換到英文版") + '">' +
            '<span class="material-symbols-rounded">translate</span>' +
            '<span class="icon-btn__txt" id="langLabel"></span>' +
          '</a>' +
          '<button class="icon-btn" id="themeToggle" type="button" title="Theme" aria-label="Toggle theme / 切換主題">' +
            '<span class="material-symbols-rounded" id="themeIcon">dark_mode</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(appbar, main);

    /* cross-page nav */
    var nav = document.createElement("nav");
    nav.className = "pagenav";
    nav.id = "pageNav";
    nav.innerHTML = '<div class="pagenav__inner" id="pageNavInner"></div>';
    document.body.insertBefore(nav, main);

    /* footer */
    var footer = document.createElement("footer");
    footer.className = "footer";
    footer.innerHTML =
      '<div class="footer__inner">' +
        '<div class="footer__about"><p class="footer__title" id="footerText"></p><p class="footer__note" id="footerNote"></p></div>' +
        '<div class="footer__links" id="footerLinks">' +
          '<a href="' + REPO_URL + '" target="_blank" rel="noopener" id="footerSource"></a>' +
        '</div>' +
      '</div>';
    main.parentNode.insertBefore(footer, main.nextSibling);
    var alt = document.querySelector(".lang-alt-link");
    if (alt) {
      var altA = alt.querySelector("a");
      if (altA) footer.querySelector("#footerLinks").insertBefore(altA, footer.querySelector("#footerSource"));
      alt.parentNode.removeChild(alt);
    }

    /* shared detail dialog (used by card layouts) */
    var dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.id = "dialog";
    dialog.setAttribute("aria-labelledby", "dialogTitle");
    dialog.innerHTML =
      '<div class="dialog__bar">' +
        '<span class="dialog__spacer"></span>' +
        '<button class="icon-btn" id="dialogClose" type="button" aria-label="Close / 關閉">' +
          '<span class="material-symbols-rounded">close</span>' +
        '</button>' +
      '</div>' +
      '<div class="dialog__body" id="dialogBody"></div>';
    document.body.appendChild(dialog);

    /* dialog wiring (shared close behaviour; deep links handled by app.js) */
    document.getElementById("dialogClose").addEventListener("click", function () {
      if (dialog.open) dialog.close();
    });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  /* nav labels stay short: "運算 Compute" → "運算"; the home page is just "Home" */
  function navLabel(p) {
    if (p.slug === "home") return ui("home");
    var s = t(p.title);
    return state.lang === "zh" ? (s.replace(/\s+[A-Za-z&][A-Za-z &]*$/, "") || s) : s;
  }

  function paintNav() {
    var inner = document.getElementById("pageNavInner");
    if (!inner) return;
    inner.innerHTML = "";
    var here = currentSlug();
    var current = currentPage();
    /* only top-level pages appear in the cross-page nav; product lessons set nav:false */
    PAGES.filter(function (p) { return p.nav !== false; }).forEach(function (p) {
      var a = document.createElement("a");
      var code = p.layout === "category" ? LINE_CODES[p.key] : null;
      /* the page's own line is "here" too when you are on one of its stops */
      var onLine = code && current && current.category === p.key;
      a.className = "navpill" + (p.slug === here ? " navpill--active" : "") + (onLine ? " navpill--online" : "");
      a.href = pageHref(p);
      if (code) a.setAttribute("data-line", p.key);
      if (p.slug === here) a.setAttribute("aria-current", "page");
      a.innerHTML =
        (code ? '<span class="bullet bullet--sm" aria-hidden="true">' + code + "</span>"
              : '<span class="material-symbols-rounded" aria-hidden="true">' + escapeHtml(p.icon || "label") + "</span>") +
        "<span>" + escapeHtml(navLabel(p)) + "</span>";
      inner.appendChild(a);
    });
    /* keep the active pill in view within the scrolling nav (without moving the page) */
    var active = inner.querySelector(".navpill--active") || inner.querySelector(".navpill--online");
    if (active && inner.scrollWidth > inner.clientWidth) {
      inner.scrollLeft = active.offsetLeft - inner.clientWidth / 2 + active.offsetWidth / 2;
    }
    updateNavFade();
  }

  /* edge fades only where there is more nav to scroll to */
  function updateNavFade() {
    var inner = document.getElementById("pageNavInner");
    var nav = document.getElementById("pageNav");
    if (!inner || !nav) return;
    var max = inner.scrollWidth - inner.clientWidth;
    nav.classList.toggle("fade-l", inner.scrollLeft > 4);
    nav.classList.toggle("fade-r", max > 4 && inner.scrollLeft < max - 4);
  }

  /* ---------- chrome text in the active language ---------- */
  function refreshChrome() {
    var page = currentPage();
    var siteTitle = t(META.title);
    var pageTitle = page ? t(page.title) : "";
    document.title = pageTitle ? pageTitle + " · " + siteTitle : siteTitle;

    var brand = document.getElementById("brandName");
    if (brand) brand.textContent = siteTitle;
    var foot = document.getElementById("footerText");
    if (foot) foot.textContent = "© " + new Date().getFullYear() + " " + siteTitle;
    var note = document.getElementById("footerNote");
    if (note) note.textContent = ui("note");
    var src = document.getElementById("footerSource");
    if (src) src.textContent = ui("source");
    var skip = document.getElementById("skipLink");
    if (skip) skip.textContent = ui("skip");
    var nav = document.getElementById("pageNav");
    if (nav) nav.setAttribute("aria-label", ui("menu"));
    var dc = document.getElementById("dialogClose");
    if (dc) dc.setAttribute("aria-label", ui("close"));
    paintNav();
  }

  /* =======================================================================
     THEME + LANGUAGE
     ===================================================================== */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    var icon = document.getElementById("themeIcon");
    if (icon) icon.textContent = state.theme === "dark" ? "light_mode" : "dark_mode";
  }
  /* The toggle is a link now, so it is labelled with the language it leads TO,
     not the one already on screen. */
  function applyLangChrome() {
    var label = document.getElementById("langLabel");
    if (label) label.textContent = state.lang === "en" ? "中" : "EN";
  }

  function wire() {
    document.getElementById("themeToggle").addEventListener("click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      lsSet("theme", state.theme);          /* only an explicit choice is remembered */
      applyTheme();
      themeSubscribers.forEach(function (fn) { try { fn(state.theme); } catch (e) {} });
    });
    if (darkQuery) {
      var follow = function (e) {
        if (savedTheme()) return;
        state.theme = e.matches ? "dark" : "light";
        applyTheme();
        themeSubscribers.forEach(function (fn) { try { fn(state.theme); } catch (er) {} });
      };
      if (darkQuery.addEventListener) darkQuery.addEventListener("change", follow);
      else if (darkQuery.addListener) darkQuery.addListener(follow);
    }
    var navInner = document.getElementById("pageNavInner");
    if (navInner) navInner.addEventListener("scroll", updateNavFade, { passive: true });
    window.addEventListener("resize", updateNavFade);
  }

  /* ---------- live GitHub star count ----------
     Cached in localStorage with a time limit, so moving between 150 pages (or
     opening a few in new tabs) costs one API call. Anonymous calls are
     rate-limited (403): a failure is cached too, for a shorter time, and the
     badge then shows just the GitHub mark — never a dash or a zero. */
  var STAR_KEY = "gh-stars:" + REPO;
  function showStars(n) {
    var star = document.getElementById("ghStar");
    var box = document.getElementById("ghStarCount");
    if (!star || !box) return;
    var num = box.querySelector("b");
    if (typeof n === "number" && n > 0 && num) {
      num.textContent = n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
      star.classList.add("gh-star--count");
    } else {
      star.classList.remove("gh-star--count");
    }
  }
  var STAR_TTL_OK = 6 * 3600 * 1000, STAR_TTL_FAIL = 3600 * 1000;
  function fetchStars() {
    var cached = null;
    try { cached = JSON.parse(lsGet(STAR_KEY) || "null"); } catch (e) { cached = null; }
    if (cached && typeof cached.n === "number" && typeof cached.at === "number" &&
        Date.now() - cached.at < (cached.n > 0 ? STAR_TTL_OK : STAR_TTL_FAIL)) {
      showStars(cached.n);
      return;
    }
    showStars(null);
    if (!window.fetch) return;
    function remember(n) { lsSet(STAR_KEY, JSON.stringify({ n: n, at: Date.now() })); showStars(n); }
    fetch("https://api.github.com/repos/" + REPO, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) { remember(j && typeof j.stargazers_count === "number" ? j.stargazers_count : 0); })
      .catch(function () { remember(0); });
  }

  /* =======================================================================
     PUBLIC TOOLKIT (app.js uses this)
     ===================================================================== */
  window.LDW = {
    ready: false,          // flipped true once the chrome (incl. #dialog) is injected
    state: state,
    t: t, ui: ui, escapeHtml: escapeHtml, r: r,
    lsGet: lsGet, lsSet: lsSet,
    pages: PAGES, meta: META,
    currentPage: currentPage, currentSlug: currentSlug, pageHref: pageHref,
    onTheme: onTheme,
    refreshChrome: refreshChrome,
    dialog: function () { return document.getElementById("dialog"); }
  };

  /* =======================================================================
     INIT
     ===================================================================== */
  function init() {
    injectChrome();
    applyTheme();
    applyLangChrome();
    refreshChrome();
    wire();
    fetchStars();
    window.LDW.ready = true;
    document.dispatchEvent(new CustomEvent("ldw:shell-ready"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
