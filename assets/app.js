/* =========================================================================
   multipage · app.js   (vanilla, no build, no chart lib)

   The PAGE-LEVEL LAYOUT ENGINE. shell.js has already injected the shared
   chrome and published window.LDW. This script:

     1. reads the current page from <body data-page="..."> (via LDW),
     2. picks a renderer from RENDERERS by that page's `layout`,
     3. paints it into <main id="page"> and wires its interactions.

   The language comes from the URL, so it cannot change while a page is open —
   there is nothing to repaint on a language switch, only a link to follow.

   RENDERERS is the LAYOUT REGISTRY — one entry per supported page layout:
     hub | gallery | article | dashboard | timeline | table |
     bento | kanban | faq | comparison | leaderboard | scrolly | map
   To add a layout, add one renderer (returns the inner HTML for #page) and,
   if it needs interaction, one matching WIRE entry. Nothing else changes.
   ========================================================================= */
(function () {
  "use strict";

  function boot() {
    // Wait until shell.js has injected the chrome (app bar, nav, footer, #dialog)
    // and published LDW. End-of-body scripts run while readyState === "loading",
    // so the shell defers its injection to DOMContentLoaded — we must wait for it.
    if (!window.LDW || !window.LDW.ready) {
      document.addEventListener("ldw:shell-ready", boot, { once: true });
      return;
    }
    var L = window.LDW;

    var t = L.t, esc = L.escapeHtml, r = L.r;
    var pageEl = document.getElementById("page");
    var teardowns = [];   // observers / listeners to disconnect before each repaint

    /* ---------- shared bits ---------- */
    function head(p) {
      var sub = t(p.subtitle)
        ? '<p class="page-head__sub">' + esc(t(p.subtitle)) + "</p>" : "";
      return '<header class="page-head"><h1>' + esc(t(p.title)) + "</h1>" + sub + "</header>";
    }

    function barChart(series, accent) {
      var W = 520, H = 240, padL = 16, padR = 16, padT = 16, padB = 44;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var max = Math.max.apply(null, series.map(function (d) { return d.value; }).concat([1]));
      var n = series.length || 1, gap = 14, bw = (plotW - gap * (n - 1)) / n, baseY = padT + plotH;
      var bars = series.map(function (d, i) {
        var x = padL + i * (bw + gap), h = (d.value / max) * plotH, y = baseY - h;
        var label = esc(t(d.label)), val = esc(String(d.value));
        return '<rect class="bar-rect" x="' + r(x) + '" y="' + r(y) + '" width="' + r(bw) +
          '" height="' + r(h) + '" rx="5"' + (accent ? ' style="fill:' + esc(accent) + '"' : "") +
          '><title>' + label + ": " + val + "</title></rect>" +
          '<text class="bar-value" x="' + r(x + bw / 2) + '" y="' + r(y - 6) + '" text-anchor="middle">' + val + "</text>" +
          '<text class="bar-label" x="' + r(x + bw / 2) + '" y="' + r(baseY + 18) + '" text-anchor="middle">' + label + "</text>";
      }).join("");
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" preserveAspectRatio="xMidYMid meet" aria-label="bar chart">' +
        '<line class="axis-line" x1="' + padL + '" y1="' + r(baseY) + '" x2="' + r(W - padR) + '" y2="' + r(baseY) + '" />' +
        bars + "</svg>";
    }

    function lineChart(points) {
      var W = 520, H = 240, padL = 28, padR = 16, padT = 16, padB = 32;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var ys = points.map(function (d) { return d.y; });
      var max = Math.max.apply(null, ys.concat([1])), min = Math.min.apply(null, ys.concat([0]));
      var span = (max - min) || 1, n = points.length || 1;
      var xy = points.map(function (d, i) {
        var x = padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        var y = padT + plotH - ((d.y - min) / span) * plotH;
        return { x: x, y: y, d: d };
      });
      var path = xy.map(function (pt, i) { return (i ? "L" : "M") + r(pt.x) + " " + r(pt.y); }).join(" ");
      var area = path + " L" + r(xy[xy.length - 1].x) + " " + r(padT + plotH) + " L" + r(xy[0].x) + " " + r(padT + plotH) + " Z";
      var dots = xy.map(function (pt) {
        return '<circle class="line-dot" cx="' + r(pt.x) + '" cy="' + r(pt.y) + '" r="3"><title>' +
          esc(String(pt.d.x)) + ": " + esc(String(pt.d.y)) + "</title></circle>";
      }).join("");
      var labels = xy.map(function (pt) {
        return '<text class="bar-label" x="' + r(pt.x) + '" y="' + r(padT + plotH + 20) + '" text-anchor="middle">' + esc(String(pt.d.x)) + "</text>";
      }).join("");
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" preserveAspectRatio="xMidYMid meet" aria-label="line chart">' +
        '<path class="line-area" d="' + area + '" />' +
        '<path class="line-path" d="' + path + '" fill="none" />' + dots + labels + "</svg>";
    }

    /* =====================================================================
       LAYOUT REGISTRY
       ===================================================================== */
    var RENDERERS = {

      /* ---- hub: hero stats + a card linking to every other page ---- */
      hub: function (p) {
        var stats = (p.stats || []).map(function (s) {
          return '<div class="hero__stat" data-item>' +
            '<b class="hero__stat-value" data-count="' + esc(String(s.value)) + '">0</b>' +
            '<span class="hero__stat-label">' + esc(t(s.label)) + "</span></div>";
        }).join("");
        var cards = L.pages.filter(function (q) { return q.slug !== "home"; }).map(function (q) {
          return '<a class="card card--nav" data-item href="' + esc(L.pageHref(q)) + '" ' +
              'aria-label="' + esc(t(q.title)) + '">' +
            '<span class="material-symbols-rounded card__icon" aria-hidden="true">' + esc(q.icon || "label") + "</span>" +
            '<h3 class="card__title">' + esc(t(q.title)) + "</h3>" +
            '<p class="card__summary">' + esc(t(q.subtitle)) + "</p></a>";
        }).join("");
        return head(p) +
          (stats ? '<div class="hero__stats">' + stats + "</div>" : "") +
          '<div class="grid">' + cards + "</div>";
      },

      /* ---- gallery: search + chips + card grid + dialog ---- */
      gallery: function (p) {
        var cats = (p.categories || []).map(function (c) {
          return '<button class="chip" type="button" data-cat="' + esc(c.key) + '">' +
            esc(c[L.state.lang] || c.en) + "</button>";
        }).join("");
        var allLabel = L.state.lang === "en" ? "All" : "全部";
        return head(p) +
          '<div class="toolbar">' +
            '<input id="search" class="search" type="search" autocomplete="off" ' +
              'placeholder="' + (L.state.lang === "en" ? "Search…" : "搜尋…") + '" ' +
              'aria-label="' + (L.state.lang === "en" ? "Search" : "搜尋") + '" />' +
            (cats ? '<div class="chips"><button class="chip chip--active" type="button" data-cat="">' + esc(allLabel) + "</button>" + cats + "</div>" : "") +
          "</div>" +
          '<p class="result-count" id="resultCount" aria-live="polite"></p>' +
          '<div class="grid" id="grid"></div>';
      },

      /* ---- article: sticky TOC + prose + reading progress ---- */
      article: function (p) {
        var toc = (p.sections || []).map(function (s) {
          return '<a class="toc-link" href="#' + esc(s.id) + '" data-toc="' + esc(s.id) + '">' + esc(t(s.heading)) + "</a>";
        }).join("");
        var body = (p.sections || []).map(function (s) {
          var blocks = (s.blocks || []).map(function (b) {
            if (b.type === "h3") return "<h3>" + esc(t(b.text)) + "</h3>";
            if (b.type === "quote") return "<blockquote>" + esc(t(b.text)) + "</blockquote>";
            if (b.type === "code") return "<pre><code>" + esc(t(b.text)) + "</code></pre>";
            if (b.type === "ul") {
              var arr = (b.items && (b.items[L.state.lang] || b.items.en || b.items.zh)) || [];
              return "<ul>" + arr.map(function (li) { return "<li>" + esc(li) + "</li>"; }).join("") + "</ul>";
            }
            return "<p>" + esc(t(b.text)) + "</p>";
          }).join("");
          return '<section class="article-section" id="' + esc(s.id) + '" data-item ' +
            'aria-labelledby="' + esc(s.id) + '-h"><h2 id="' + esc(s.id) + '-h">' + esc(t(s.heading)) + "</h2>" + blocks + "</section>";
        }).join("");
        return '<div class="reading-progress" id="readingProgress" aria-hidden="true"></div>' +
          head(p) +
          '<div class="article-layout">' +
            '<nav class="toc" aria-label="Contents"><div class="toc__inner">' + toc + "</div></nav>" +
            '<div class="article-body prose">' + body + "</div>" +
          "</div>";
      },

      /* ---- dashboard: stat cards + bar + line + table ---- */
      dashboard: function (p) {
        var stats = (p.stats || []).map(function (s) {
          var d = s.delta;
          var deltaHtml = (d === 0 || d) ?
            '<span class="stat-delta stat-delta--' + (d >= 0 ? "up" : "down") + '">' +
              (d >= 0 ? "▲ " : "▼ ") + esc(String(Math.abs(d))) + "%</span>" : "";
          return '<div class="stat-card" data-item>' +
            '<span class="stat-label">' + esc(t(s.label)) + "</span>" +
            '<b class="stat-value">' + esc(String(s.value)) +
              (t(s.unit) ? ' <span class="stat-unit">' + esc(t(s.unit)) + "</span>" : "") + "</b>" +
            deltaHtml + "</div>";
        }).join("");
        var bars = p.bars ? '<figure class="panel" data-item><figcaption>' + esc(t(p.bars.title)) + "</figcaption>" +
          '<div class="chart-wrap">' + barChart(p.bars.series || []) + "</div></figure>" : "";
        var line = p.line ? '<figure class="panel" data-item><figcaption>' + esc(t(p.line.title)) + "</figcaption>" +
          '<div class="chart-wrap">' + lineChart(p.line.points || []) + "</div></figure>" : "";
        var table = "";
        if (p.table) {
          var thead = (p.table.columns || []).map(function (c) { return "<th>" + esc(t(c.label)) + "</th>"; }).join("");
          var tbody = (p.table.rows || []).map(function (row) {
            return "<tr data-item>" + (p.table.columns || []).map(function (c) {
              var v = row[c.key];
              return "<td>" + esc(typeof v === "object" ? t(v) : String(v == null ? "" : v)) + "</td>";
            }).join("") + "</tr>";
          }).join("");
          table = '<div class="panel panel--wide" data-item><div class="table-wrap"><table class="data-table">' +
            "<thead><tr>" + thead + "</tr></thead><tbody>" + tbody + "</tbody></table></div></div>";
        }
        return head(p) +
          '<div class="stat-grid">' + stats + "</div>" +
          '<div class="panel-grid">' + bars + line + "</div>" + table;
      },

      /* ---- timeline: dated event cards down a rail ---- */
      timeline: function (p) {
        var items = (p.events || []).map(function (ev) {
          return '<li class="tl-item" data-item><div class="tl-dot" aria-hidden="true"></div>' +
            '<div class="tl-card"><span class="tl-date">' + esc(t(ev.date)) + "</span>" +
            '<h3 class="tl-title">' + esc(t(ev.title)) + "</h3>" +
            '<p class="tl-body">' + esc(t(ev.body)) + "</p></div></li>";
        }).join("");
        return head(p) + '<ol class="timeline">' + items + "</ol>";
      },

      /* ---- table: searchable + sortable ---- */
      table: function (p) {
        return head(p) +
          '<div class="toolbar">' +
            '<input id="search" class="search" type="search" autocomplete="off" ' +
              'placeholder="' + (L.state.lang === "en" ? "Search…" : "搜尋…") + '" ' +
              'aria-label="' + (L.state.lang === "en" ? "Search" : "搜尋") + '" />' +
            '<div class="chips" id="tableChips"></div>' +
          "</div>" +
          '<div class="table-wrap"><table class="data-table" id="dataTable"><thead></thead><tbody></tbody></table></div>';
      },

      /* ---- bento: asymmetric tile grid ---- */
      bento: function (p) {
        var tiles = (p.tiles || []).map(function (tile) {
          return '<article class="tile tile--' + esc(tile.size || "sm") + (tile.accent ? " tile--accent" : "") + '" data-item>' +
            (tile.icon ? '<span class="material-symbols-rounded tile__icon" aria-hidden="true">' + esc(tile.icon) + "</span>" : "") +
            (tile.value ? '<b class="tile__value">' + esc(tile.value) + "</b>" : "") +
            '<h3 class="tile__title">' + esc(t(tile.title)) + "</h3>" +
            (t(tile.body) ? '<p class="tile__body">' + esc(t(tile.body)) + "</p>" : "") + "</article>";
        }).join("");
        return head(p) + '<div class="bento">' + tiles + "</div>";
      },

      /* ---- kanban: cards grouped by status column ---- */
      kanban: function (p) {
        var cols = (p.columns || []).map(function (col) {
          var cards = (p.cards || []).filter(function (c) { return c.column === col.key; }).map(function (c) {
            var tags = (c.tags || []).map(function (g) { return '<span class="tag">' + esc(g) + "</span>"; }).join("");
            return '<article class="kb-card" data-item><h3 class="kb-card__title">' + esc(t(c.title)) + "</h3>" +
              (t(c.body) ? '<p class="kb-card__body">' + esc(t(c.body)) + "</p>" : "") +
              (tags ? '<div class="card__tags">' + tags + "</div>" : "") + "</article>";
          }).join("");
          var count = (p.cards || []).filter(function (c) { return c.column === col.key; }).length;
          return '<div class="kb-col"><div class="kb-col__head">' + esc(t(col.label)) +
            ' <span class="kb-col__count">' + count + "</span></div>" +
            '<div class="kb-col__body">' + cards + "</div></div>";
        }).join("");
        return head(p) + '<div class="kanban">' + cols + "</div>";
      },

      /* ---- faq: searchable accordion ---- */
      faq: function (p) {
        var items = (p.qa || []).map(function (row) {
          return '<details class="acc-item" data-item data-q="' + esc((t(row.q) + " " + t(row.a)).toLowerCase()) + '">' +
            '<summary class="acc-q"><span>' + esc(t(row.q)) + "</span>" +
            '<span class="material-symbols-rounded acc-chevron" aria-hidden="true">expand_more</span></summary>' +
            '<div class="acc-a">' + esc(t(row.a)) + "</div></details>";
        }).join("");
        return head(p) +
          '<div class="toolbar"><input id="search" class="search" type="search" autocomplete="off" ' +
            'placeholder="' + (L.state.lang === "en" ? "Search…" : "搜尋…") + '" ' +
            'aria-label="' + (L.state.lang === "en" ? "Search" : "搜尋") + '" /></div>' +
          '<div class="accordion" id="accordion">' + items + "</div>";
      },

      /* ---- comparison: plans (cols) x features (rows) ---- */
      comparison: function (p) {
        var plans = p.plans || [], feats = p.features || [];
        var thead = '<th scope="col"></th>' + plans.map(function (pl) {
          return '<th scope="col" class="' + (pl.highlight ? "cmp-col--hl" : "") + '">' +
            '<div class="cmp-plan">' + esc(t(pl.name)) + "</div>" +
            '<div class="cmp-price">' + esc(t(pl.price)) + "</div>" +
            (t(pl.note) ? '<div class="cmp-note">' + esc(t(pl.note)) + "</div>" : "") + "</th>";
        }).join("");
        var rows = feats.map(function (f) {
          var cells = plans.map(function (pl) {
            var v = f.values ? f.values[pl.key] : undefined;
            var cell;
            if (v === true) cell = '<span class="cmp-yes material-symbols-rounded" aria-label="yes">check</span>';
            else if (v === false || v == null) cell = '<span class="cmp-no" aria-label="no">—</span>';
            else cell = esc(t(v));
            return '<td class="' + (pl.highlight ? "cmp-col--hl" : "") + '">' + cell + "</td>";
          }).join("");
          return '<tr data-item><th scope="row" class="cmp-feat">' + esc(t(f.label)) + "</th>" + cells + "</tr>";
        }).join("");
        return head(p) + '<div class="table-wrap"><table class="cmp-table">' +
          "<thead><tr>" + thead + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
      },

      /* ---- leaderboard: ranked list + tier grouping toggle ---- */
      leaderboard: function (p) {
        var listLabel = L.state.lang === "en" ? "List" : "排名";
        var tierLabel = L.state.lang === "en" ? "Tiers" : "階級";
        return head(p) +
          '<div class="seg" role="tablist">' +
            '<button class="seg__btn seg__btn--active" type="button" data-view="list">' + esc(listLabel) + "</button>" +
            '<button class="seg__btn" type="button" data-view="tier">' + esc(tierLabel) + "</button>" +
          "</div>" +
          '<div id="lbView"></div>';
      },

      /* ---- scrolly: sticky visual + stepped narrative ---- */
      scrolly: function (p) {
        var steps = (p.steps || []).map(function (s, i) {
          return '<div class="scrolly-step" data-item data-step="' + i + '"><p>' + esc(t(s.text)) + "</p></div>";
        }).join("");
        return head(p) +
          '<div class="scrolly">' +
            '<div class="scrolly-sticky"><div class="scrolly-visual" id="scrollyVisual"></div></div>' +
            '<div class="scrolly-steps">' + steps + "</div>" +
          "</div>";
      },

      /* ---- map: Leaflet map + list (needs Leaflet on the page) ---- */
      map: function (p) {
        return head(p) +
          '<div class="map-layout">' +
            '<div class="map-box" id="map" role="application" aria-label="Map"></div>' +
            '<ul class="map-list" id="mapList"></ul>' +
          "</div>";
      },

      /* ---- home: metro map hero + line directory + transfer guides + arcade + tools ---- */
      home: function (p) {
        var EN = L.state.lang === "en";
        var cats = window.SITE_CATEGORIES || [];
        var families = cats.filter(function (c) { return MAP_PATHS[c.key]; });
        var tagline = p.hero && t(p.hero.tagline) ? t(p.hero.tagline) : t(p.subtitle);
        var start = pageBySlug("start");

        var hero = '<section class="hero">' +
          '<div class="hero__text">' +
            '<h1 class="hero__title">' + heroTitle(t(p.title)) + "</h1>" +
            '<div class="hero__side">' +
              '<p class="hero__tagline">' + esc(tagline) + "</p>" +
              '<div class="hero__cta">' +
                (start ? '<a class="btn btn--ink" href="' + esc(L.pageHref(start)) + '">' +
                  '<span class="material-symbols-rounded" aria-hidden="true">rocket_launch</span>' + esc(t(start.title)) + "</a>" : "") +
                '<a class="btn btn--line" href="#lines">' + (EN ? "Browse the lines" : "看全部路線") + "</a>" +
              "</div>" +
            "</div>" +
          "</div>" +
          '<div class="metro" id="metro">' + metroMap(families) + "</div>" +
          '<p class="metro__hint" aria-hidden="true"><span class="material-symbols-rounded">swipe</span>' +
            (EN ? "Swipe to see the whole map" : "左右滑動看完整路線圖") + "</p>" +
        "</section>";

        var legend = '<section class="legend">' +
          '<div class="legend__keys" aria-label="' + (EN ? "Map legend" : "圖例") + '">' +
            '<p class="legend__key"><span class="legend__line" aria-hidden="true"></span>' +
              (EN ? "A line is a product family" : "一條線＝一個產品家族") + "</p>" +
            '<p class="legend__key"><span class="legend__stop" aria-hidden="true"></span>' +
              (EN ? "A stop is one product, with its own lesson" : "一站＝一個產品，各有一篇教材") + "</p>" +
            '<p class="legend__key"><span class="legend__hub" aria-hidden="true"></span>' +
              (EN ? "Every line runs through the same global network" : "所有路線都跑在同一張全球網路上") + "</p>" +
          "</div>" +
          (t(p.intro) ? '<p class="legend__intro">' + esc(t(p.intro)) + "</p>" : "") +
          specSheet(p.stats, EN ? "At a glance" : "這份指南") +
        "</section>";

        var lines = families.map(function (c) {
          var stops = productsOf(c.key);
          return '<article class="lrow" data-line="' + esc(c.key) + '">' +
            '<a class="lrow__head" href="' + esc(c.key) + '.html">' + bullet(c.key) +
              '<span class="lrow__name">' + esc(t(c.title)) + "</span>" +
              '<span class="lrow__count">' + stops.length + (EN ? " stops" : " 站") + "</span></a>" +
            '<p class="lrow__blurb">' + esc(t(c.blurb)) + "</p>" +
            routeStrip(stops, null) +
          "</article>";
        }).join("");

        /* integration guides: a departures board grouped by track */
        var integ = cats.filter(function (c) { return c.key === "integrations"; })[0];
        var board = "";
        if (integ) {
          var groups = groupBy(productsOf("integrations"));
          board = '<section class="block" data-line="integrations">' +
            '<header class="block__head"><a class="block__title" href="integrations.html">' + bullet("integrations") +
              "<span>" + esc(t(integ.title)) + "</span></a>" +
              '<p class="block__sub">' + esc(t(integ.blurb)) + "</p></header>" +
            '<div class="board">' + groups.map(function (g) {
              return '<div class="board__group"><h3 class="board__name">' + esc(g.name) +
                ' <span class="board__n">' + g.items.length + "</span></h3><ol class=\"board__list\">" +
                g.items.map(function (q) {
                  return '<li><a href="' + esc(L.pageHref(q)) + '"><span class="material-symbols-rounded" aria-hidden="true">' +
                    esc(q.icon || "east") + "</span>" + esc(t(q.title)) + "</a></li>";
                }).join("") + "</ol></div>";
            }).join("") + "</div></section>";
        }

        /* arcade: ticket stubs */
        var arc = cats.filter(function (c) { return c.key === "arcade"; })[0];
        var arcade = "";
        if (arc) {
          arcade = '<section class="block" data-line="arcade">' +
            '<header class="block__head"><a class="block__title" href="arcade.html">' + bullet("arcade") +
              "<span>" + esc(t(arc.title)) + "</span></a>" +
              '<p class="block__sub">' + esc(t(arc.blurb)) + "</p></header>" +
            '<div class="tickets">' + productsOf("arcade").map(function (q) {
              return '<a class="ticket" href="' + esc(L.pageHref(q)) + '">' +
                '<span class="ticket__kind">' + esc(t(q.group)) + "</span>" +
                '<span class="ticket__name">' + esc(t(q.title)) + "</span>" +
                '<span class="material-symbols-rounded ticket__icon" aria-hidden="true">' + esc(q.icon || "sports_esports") + "</span></a>";
            }).join("") + "</div></section>";
        }

        var tools = ["start", "glossary", "quiz", "flashcards"].map(function (slug) {
          var q = pageBySlug(slug);
          if (!q) return "";
          return '<a class="info__item" href="' + esc(L.pageHref(q)) + '">' +
            '<span class="material-symbols-rounded info__icon" aria-hidden="true">' + esc(q.icon || "school") + "</span>" +
            '<span class="info__t">' + esc(t(q.title)) + "</span>" +
            '<span class="info__d">' + esc(t(q.subtitle)) + "</span></a>";
        }).join("");

        return hero + legend +
          '<section class="block" id="lines">' +
            '<header class="block__head"><h2 class="block__title block__title--plain">' + (EN ? "Six lines, 28 stops" : "六條路線，28 站") + "</h2>" +
            '<p class="block__sub">' + (EN ? "Six product families make up the Cloudflare developer platform. Pick a line, then a stop." : "六大產品家族構成了 Cloudflare 開發者平台。先挑一條線，再挑一站。") + "</p></header>" +
            '<div class="lrows">' + lines + "</div>" +
          "</section>" +
          board + arcade +
          '<section class="block">' +
            '<header class="block__head"><h2 class="block__title block__title--plain">' + (EN ? "Learning tools" : "學習工具") + "</h2>" +
            '<p class="block__sub">' + (EN ? "Practice and look things up as you learn." : "邊學邊練習、隨時查得到。") + "</p></header>" +
            '<div class="info">' + tools + "</div>" +
          "</section>";
      },

      /* ---- category: the line's route + every stop on it ---- */
      category: function (p) {
        var products = productsOf(p.key);
        var EN = L.state.lang === "en";
        var cta = p.key === "arcade" ? (EN ? "Play" : "開始玩") : (EN ? "Learn" : "開始學");
        function stopRow(q) {
          return '<a class="stop" href="' + esc(L.pageHref(q)) + '">' +
            '<span class="stop__dot" aria-hidden="true"></span>' +
            '<span class="stop__body"><span class="stop__name">' +
              '<span class="material-symbols-rounded" aria-hidden="true">' + esc(q.icon || "label") + "</span>" + esc(t(q.title)) + "</span>" +
              '<span class="stop__sub">' + esc(t(q.subtitle)) + "</span></span>" +
            '<span class="stop__go">' + cta + "</span></a>";
        }
        var intro = t(p.intro) ? '<p class="lead">' + esc(t(p.intro)) + "</p>" : "";
        var body, strip;
        if (products.some(function (q) { return q.group; })) {
          var groups = groupBy(products);
          strip = routeStrip(groups.map(function (g, i) {
            return { href: "#track-" + (i + 1), label: g.name, note: g.items.length + (EN ? " stops" : " 站") };
          }), null);
          body = groups.map(function (g, i) {
            return '<section class="track" id="track-' + (i + 1) + '">' +
              '<h2 class="track__name">' + esc(g.name) + ' <span class="track__n">' + g.items.length + "</span></h2>" +
              '<div class="stops">' + g.items.map(stopRow).join("") + "</div></section>";
          }).join("");
        } else {
          strip = routeStrip(products, null);
          body = '<div class="stops">' + products.map(stopRow).join("") + "</div>";
        }
        return pageHeader(p, { strip: strip }) + intro + body;
      },

      /* ---- lesson: line strip + spec sheet + stops-of-this-page TOC ---- */
      lesson: function (p) {
        var EN = L.state.lang === "en";
        var toc = (p.sections || []).map(function (s) {
          return '<a href="#' + esc(s.id) + '" data-toc="' + esc(s.id) + '">' + esc(t(s.heading)) + "</a>";
        }).join("");
        var body = (p.sections || []).map(function (s) {
          return '<section class="lsec" id="' + esc(s.id) + '">' +
            '<h2 class="lsec__head"><span class="material-symbols-rounded" aria-hidden="true">' + esc(s.icon || "label") + "</span>" +
            esc(t(s.heading)) + "</h2>" +
            renderBlocks(s.blocks) + "</section>";
        }).join("");
        return '<div class="reading-progress" id="readingProgress" aria-hidden="true"></div>' +
          pageHeader(p) +
          '<div class="lesson-layout">' +
            '<nav class="lesson-toc" aria-label="' + (EN ? "On this page" : "本頁段落") + '">' +
              '<p class="lesson-toc__label">' + (EN ? "On this page" : "本頁段落") + "</p>" +
              '<div class="lesson-toc__inner">' + toc + "</div></nav>" +
            '<div class="lesson-body">' + body + lessonFoot(p) + "</div>" +
          "</div>";
      },

      /* ---- glossary: searchable term list ---- */
      glossary: function (p) {
        var EN = L.state.lang === "en";
        return lheroHTML(p) +
          '<div class="toolbar"><input id="search" class="search" type="search" autocomplete="off" placeholder="' +
            (EN ? "Search terms…" : "搜尋術語…") + '" aria-label="' + (EN ? "Search" : "搜尋") + '" /></div>' +
          '<p class="result-count" id="resultCount" aria-live="polite"></p>' +
          '<div class="gloss-grid" id="glossGrid"></div>';
      },

      /* ---- quiz: in-memory multiple-choice (ephemeral) ---- */
      quiz: function (p) {
        return lheroHTML(p) + '<div class="quiz" id="quizRoot"></div>';
      },

      /* ---- flashcards: click to flip ---- */
      flashcards: function (p) {
        var EN = L.state.lang === "en";
        var cards = (p.cards || []).map(function (c, i) {
          return '<button class="fc" data-item type="button" data-fc="' + i + '" aria-pressed="false">' +
            '<div class="fc__inner">' +
              '<div class="fc__face fc__front"><span class="fc__term">' + esc(t(c.front)) + "</span>" +
                '<span class="fc__hint"><span class="material-symbols-rounded">touch_app</span>' + (EN ? "Flip" : "翻面") + "</span></div>" +
              '<div class="fc__face fc__back"><span class="fc__def">' + esc(t(c.back)) + "</span></div>" +
            "</div></button>";
        }).join("");
        return lheroHTML(p) +
          '<p class="fc-tip"><span class="material-symbols-rounded">touch_app</span>' +
            (EN ? "Tap a card to flip it." : "點一下卡片就會翻面。") + "</p>" +
          '<div class="fc-grid">' + cards + "</div>";
      },

      /* ---- arcade mini-games (built by their WIRE entry) ---- */
      "game-match":     function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="matchRoot"></div>'; },
      "game-memory":    function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="memRoot"></div>'; },
      "game-sort":      function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="sortRoot"></div>'; },
      "game-pick":      function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="pickRoot"></div>'; },
      "game-order":     function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="orderRoot"></div>'; },
      "game-truefalse": function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="tfRoot"></div>'; },
      "game-build":     function (p) { return lheroHTML(p) + '<div class="gamebox" data-item id="buildRoot"></div>'; }
    };

    /* =====================================================================
       WIRING (interactions) — keyed by layout, run after innerHTML is set
       ===================================================================== */
    var WIRE = {
      hub: function () { animateCounters(); },

      gallery: function (p) {
        var grid = document.getElementById("grid");
        var search = document.getElementById("search");
        var count = document.getElementById("resultCount");
        var chips = [].slice.call(pageEl.querySelectorAll(".chip"));
        var st = { q: "", cat: "" };

        function matches(item) {
          if (st.cat && item.category !== st.cat) return false;
          if (!st.q) return true;
          var hay = (t(item.title) + " " + t(item.summary) + " " + (item.tags || []).join(" ")).toLowerCase();
          return hay.indexOf(st.q) !== -1;
        }
        function paint() {
          var rows = (p.items || []).filter(matches);
          grid.innerHTML = rows.map(function (item) {
            var tags = (item.tags || []).map(function (g) { return '<span class="tag">' + esc(g) + "</span>"; }).join("");
            return '<article class="card" tabindex="0" role="button" data-item data-slug="' + esc(item.slug) + '" ' +
              'aria-label="' + esc(t(item.title)) + '">' +
              '<h3 class="card__title">' + esc(t(item.title)) + "</h3>" +
              '<p class="card__summary">' + esc(t(item.summary)) + "</p>" +
              (tags ? '<div class="card__tags">' + tags + "</div>" : "") + "</article>";
          }).join("");
          if (count) count.textContent = rows.length + (L.state.lang === "en" ? " result(s)" : " 筆結果");
          wireCards();
        }
        function wireCards() {
          [].forEach.call(grid.querySelectorAll(".card[data-slug]"), function (card) {
            var slug = card.dataset.slug;
            card.addEventListener("click", function () { openItem(slug); });
            card.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openItem(slug); }
            });
          });
        }
        function findItem(slug) {
          return (p.items || []).filter(function (it) { return it.slug === slug; })[0] || null;
        }
        function openItem(slug) {
          var item = findItem(slug); if (!item) return;
          var dlg = L.dialog(), body = document.getElementById("dialogBody");
          var tags = (item.tags || []).map(function (g) { return '<span class="tag">' + esc(g) + "</span>"; }).join("");
          body.innerHTML = '<h2 id="dialogTitle">' + esc(t(item.title)) + "</h2>" +
            (tags ? '<div class="card__tags">' + tags + "</div>" : "") +
            "<p>" + esc(t(item.overview) || t(item.summary)) + "</p>";
          if (!dlg.open) dlg.showModal();
          if (location.hash.slice(1) !== slug) history.replaceState(null, "", "#" + slug);
        }
        function syncHash() {
          var slug = location.hash.slice(1);
          if (slug && findItem(slug)) openItem(slug);
        }
        if (search) search.addEventListener("input", function () { st.q = this.value.trim().toLowerCase(); paint(); });
        chips.forEach(function (chip) {
          chip.addEventListener("click", function () {
            chips.forEach(function (c) { c.classList.remove("chip--active"); });
            chip.classList.add("chip--active");
            st.cat = chip.dataset.cat || "";
            paint();
          });
        });
        /* closing the dialog clears the #slug so the URL returns to clean state
           and a later deep link to the SAME slug fires hashchange again */
        var dlg = L.dialog();
        function onClose() {
          var slug = location.hash.slice(1);
          if (slug && findItem(slug)) history.replaceState(null, "", location.pathname + location.search);
        }
        dlg.addEventListener("close", onClose);
        var onHash = function () { syncHash(); };
        window.addEventListener("hashchange", onHash);
        teardowns.push(function () {
          window.removeEventListener("hashchange", onHash);
          dlg.removeEventListener("close", onClose);
        });
        paint();
        syncHash();
      },

      article: function () {
        var prog = document.getElementById("readingProgress");
        var links = [].slice.call(pageEl.querySelectorAll(".toc-link"));
        var secs = [].slice.call(pageEl.querySelectorAll(".article-section"));
        function onScroll() {
          var h = document.documentElement;
          var max = h.scrollHeight - h.clientHeight;
          if (prog) prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        teardowns.push(function () { window.removeEventListener("scroll", onScroll); });
        if ("IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              if (!en.isIntersecting) return;
              links.forEach(function (a) {
                var on = a.dataset.toc === en.target.id;
                a.classList.toggle("toc-link--active", on);
              });
            });
          }, { rootMargin: "-30% 0px -60% 0px" });
          secs.forEach(function (s) { io.observe(s); });
          teardowns.push(function () { io.disconnect(); });
        }
      },

      dashboard: function () { /* static charts; nothing to wire */ },

      table: function (p) {
        var table = document.getElementById("dataTable");
        var thead = table.querySelector("thead"), tbody = table.querySelector("tbody");
        var search = document.getElementById("search");
        var chipsBox = document.getElementById("tableChips");
        var cols = p.columns || [];
        var st = { q: "", filter: "", sortKey: null, dir: 1 };
        var filterCol = cols.filter(function (c) { return c.filter; })[0];

        function cellText(row, c) { var v = row[c.key]; return typeof v === "object" ? t(v) : String(v == null ? "" : v); }
        function rowMatches(row) {
          if (filterCol && st.filter && cellText(row, filterCol) !== st.filter) return false;
          if (!st.q) return true;
          return cols.some(function (c) { return cellText(row, c).toLowerCase().indexOf(st.q) !== -1; });
        }
        function paintHead() {
          thead.innerHTML = "<tr>" + cols.map(function (c) {
            var arrow = st.sortKey === c.key ? (st.dir > 0 ? " ▲" : " ▼") : "";
            return '<th class="th-sort" data-key="' + esc(c.key) + '" role="button" tabindex="0" aria-label="Sort by ' +
              esc(t(c.label)) + '">' + esc(t(c.label)) + esc(arrow) + "</th>";
          }).join("") + "</tr>";
          [].forEach.call(thead.querySelectorAll(".th-sort"), function (th) {
            th.addEventListener("click", function () { sortBy(th.dataset.key); });
            th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortBy(th.dataset.key); } });
          });
        }
        function sortBy(key) {
          if (st.sortKey === key) st.dir = -st.dir; else { st.sortKey = key; st.dir = 1; }
          paint();
        }
        function paint() {
          paintHead();
          var col = cols.filter(function (c) { return c.key === st.sortKey; })[0];
          var rows = (p.rows || []).filter(rowMatches).slice();
          if (col) {
            rows.sort(function (a, b) {
              var va = a[col.key], vb = b[col.key];
              if (col.type === "num") return (Number(va) - Number(vb)) * st.dir;
              return String(typeof va === "object" ? t(va) : va).localeCompare(String(typeof vb === "object" ? t(vb) : vb)) * st.dir;
            });
          }
          tbody.innerHTML = rows.map(function (row) {
            return "<tr data-item>" + cols.map(function (c) {
              if (c.type === "link") {
                var u = row[c.key];
                return '<td><a class="row-link" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + "</a></td>";
              }
              return "<td>" + esc(cellText(row, c)) + "</td>";
            }).join("") + "</tr>";
          }).join("");
        }
        if (filterCol) {
          var vals = [];
          (p.rows || []).forEach(function (row) { var v = cellText(row, filterCol); if (vals.indexOf(v) === -1) vals.push(v); });
          var allLabel = L.state.lang === "en" ? "All" : "全部";
          chipsBox.innerHTML = '<button class="chip chip--active" type="button" data-v="">' + esc(allLabel) + "</button>" +
            vals.map(function (v) { return '<button class="chip" type="button" data-v="' + esc(v) + '">' + esc(v) + "</button>"; }).join("");
          [].forEach.call(chipsBox.querySelectorAll(".chip"), function (chip) {
            chip.addEventListener("click", function () {
              [].forEach.call(chipsBox.querySelectorAll(".chip"), function (c) { c.classList.remove("chip--active"); });
              chip.classList.add("chip--active");
              st.filter = chip.dataset.v || "";
              paint();
            });
          });
        }
        if (search) search.addEventListener("input", function () { st.q = this.value.trim().toLowerCase(); paint(); });
        paint();
      },

      bento: function () { /* static */ },
      kanban: function () { /* static */ },

      faq: function () {
        var search = document.getElementById("search");
        var items = [].slice.call(pageEl.querySelectorAll(".acc-item"));
        if (search) search.addEventListener("input", function () {
          var q = this.value.trim().toLowerCase();
          items.forEach(function (it) {
            var hit = !q || (it.dataset.q || "").indexOf(q) !== -1;
            it.style.display = hit ? "" : "none";
          });
        });
      },

      comparison: function () { /* static */ },

      leaderboard: function (p) {
        var view = document.getElementById("lbView");
        var btns = [].slice.call(pageEl.querySelectorAll(".seg__btn"));
        var entries = (p.entries || []).slice().sort(function (a, b) { return b.score - a.score; });
        function row(e, rank) {
          return '<li class="lb-row" data-item>' +
            (rank ? '<span class="lb-rank">' + rank + "</span>" : "") +
            '<span class="lb-tier lb-tier--' + esc(e.tier || "") + '">' + esc(e.tier || "") + "</span>" +
            '<span class="lb-name">' + esc(t(e.name)) + "</span>" +
            '<span class="lb-meta">' + esc(t(e.meta)) + "</span>" +
            '<span class="lb-score">' + esc(String(e.score)) + "</span></li>";
        }
        function listView() {
          view.innerHTML = '<ol class="lb-list">' + entries.map(function (e, i) { return row(e, i + 1); }).join("") + "</ol>";
        }
        function tierView() {
          var tiers = [];
          entries.forEach(function (e) { if (tiers.indexOf(e.tier) === -1) tiers.push(e.tier); });
          view.innerHTML = tiers.map(function (tier) {
            var rows = entries.filter(function (e) { return e.tier === tier; }).map(function (e) { return row(e); }).join("");
            return '<div class="lb-tier-group"><div class="lb-tier-head lb-tier--' + esc(tier) + '">' + esc(tier) + "</div>" +
              '<ol class="lb-list">' + rows + "</ol></div>";
          }).join("");
        }
        btns.forEach(function (b) {
          b.addEventListener("click", function () {
            btns.forEach(function (x) { x.classList.remove("seg__btn--active"); });
            b.classList.add("seg__btn--active");
            if (b.dataset.view === "tier") tierView(); else listView();
          });
        });
        listView();
      },

      scrolly: function (p) {
        var visual = document.getElementById("scrollyVisual");
        var steps = [].slice.call(pageEl.querySelectorAll(".scrolly-step"));
        function paintVisual(i) {
          var s = (p.steps || [])[i]; if (!s) return;
          var v = s.visual || {};
          if (v.type === "bars") {
            visual.innerHTML = '<div class="chart-wrap">' + barChart(v.bars || [], v.color) + "</div>";
          } else {
            visual.innerHTML = '<div class="scrolly-stat" style="color:' + esc(v.color || "var(--primary)") + '">' +
              esc(t(v.value)) + "</div>";
          }
        }
        paintVisual(0);
        if ("IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              if (en.isIntersecting) {
                steps.forEach(function (s) { s.classList.remove("scrolly-step--active"); });
                en.target.classList.add("scrolly-step--active");
                paintVisual(parseInt(en.target.dataset.step, 10) || 0);
              }
            });
          }, { rootMargin: "-45% 0px -45% 0px" });
          steps.forEach(function (s) { io.observe(s); });
          teardowns.push(function () { io.disconnect(); });
        }
      },

      map: function (p) {
        var listEl = document.getElementById("mapList");
        var places = p.places || [];
        listEl.innerHTML = places.map(function (pl) {
          return '<li class="place" data-item data-slug="' + esc(pl.slug) + '" tabindex="0" role="button" ' +
            'aria-label="' + esc(t(pl.name)) + '"><b>' + esc(t(pl.name)) + "</b>" +
            '<span>' + esc(t(pl.body)) + "</span></li>";
        }).join("");

        if (typeof window.L === "undefined" || !window.L.map) {
          // Leaflet not loaded (offline / blocked): list-only graceful fallback.
          document.getElementById("map").innerHTML =
            '<div class="map-fallback">' + esc(L.state.lang === "en" ? "Map unavailable offline — see the list." : "離線時地圖無法載入 — 請看清單。") + "</div>";
          return;
        }
        var map = window.L.map("map", { scrollWheelZoom: false });
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap", maxZoom: 19
        }).addTo(map);
        var markers = {}, group = [];
        places.forEach(function (pl) {
          /* alt + title give Leaflet's marker <img role="button"> an accessible name */
          var m = window.L.marker([pl.lat, pl.lng], { alt: t(pl.name), title: t(pl.name), keyboard: true })
            .addTo(map).bindPopup("<b>" + esc(t(pl.name)) + "</b><br>" + esc(t(pl.body)));
          markers[pl.slug] = m; group.push([pl.lat, pl.lng]);
        });
        if (group.length) map.fitBounds(group, { padding: [30, 30] });
        [].forEach.call(listEl.querySelectorAll(".place"), function (li) {
          function go() { var m = markers[li.dataset.slug]; if (m) { map.panTo(m.getLatLng()); m.openPopup(); } }
          li.addEventListener("click", go);
          li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        });
        teardowns.push(function () { try { map.remove(); } catch (e) {} });
      },

      home: function () { centerMetro(); },
      category: function () { },

      lesson: function () {
        lessonScrollspy();

        wireCopy();
        renderMermaid();
      },

      glossary: function (p) {
        var grid = document.getElementById("glossGrid");
        var search = document.getElementById("search");
        var count = document.getElementById("resultCount");
        var EN = L.state.lang === "en";
        var terms = (p.terms || []).slice().sort(function (a, b) {
          return t(a.term).localeCompare(t(b.term), L.state.lang === "zh" ? "zh-Hant" : "en");
        });
        function paint(q) {
          var rows = terms.filter(function (it) {
            if (!q) return true;
            return (t(it.term) + " " + t(it.def)).toLowerCase().indexOf(q) !== -1;
          });
          grid.innerHTML = rows.length ? rows.map(function (it) {
            var cat = t(it.cat) ? '<span class="gloss-cat">' + esc(t(it.cat)) + "</span>" : "";
            return '<details class="gloss-item" data-item><summary>' + esc(t(it.term)) + cat +
              '<span class="material-symbols-rounded gloss-chevron">expand_more</span></summary>' +
              '<div class="gloss-def">' + esc(t(it.def)) + "</div></details>";
          }).join("") : '<p class="gloss-empty">' + (EN ? "No matching terms." : "找不到相符的術語。") + "</p>";
          if (count) count.textContent = rows.length + (EN ? " terms" : " 個術語");
        }
        if (search) search.addEventListener("input", function () { paint(this.value.trim().toLowerCase()); });
        paint("");
      },

      flashcards: function () {
        [].forEach.call(pageEl.querySelectorAll(".fc"), function (card) {
          card.addEventListener("click", function () {
            var on = card.classList.toggle("is-flipped");
            card.setAttribute("aria-pressed", on ? "true" : "false");
          });
        });
      },

      quiz: function (p) {
        var root = document.getElementById("quizRoot");
        var qs = p.questions || [];
        var EN = L.state.lang === "en";
        var st = { i: 0, score: 0, answered: false, picked: -1 };
        if (!qs.length) { root.innerHTML = '<p class="empty">No questions.</p>'; return; }

        function renderQ() {
          var q = qs[st.i];
          var opts = (q.options || []).map(function (o, idx) {
            var cls = "quiz-opt";
            if (st.answered) {
              if (idx === q.answer) cls += " quiz-opt--correct";
              else if (idx === st.picked) cls += " quiz-opt--wrong";
            }
            return '<button class="' + cls + '" type="button" data-opt="' + idx + '"' + (st.answered ? " disabled" : "") + ">" +
              '<span class="quiz-opt__mark">' + String.fromCharCode(65 + idx) + "</span><span>" + esc(t(o)) + "</span></button>";
          }).join("");
          var explain = st.answered ? '<div class="quiz-explain"><b>' +
            (st.picked === q.answer ? (EN ? "Correct! " : "答對了！") : (EN ? "Not quite. " : "再想想。")) + "</b>" +
            esc(t(q.explain)) + "</div>" : "";
          var nextLabel = st.i === qs.length - 1 ? (EN ? "See result" : "看結果") : (EN ? "Next" : "下一題");
          root.innerHTML =
            '<div class="quiz-top"><span class="quiz-progress">' +
              (EN ? "Question " + (st.i + 1) + " of " + qs.length : "第 " + (st.i + 1) + " / " + qs.length + " 題") + "</span>" +
              '<span class="quiz-score">' + (EN ? "Score: " : "得分：") + st.score + "/" + qs.length + "</span></div>" +
            '<div class="quiz-bar"><span class="quiz-bar__fill" style="width:' + (st.i / qs.length * 100) + '%"></span></div>' +
            '<div class="quiz-card" data-item><p class="quiz-q">' + esc(t(q.q)) + "</p>" +
              '<div class="quiz-opts">' + opts + "</div>" + explain +
              '<div class="quiz-nav"><button class="quiz-btn" type="button" data-next' + (st.answered ? "" : " disabled") + ">" +
                esc(nextLabel) + ' <span class="material-symbols-rounded">arrow_forward</span></button></div></div>';
          [].forEach.call(root.querySelectorAll("[data-opt]"), function (b) {
            b.addEventListener("click", function () {
              if (st.answered) return;
              st.answered = true; st.picked = parseInt(b.dataset.opt, 10);
              if (st.picked === q.answer) st.score++;
              renderQ();
            });
          });
          var nx = root.querySelector("[data-next]");
          if (nx) nx.addEventListener("click", function () {
            if (!st.answered) return;
            st.i++; st.answered = false; st.picked = -1;
            if (st.i >= qs.length) renderResult(); else renderQ();
          });
        }
        function renderResult() {
          var pct = Math.round(st.score / qs.length * 100);
          var msg = pct >= 80 ? (EN ? "Excellent — you really know Cloudflare!" : "太強了！你很懂 Cloudflare。")
                  : pct >= 50 ? (EN ? "Nice work. Review a few topics and try again." : "不錯喔——複習幾個主題再挑戰一次。")
                  : (EN ? "Good start. Revisit the lessons and retry!" : "好的開始，回去看看教材再試一次！");
          root.innerHTML = '<div class="quiz-card quiz-result" data-item><div class="quiz-result__ring">' + pct + "%</div>" +
            '<p class="quiz-result__msg">' + esc(msg) + (EN ? " (" : "（") + st.score + "/" + qs.length + (EN ? ")" : "）") + "</p>" +
            '<button class="quiz-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' +
            (EN ? "Try again" : "再試一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () {
            st.i = 0; st.score = 0; st.answered = false; st.picked = -1; renderQ();
          });
        }
        renderQ();
      },

      /* ===================== ARCADE MINI-GAMES ===================== */
      "game-match": function (p) {
        var root = document.getElementById("matchRoot");
        var EN = L.state.lang === "en";
        var pairs = p.pairs || [];
        var rights = shuffle(pairs.map(function (pr, i) { return { id: i, txt: t(pr.right) }; }));
        var st = { sel: null, matched: {}, tries: 0 };
        function paint() {
          var leftCol = pairs.map(function (pr, i) {
            var cls = "match-item" + (st.matched[i] ? " is-done" : "") + (st.sel === i ? " is-sel" : "");
            return '<button class="' + cls + '" type="button" data-side="L" data-id="' + i + '"' + (st.matched[i] ? " disabled" : "") + ">" + esc(t(pr.left)) + "</button>";
          }).join("");
          var rightCol = rights.map(function (r) {
            var cls = "match-item" + (st.matched[r.id] ? " is-done" : "");
            return '<button class="' + cls + '" type="button" data-side="R" data-id="' + r.id + '"' + (st.matched[r.id] ? " disabled" : "") + ">" + esc(r.txt) + "</button>";
          }).join("");
          var d = Object.keys(st.matched).length;
          var status = d === pairs.length
            ? '<span class="game-win"><span class="material-symbols-rounded">celebration</span>' + (EN ? "Solved in " + st.tries + " tries!" : "用 " + st.tries + " 次完成！") + "</span>"
            : '<span class="game-stat">' + d + "/" + pairs.length + (EN ? " matched · " : " 對 · ") + st.tries + (EN ? " tries" : " 次") + "</span>";
          root.innerHTML = '<div class="game-bar">' + status +
            '<button class="game-btn game-btn--ghost" type="button" data-reset><span class="material-symbols-rounded">replay</span>' + (EN ? "Restart" : "重來") + "</button></div>" +
            '<div class="match"><div class="match-col">' + leftCol + '</div><div class="match-col">' + rightCol + "</div></div>";
          [].forEach.call(root.querySelectorAll(".match-item:not([disabled])"), function (b) {
            b.addEventListener("click", function () { click(b.dataset.side, parseInt(b.dataset.id, 10)); });
          });
          root.querySelector("[data-reset]").addEventListener("click", function () { st = { sel: null, matched: {}, tries: 0 }; rights = shuffle(rights); paint(); });
        }
        function click(side, id) {
          if (side === "L") { st.sel = (st.sel === id ? null : id); paint(); return; }
          if (st.sel === null) return;
          st.tries++;
          if (st.sel === id) { st.matched[id] = true; st.sel = null; paint(); }
          else {
            var lb = root.querySelector('.match-item[data-side="L"][data-id="' + st.sel + '"]');
            var rb = root.querySelector('.match-item[data-side="R"][data-id="' + id + '"]');
            if (lb) lb.classList.add("is-wrong"); if (rb) rb.classList.add("is-wrong");
            setTimeout(function () { st.sel = null; paint(); }, 550);
          }
        }
        paint();
      },

      "game-memory": function (p) {
        var root = document.getElementById("memRoot");
        var EN = L.state.lang === "en";
        var tiles = p.tiles || [];
        var deck = shuffle([].concat(
          tiles.map(function (tl, i) { return { id: i, kind: "icon", v: tl.icon }; }),
          tiles.map(function (tl, i) { return { id: i, kind: "label", v: t(tl.label) }; })
        ));
        var st = { up: [], matched: {}, moves: 0, lock: false };
        function paint() {
          var mc = Object.keys(st.matched).length;
          var grid = deck.map(function (c, idx) {
            var faceUp = st.up.indexOf(idx) !== -1 || st.matched[c.id];
            var inner = c.kind === "icon"
              ? '<span class="material-symbols-rounded mem-icon">' + esc(c.v) + "</span>"
              : '<span class="mem-text">' + esc(c.v) + "</span>";
            return '<button class="mem-card' + (faceUp ? " is-up" : "") + (st.matched[c.id] ? " is-matched" : "") + '" type="button" data-idx="' + idx + '"' + (faceUp ? " disabled" : "") + ">" +
              '<span class="mem-face mem-back"><span class="material-symbols-rounded">cloud</span></span>' +
              '<span class="mem-face mem-front">' + inner + "</span></button>";
          }).join("");
          var status = mc === tiles.length
            ? '<span class="game-win"><span class="material-symbols-rounded">celebration</span>' + (EN ? "Cleared in " + st.moves + " moves!" : st.moves + " 步全配對！") + "</span>"
            : '<span class="game-stat">' + mc + "/" + tiles.length + (EN ? " pairs · " : " 對 · ") + st.moves + (EN ? " moves" : " 步") + "</span>";
          root.innerHTML = '<div class="game-bar">' + status +
            '<button class="game-btn game-btn--ghost" type="button" data-reset><span class="material-symbols-rounded">replay</span>' + (EN ? "Restart" : "重來") + "</button></div>" +
            '<div class="mem-grid">' + grid + "</div>";
          [].forEach.call(root.querySelectorAll(".mem-card:not([disabled])"), function (b) {
            b.addEventListener("click", function () { flip(parseInt(b.dataset.idx, 10)); });
          });
          root.querySelector("[data-reset]").addEventListener("click", function () { deck = shuffle(deck); st = { up: [], matched: {}, moves: 0, lock: false }; paint(); });
        }
        function flip(idx) {
          if (st.lock || st.up.indexOf(idx) !== -1 || st.matched[deck[idx].id]) return;
          st.up.push(idx);
          if (st.up.length === 2) {
            st.moves++;
            var a = deck[st.up[0]], b = deck[st.up[1]];
            if (a.id === b.id) { st.matched[a.id] = true; st.up = []; paint(); }
            else { st.lock = true; paint(); setTimeout(function () { st.up = []; st.lock = false; paint(); }, 800); }
          } else { paint(); }
        }
        paint();
      },

      "game-sort": function (p) {
        var root = document.getElementById("sortRoot");
        var EN = L.state.lang === "en";
        var buckets = p.buckets || [];
        var items = shuffle(p.items || []);
        var st = { i: 0, score: 0, answered: false, picked: null };
        function bucketLabel(key) { var b = buckets.filter(function (x) { return x.key === key; })[0]; return b ? esc(t(b.label)) : esc(key); }
        function render() {
          if (st.i >= items.length) { result(); return; }
          var it = items[st.i];
          var bucketsHtml = buckets.map(function (b) {
            var cls = "sort-bucket";
            if (st.answered) { if (b.key === it.bucket) cls += " is-correct"; else if (b.key === st.picked) cls += " is-wrong"; }
            return '<button class="' + cls + '" type="button" data-key="' + esc(b.key) + '"' + (st.answered ? " disabled" : "") + ">" +
              '<span class="material-symbols-rounded">' + esc(b.icon || "category") + "</span><span>" + esc(t(b.label)) + "</span></button>";
          }).join("");
          var fb = "";
          if (st.answered) {
            var ok = st.picked === it.bucket;
            fb = '<div class="sort-fb ' + (ok ? "sort-fb--ok" : "sort-fb--no") + '"><span class="material-symbols-rounded">' + (ok ? "check_circle" : "cancel") + "</span>" +
              (ok ? (EN ? "Correct!" : "答對了！") : (EN ? "Belongs to " : "正解：") + bucketLabel(it.bucket)) + "</div>" +
              '<div class="quiz-nav"><button class="game-btn" type="button" data-next>' + (st.i === items.length - 1 ? (EN ? "See result" : "看結果") : (EN ? "Next" : "下一個")) + ' <span class="material-symbols-rounded">arrow_forward</span></button></div>';
          }
          root.innerHTML = '<div class="game-bar"><span class="game-stat">' + (EN ? "Item " : "第 ") + (st.i + 1) + "/" + items.length + "</span>" +
            '<span class="quiz-score">' + (EN ? "Score " : "得分 ") + st.score + "</span></div>" +
            '<div class="sort-card"><span class="material-symbols-rounded sort-card__icon">' + esc(it.icon || "label") + "</span>" +
            '<span class="sort-card__label">' + esc(t(it.label)) + "</span></div>" +
            '<p class="sort-q">' + (EN ? "Which group does it belong to?" : "它屬於哪一組？") + "</p>" +
            '<div class="sort-buckets">' + bucketsHtml + "</div>" + fb;
          if (!st.answered) {
            [].forEach.call(root.querySelectorAll(".sort-bucket"), function (b) {
              b.addEventListener("click", function () { st.answered = true; st.picked = b.dataset.key; if (b.dataset.key === it.bucket) st.score++; render(); });
            });
          } else { root.querySelector("[data-next]").addEventListener("click", function () { st.i++; st.answered = false; st.picked = null; render(); }); }
        }
        function result() {
          root.innerHTML = '<div class="game-result"><span class="material-symbols-rounded game-result__icon">sort</span><div class="game-result__big">' + st.score + "/" + items.length + "</div>" +
            "<p>" + (EN ? "Nice sorting!" : "分類完成！") + "</p>" +
            '<button class="game-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' + (EN ? "Play again" : "再玩一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () { items = shuffle(items); st = { i: 0, score: 0, answered: false, picked: null }; render(); });
        }
        render();
      },

      "game-pick": function (p) {
        var root = document.getElementById("pickRoot");
        var EN = L.state.lang === "en";
        var rounds = p.rounds || [];
        var TIME = 12;
        var st = { i: 0, score: 0, streak: 0, best: 0, lives: 3, answered: false, picked: -1 };
        var timer = null, tleft = 0;
        teardowns.push(function () { if (timer) clearInterval(timer); });
        function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
        function startTimer() {
          tleft = TIME * 10; stopTimer();
          timer = setInterval(function () {
            tleft--; var bar = document.getElementById("pickTimer");
            if (bar) bar.style.width = Math.max(0, tleft / (TIME * 10) * 100) + "%";
            if (tleft <= 0) { stopTimer(); if (!st.answered) { st.answered = true; st.picked = -1; st.lives--; st.streak = 0; render(); } }
          }, 100);
        }
        function hearts() { var s = ""; for (var k = 0; k < 3; k++) s += '<span class="material-symbols-rounded heart' + (k < st.lives ? "" : " heart--lost") + '">favorite</span>'; return s; }
        function render() {
          if (st.lives <= 0 || st.i >= rounds.length) { stopTimer(); result(); return; }
          var q = rounds[st.i];
          var opts = (q.options || []).map(function (o, idx) {
            var cls = "quiz-opt";
            if (st.answered) { if (idx === q.answer) cls += " quiz-opt--correct"; else if (idx === st.picked) cls += " quiz-opt--wrong"; }
            return '<button class="' + cls + '" type="button" data-opt="' + idx + '"' + (st.answered ? " disabled" : "") + ">" +
              '<span class="quiz-opt__mark">' + String.fromCharCode(65 + idx) + "</span><span>" + esc(t(o)) + "</span></button>";
          }).join("");
          var why = st.answered ? '<div class="quiz-explain"><b>' + (st.picked === q.answer ? (EN ? "Correct! " : "答對了！") : (EN ? "Nope. " : "可惜。")) + "</b>" + esc(t(q.why)) + "</div>" : "";
          var nextBtn = st.answered ? '<div class="quiz-nav"><button class="game-btn" type="button" data-next>' + (st.i === rounds.length - 1 || st.lives <= 0 ? (EN ? "Finish" : "結束") : (EN ? "Next" : "下一題")) + ' <span class="material-symbols-rounded">arrow_forward</span></button></div>' : "";
          root.innerHTML = '<div class="game-bar"><span class="hearts">' + hearts() + "</span>" +
            '<span class="game-stat">' + (EN ? "Streak " : "連勝 ") + st.streak + " · " + (EN ? "Q " : "第 ") + (st.i + 1) + "/" + rounds.length + "</span>" +
            '<span class="quiz-score">' + st.score + "</span></div>" +
            '<div class="timer-track"><span class="timer-fill" id="pickTimer" style="width:100%"></span></div>' +
            '<div class="quiz-card"><p class="quiz-q">' + esc(t(q.scenario)) + '</p><div class="quiz-opts">' + opts + "</div>" + why + nextBtn + "</div>";
          if (!st.answered) {
            [].forEach.call(root.querySelectorAll("[data-opt]"), function (b) { b.addEventListener("click", function () { answer(parseInt(b.dataset.opt, 10)); }); });
            startTimer();
          } else { var nb = root.querySelector("[data-next]"); if (nb) nb.addEventListener("click", function () { st.i++; st.answered = false; st.picked = -1; render(); }); }
        }
        function answer(idx) {
          if (st.answered) return; stopTimer();
          st.answered = true; st.picked = idx;
          if (idx === rounds[st.i].answer) { st.score++; st.streak++; if (st.streak > st.best) st.best = st.streak; } else { st.lives--; st.streak = 0; }
          render();
        }
        function result() {
          var win = st.lives > 0;
          root.innerHTML = '<div class="game-result"><span class="material-symbols-rounded game-result__icon">' + (win ? "emoji_events" : "sentiment_dissatisfied") + "</span>" +
            '<div class="game-result__big">' + st.score + "/" + rounds.length + "</div>" +
            "<p>" + (win ? (EN ? "You survived! Best streak " + st.best : "你撐過去了！最佳連勝 " + st.best) : (EN ? "Out of lives. Best streak " + st.best : "生命用完了。最佳連勝 " + st.best)) + "</p>" +
            '<button class="game-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' + (EN ? "Play again" : "再玩一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () { st = { i: 0, score: 0, streak: 0, best: 0, lives: 3, answered: false, picked: -1 }; render(); });
        }
        render();
      },

      "game-order": function (p) {
        var root = document.getElementById("orderRoot");
        var EN = L.state.lang === "en";
        var puzzles = p.puzzles || [];
        var st = { p: 0, order: [], checked: false, solved: false };
        function load() {
          var steps = puzzles[st.p].steps || [];
          var idx = steps.map(function (_, i) { return i; });
          do { st.order = shuffle(idx); } while (steps.length > 1 && st.order.every(function (v, i) { return v === i; }));
          st.checked = false; st.solved = false; render();
        }
        function render() {
          var pz = puzzles[st.p]; var steps = pz.steps || [];
          var list = st.order.map(function (orig, pos) {
            var sc = st.checked ? (orig === pos ? " is-right" : " is-wrong") : "";
            return '<li class="order-step' + sc + '"><span class="order-num">' + (pos + 1) + "</span>" +
              '<span class="order-text">' + esc(t(steps[orig])) + "</span><span class=\"order-moves\">" +
              '<button class="order-mv" type="button" data-mv="up" data-pos="' + pos + '"' + (pos === 0 ? " disabled" : "") + ' aria-label="move up"><span class="material-symbols-rounded">arrow_upward</span></button>' +
              '<button class="order-mv" type="button" data-mv="down" data-pos="' + pos + '"' + (pos === st.order.length - 1 ? " disabled" : "") + ' aria-label="move down"><span class="material-symbols-rounded">arrow_downward</span></button></span></li>';
          }).join("");
          var foot;
          if (st.solved) {
            foot = '<div class="game-win"><span class="material-symbols-rounded">check_circle</span>' + (EN ? "Correct order!" : "順序正確！") + "</div>" +
              (st.p < puzzles.length - 1
                ? '<button class="game-btn" type="button" data-next>' + (EN ? "Next puzzle" : "下一題") + ' <span class="material-symbols-rounded">arrow_forward</span></button>'
                : '<button class="game-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' + (EN ? "Play again" : "再玩一次") + "</button>");
          } else {
            foot = (st.checked ? '<p class="order-hint">' + (EN ? "Not yet — green rows are in the right spot." : "還沒——綠色那幾列位置正確。") + "</p>" : "") +
              '<button class="game-btn" type="button" data-check><span class="material-symbols-rounded">fact_check</span>' + (EN ? "Check order" : "檢查順序") + "</button>";
          }
          root.innerHTML = '<div class="game-bar"><span class="game-stat">' + (EN ? "Puzzle " : "第 ") + (st.p + 1) + "/" + puzzles.length + "</span></div>" +
            '<p class="order-prompt">' + esc(t(pz.prompt)) + "</p><ol class=\"order-list\">" + list + "</ol><div class=\"order-foot\">" + foot + "</div>";
          [].forEach.call(root.querySelectorAll(".order-mv:not([disabled])"), function (b) { b.addEventListener("click", function () { move(parseInt(b.dataset.pos, 10), b.dataset.mv === "up" ? -1 : 1); }); });
          var cb = root.querySelector("[data-check]"); if (cb) cb.addEventListener("click", check);
          var nb = root.querySelector("[data-next]"); if (nb) nb.addEventListener("click", function () { st.p++; load(); });
          var rb = root.querySelector("[data-restart]"); if (rb) rb.addEventListener("click", function () { st.p = 0; load(); });
        }
        function move(pos, dir) { var j = pos + dir; if (j < 0 || j >= st.order.length) return; var tmp = st.order[pos]; st.order[pos] = st.order[j]; st.order[j] = tmp; st.checked = false; render(); }
        function check() { st.checked = true; st.solved = st.order.every(function (v, i) { return v === i; }); render(); }
        load();
      },

      "game-truefalse": function (p) {
        var root = document.getElementById("tfRoot");
        var EN = L.state.lang === "en";
        var qs = p.statements || [];
        var TIME = 8;
        var st = { i: 0, score: 0, streak: 0, best: 0, lives: 3, answered: false, picked: null };
        var timer = null, tleft = 0;
        teardowns.push(function () { if (timer) clearInterval(timer); });
        function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
        function startTimer() {
          tleft = TIME * 10; stopTimer();
          timer = setInterval(function () {
            tleft--; var bar = document.getElementById("tfTimer");
            if (bar) bar.style.width = Math.max(0, tleft / (TIME * 10) * 100) + "%";
            if (tleft <= 0) { stopTimer(); if (!st.answered) answer(null); }
          }, 100);
        }
        function hearts() { var s = ""; for (var k = 0; k < 3; k++) s += '<span class="material-symbols-rounded heart' + (k < st.lives ? "" : " heart--lost") + '">favorite</span>'; return s; }
        function render() {
          if (st.lives <= 0 || st.i >= qs.length) { stopTimer(); result(); return; }
          var q = qs[st.i];
          function tfBtn(val, label, icon) {
            var cls = "tf-btn tf-btn--" + (val ? "true" : "false");
            if (st.answered) { if (val === q.answer) cls += " is-correct"; else if (val === st.picked) cls += " is-wrong"; }
            return '<button class="' + cls + '" type="button" data-val="' + val + '"' + (st.answered ? " disabled" : "") + '><span class="material-symbols-rounded">' + icon + "</span>" + label + "</button>";
          }
          var why = st.answered ? '<div class="quiz-explain"><b>' + (st.picked === q.answer ? (EN ? "Correct! " : "答對了！") : (EN ? "Actually " : "其實是") + (q.answer ? (EN ? "true. " : "真。") : (EN ? "false. " : "假。"))) + "</b>" + esc(t(q.explain)) + "</div>" : "";
          var nextBtn = st.answered ? '<div class="quiz-nav"><button class="game-btn" type="button" data-next>' + (st.i === qs.length - 1 || st.lives <= 0 ? (EN ? "Finish" : "結束") : (EN ? "Next" : "下一題")) + ' <span class="material-symbols-rounded">arrow_forward</span></button></div>' : "";
          root.innerHTML = '<div class="game-bar"><span class="hearts">' + hearts() + "</span>" +
            '<span class="game-stat">' + (EN ? "Streak " : "連勝 ") + st.streak + " · " + (st.i + 1) + "/" + qs.length + "</span>" +
            '<span class="quiz-score">' + st.score + "</span></div>" +
            '<div class="timer-track"><span class="timer-fill" id="tfTimer" style="width:100%"></span></div>' +
            '<div class="quiz-card"><p class="quiz-q tf-statement">' + esc(t(q.text)) + '</p><div class="tf-btns">' + tfBtn(true, (EN ? "True" : "真"), "check") + tfBtn(false, (EN ? "False" : "假"), "close") + "</div>" + why + nextBtn + "</div>";
          if (!st.answered) {
            [].forEach.call(root.querySelectorAll(".tf-btn"), function (b) { b.addEventListener("click", function () { answer(b.dataset.val === "true"); }); });
            startTimer();
          } else { var nb = root.querySelector("[data-next]"); if (nb) nb.addEventListener("click", function () { st.i++; st.answered = false; st.picked = null; render(); }); }
        }
        function answer(val) {
          if (st.answered) return; stopTimer();
          st.answered = true; st.picked = val;
          if (val === qs[st.i].answer) { st.score++; st.streak++; if (st.streak > st.best) st.best = st.streak; } else { st.lives--; st.streak = 0; }
          render();
        }
        function result() {
          var win = st.lives > 0;
          root.innerHTML = '<div class="game-result"><span class="material-symbols-rounded game-result__icon">' + (win ? "emoji_events" : "sentiment_dissatisfied") + "</span>" +
            '<div class="game-result__big">' + st.score + "/" + qs.length + "</div><p>" + (EN ? "Best streak " + st.best : "最佳連勝 " + st.best) + "</p>" +
            '<button class="game-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' + (EN ? "Play again" : "再玩一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () { st = { i: 0, score: 0, streak: 0, best: 0, lives: 3, answered: false, picked: null }; render(); });
        }
        render();
      },

      "game-build": function (p) {
        var root = document.getElementById("buildRoot");
        var EN = L.state.lang === "en";
        var rounds = p.rounds || [];
        var st = { r: 0, sel: {}, checked: false, score: 0 };
        function render() {
          if (st.r >= rounds.length) { result(); return; }
          var rd = rounds[st.r];
          var ans = {}; (rd.answer || []).forEach(function (i) { ans[i] = true; });
          var perfect = (rd.palette || []).every(function (_, i) { return !!ans[i] === !!st.sel[i]; });
          var chips = (rd.palette || []).map(function (it, i) {
            var cls = "build-chip" + (st.sel[i] ? " is-sel" : "");
            if (st.checked) { if (ans[i] && st.sel[i]) cls += " is-right"; else if (ans[i] && !st.sel[i]) cls += " is-missing"; else if (!ans[i] && st.sel[i]) cls += " is-extra"; }
            return '<button class="' + cls + '" type="button" data-i="' + i + '"' + (st.checked ? " disabled" : "") + '><span class="material-symbols-rounded">' + esc(it.icon || "widgets") + "</span><span>" + esc(t(it.label)) + "</span>" +
              '<span class="material-symbols-rounded build-chip__tick">' + (st.sel[i] ? "check_circle" : "radio_button_unchecked") + "</span></button>";
          }).join("");
          var foot;
          if (st.checked) {
            foot = '<div class="build-fb ' + (perfect ? "build-fb--ok" : "build-fb--no") + '"><span class="material-symbols-rounded">' + (perfect ? "verified" : "info") + "</span>" +
              (perfect ? (EN ? "Perfect stack! " : "完美組合！") : (EN ? "Close — green=right, dashed=missing, red=not needed. " : "接近了——綠＝對、虛線＝漏掉、紅＝不需要。")) + esc(t(rd.note)) + "</div>" +
              '<div class="quiz-nav"><button class="game-btn" type="button" data-next>' + (st.r === rounds.length - 1 ? (EN ? "See result" : "看結果") : (EN ? "Next build" : "下一題")) + ' <span class="material-symbols-rounded">arrow_forward</span></button></div>';
          } else {
            foot = '<button class="game-btn" type="button" data-check><span class="material-symbols-rounded">fact_check</span>' + (EN ? "Check my stack" : "檢查我的組合") + "</button>";
          }
          root.innerHTML = '<div class="game-bar"><span class="game-stat">' + (EN ? "Build " : "第 ") + (st.r + 1) + "/" + rounds.length + "</span>" +
            '<span class="quiz-score">' + (EN ? "Score " : "得分 ") + st.score + "</span></div>" +
            '<div class="build-goal"><span class="material-symbols-rounded">flag</span>' + esc(t(rd.goal)) + "</div>" +
            '<p class="build-hint">' + (EN ? "Pick exactly the products you need:" : "挑出剛好需要的產品：") + '</p><div class="build-palette">' + chips + "</div><div class=\"build-foot\">" + foot + "</div>";
          if (!st.checked) {
            [].forEach.call(root.querySelectorAll(".build-chip"), function (b) { b.addEventListener("click", function () { var i = b.dataset.i; st.sel[i] = !st.sel[i]; render(); }); });
            root.querySelector("[data-check]").addEventListener("click", function () { st.checked = true; if (perfect) st.score++; render(); });
          } else { root.querySelector("[data-next]").addEventListener("click", function () { st.r++; st.sel = {}; st.checked = false; render(); }); }
        }
        function result() {
          root.innerHTML = '<div class="game-result"><span class="material-symbols-rounded game-result__icon">architecture</span>' +
            '<div class="game-result__big">' + st.score + "/" + rounds.length + "</div><p>" + (EN ? "Stacks built!" : "架構組裝完成！") + "</p>" +
            '<button class="game-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' + (EN ? "Play again" : "再玩一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () { st = { r: 0, sel: {}, checked: false, score: 0 }; render(); });
        }
        render();
      }
    };

    /* =====================================================================
       shared builders + helpers for the learning layouts
       ===================================================================== */
    function shuffle(a) {
      var arr = a.slice();
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t2 = arr[i]; arr[i] = arr[j]; arr[j] = t2; }
      return arr;
    }
    /* =====================================================================
       TRANSIT MAP PIECES
       Each product family is a "line" with its own colour (set in CSS by
       [data-line]); each product is a "stop" on it. The letters are only
       map vernacular — the colours carry the meaning.
       ===================================================================== */
    var LINES = { compute: "C", ai: "A", storage: "D", media: "M", security: "S",
                  performance: "P", integrations: "I", arcade: "G" };

    /* home map geometry (viewBox 1180 × 620, hub in the middle). Octilinear
       polylines that start at the hub's edge; `side` says which way labels
       hang (-1 left, 1 right); `alt` alternates labels above/below. */
    var MAP_W = 1180, MAP_H = 620;
    var MAP_PATHS = {
      ai:          { pts: [[545, 278], [545, 200], [375, 30], [150, 30]],  side: -1 },
      performance: { pts: [[635, 278], [635, 200], [805, 30], [1030, 30]], side: 1 },
      security:    { pts: [[480, 310], [150, 310]], side: -1, alt: true },
      compute:     { pts: [[700, 310], [1030, 310]], side: 1, alt: true },
      media:       { pts: [[545, 342], [545, 420], [375, 590], [260, 590]], side: -1 },
      storage:     { pts: [[635, 342], [635, 420], [805, 590], [1030, 590]], side: 1 }
    };

    function pageBySlug(slug) {
      for (var i = 0; i < L.pages.length; i++) if (L.pages[i].slug === slug) return L.pages[i];
      return null;
    }
    function categoryByKey(key) {
      return (window.SITE_CATEGORIES || []).filter(function (c) { return c.key === key; })[0] || null;
    }
    function productsOf(key) {
      return L.pages.filter(function (q) { return q.nav === false && q.layout !== "category" && q.category === key; });
    }
    function groupBy(list) {
      var order = [], buckets = {};
      list.forEach(function (q) {
        var key = q.group ? t(q.group) : (L.state.lang === "en" ? "More" : "其他");
        if (!buckets[key]) { buckets[key] = []; order.push(key); }
        buckets[key].push(q);
      });
      return order.map(function (k) { return { name: k, items: buckets[k] }; });
    }
    function lineKeyOf(p) {
      var k = p.layout === "category" ? p.key : p.category;
      return LINES[k] ? k : null;
    }
    /* short family name for tight spots: "運算 Compute" → "運算", "Storage & Databases" → "Storage" */
    function shortName(c) {
      var s = t(c.title);
      if (L.state.lang === "zh") return s.replace(/\s+[A-Za-z&][A-Za-z &]*$/, "") || s;
      return s.split(" & ")[0];
    }
    /* "Cloudflare 開發者入門指南" breaks after the brand name, never mid-phrase */
    function heroTitle(s) {
      var i = s.indexOf(" ");
      return i < 0 ? esc(s) : '<span class="hero__l1">' + esc(s.slice(0, i)) + '</span> <span class="hero__l2">' + esc(s.slice(i + 1)) + "</span>";
    }
    /* map labels stay short: "Cloudflare Images" → "Images", "WAF 網站應用程式防火牆" → "WAF" */
    function stationName(q) {
      var s = t(q.title).replace(/^Cloudflare\s+/, "");
      var m = s.match(/^([A-Za-z0-9\/&.\- ]+?)\s+[\u3400-\u9fff]/);
      return m ? m[1] : s;
    }
    function bullet(key) {
      return '<span class="bullet" data-line="' + esc(key) + '" aria-hidden="true">' + esc(LINES[key] || "") + "</span>";
    }
    /* a stop list is either page objects or {href, label, note} */
    function stopInfo(s) {
      return s.slug ? { href: L.pageHref(s), label: t(s.title), slug: s.slug } : s;
    }
    function routeStrip(stops, hereSlug) {
      if (!stops || !stops.length) return "";
      var EN = L.state.lang === "en";
      /* "架構藍圖：部落格 / CMS", "架構藍圖：線上商店" … drop the prefix every stop shares */
      var infos = stops.map(stopInfo);
      var pre = (infos[0].label.match(/^[^：:]+[：:]\s*/) || [""])[0];
      if (!pre || infos.length < 2 || infos.some(function (o) { return o.label.indexOf(pre) !== 0; })) pre = "";
      var items = infos.map(function (o) {
        if (pre) o = { href: o.href, slug: o.slug, note: o.note, label: o.label.slice(pre.length) };
        var here = hereSlug && o.slug === hereSlug;
        var inner = '<span class="route__dot" aria-hidden="true"></span>' +
          '<span class="route__label">' + esc(o.label) + "</span>" +
          (o.note ? '<span class="route__note">' + esc(o.note) + "</span>" : "") +
          (here ? '<span class="route__here">' + (EN ? "You are here" : "你在這一站") + "</span>" : "");
        return '<li class="route__stop' + (here ? " is-here" : "") + '">' +
          (here ? '<span aria-current="page">' + inner + "</span>" : '<a href="' + esc(o.href) + '">' + inner + "</a>") + "</li>";
      }).join("");
      return '<div class="route"><ol class="route__list" style="--n:' + stops.length + '">' + items + "</ol></div>";
    }
    function specSheet(stats, title) {
      if (!stats || !stats.length) return "";
      return '<aside class="spec"><p class="spec__title">' + esc(title) + "</p><dl>" +
        stats.map(function (s) {
          return '<div class="spec__row"><dt>' + esc(t(s.label)) + "</dt><dd>" + esc(String(s.value)) + "</dd></div>";
        }).join("") + "</dl></aside>";
    }
    function siblingsOf(p) {
      var key = lineKeyOf(p);
      if (!key) return [];
      var all = productsOf(key);
      if (!p.group) return all;
      var g = t(p.group);
      var same = all.filter(function (q) { return t(q.group) === g; });
      return same.length >= 3 ? same : all;     /* a one- or two-stop group reads better as the whole line */
    }

    /* page header: line strip (where you are on the line) + title + spec sheet */
    function pageHeader(p, opts) {
      opts = opts || {};
      var EN = L.state.lang === "en";
      var key = lineKeyOf(p);
      var cat = key ? categoryByKey(key) : null;
      var tagline = p.hero && t(p.hero.tagline) ? t(p.hero.tagline) : t(p.subtitle);
      var strip = opts.strip != null ? opts.strip : (key ? routeStrip(siblingsOf(p), p.slug) : "");
      var tag = "";
      if (key && p.layout === "category") {
        tag = '<span class="phead__line">' + bullet(key) + "<span>" + (EN ? "Line " + LINES[key] : LINES[key] + " 線") + "</span></span>";
      } else if (cat) {
        tag = '<a class="phead__line" href="' + esc(key) + '.html">' + bullet(key) + "<span>" + esc(t(cat.title)) + "</span>" +
          (p.group ? '<span class="phead__group">' + esc(t(p.group)) + "</span>" : "") + "</a>";
      }
      return '<header class="phead' + (key ? " phead--line" : "") + '">' +
        (tag || strip ? '<div class="phead__strip">' + tag + strip + "</div>" : "") +
        '<div class="phead__main' + (p.stats && p.stats.length ? " has-spec" : "") + '">' +
          '<div class="phead__text">' +
            (key ? "" : '<span class="material-symbols-rounded phead__icon" aria-hidden="true">' + esc(p.icon || "label") + "</span>") +
            '<h1 class="phead__title">' + esc(t(p.title)) + "</h1>" +
            (tagline ? '<p class="phead__tagline">' + esc(tagline) + "</p>" : "") +
          "</div>" +
          specSheet(p.stats, EN ? "Spec sheet" : "規格表") +
        "</div>" +
      "</header>";
    }
    var lheroHTML = pageHeader;

    /* ---- the home map: six lines out of one hub ---- */
    function along(pts, d) {
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var len = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
        if (d <= len || i === pts.length - 2) {
          var k = Math.min(1, d / len);
          return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k,
                   dx: Math.sign(b[0] - a[0]), dy: Math.sign(b[1] - a[1]) };
        }
        d -= len;
      }
      return null;
    }
    function pathLength(pts) {
      var n = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        n += Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2));
      }
      return n;
    }
    function metroMap(families) {
      var EN = L.state.lang === "en";
      var lines = families.map(function (c, li) {
        var geo = MAP_PATHS[c.key];
        var pts = geo.pts, total = pathLength(pts);
        var d = "M" + pts.map(function (q) { return q[0] + " " + q[1]; }).join(" L");
        var stops = productsOf(c.key);
        var first = 46, last = total - 64;
        var step = stops.length > 1 ? (last - first) / (stops.length - 1) : 0;
        var stopSvg = stops.map(function (q, i) {
          var pt = along(pts, first + step * i);
          var lx, ly, anchor;
          if (pt.dy === 0) {                       /* horizontal run */
            var below = geo.alt ? i % 2 === 1 : pt.y < MAP_H / 2;
            lx = pt.x; anchor = "middle"; ly = below ? pt.y + 29 : pt.y - 18;
          } else {                                 /* vertical or diagonal */
            anchor = geo.side < 0 ? "end" : "start";
            lx = pt.x + geo.side * 17;
            ly = pt.dx === 0 ? pt.y + 5 : (pt.dy < 0 ? pt.y + 13 : pt.y - 6);
          }
          return '<a class="mstop" href="' + esc(L.pageHref(q)) + '">' +
            '<circle cx="' + r(pt.x) + '" cy="' + r(pt.y) + '" r="7.5" />' +
            '<text x="' + r(lx) + '" y="' + r(ly) + '" text-anchor="' + anchor + '">' + esc(stationName(q)) + "</text></a>";
        }).join("");
        var end = pts[pts.length - 1];
        var tx = end[0] + geo.side * 30;
        var term = '<a class="mterm" href="' + esc(c.key) + '.html">' +
          '<circle cx="' + end[0] + '" cy="' + end[1] + '" r="19" />' +
          '<text class="mterm__code" x="' + end[0] + '" y="' + (end[1] + 7) + '" text-anchor="middle">' + esc(LINES[c.key]) + "</text>" +
          '<text class="mterm__name" x="' + tx + '" y="' + (end[1] + 6) + '" text-anchor="' + (geo.side < 0 ? "end" : "start") + '">' +
            esc(shortName(c)) + "</text></a>";
        return '<g class="mline" data-line="' + esc(c.key) + '" style="--i:' + li + '">' +
          '<path class="mline__path" d="' + d + '" pathLength="1" />' + stopSvg + term + "</g>";
      }).join("");
      var hub = '<g class="mhub">' +
        '<rect x="480" y="278" width="220" height="64" rx="32" />' +
        '<text class="mhub__t" x="590" y="306" text-anchor="middle">' + (EN ? "Cloudflare network" : "Cloudflare 全球網路") + "</text>" +
        '<text class="mhub__s" x="590" y="327" text-anchor="middle">' + (EN ? "330+ cities, one platform" : "330+ 城市，同一個平台") + "</text></g>";
      return '<svg class="metro__svg" viewBox="0 0 ' + MAP_W + " " + MAP_H + '" role="group" aria-label="' +
        (EN ? "Map of Cloudflare's six product families as metro lines" : "Cloudflare 六大產品家族路線圖") + '">' +
        lines + hub + "</svg>";
    }
    /* narrow screens scroll the map sideways: start with the hub in view */
    function centerMetro() {
      var el = document.getElementById("metro");
      if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    }
    /* keep "you are here" visible inside a sideways-scrolling route strip */
    function centerStrip() {
      [].forEach.call(pageEl.querySelectorAll(".route"), function (route) {
        var here = route.querySelector(".is-here");
        if (!here || route.scrollWidth <= route.clientWidth) return;
        route.scrollLeft = here.offsetLeft - route.clientWidth / 2 + here.offsetWidth / 2;
      });
    }

    function codeHTML(c) {
      var lang = c.lang || "code";
      var name = t(c.title) ? '<span class="codeblock__name">' + esc(t(c.title)) + "</span>" : "";
      var copyLabel = L.state.lang === "en" ? "Copy" : "複製";
      return '<div class="codeblock">' +
        '<div class="codeblock__bar">' +
          '<span class="codeblock__lang">' + esc(lang) + "</span>" + name +
          '<button class="copy-btn" type="button" data-copy><span class="material-symbols-rounded">content_copy</span>' + esc(copyLabel) + "</button>" +
        "</div>" +
        "<pre><code>" + esc(c.body || "") + "</code></pre></div>";
    }

    function renderBlocks(blocks) {
      return (blocks || []).map(function (b) {
        if (b.type === "lead")  return '<p class="lead">' + esc(t(b.text)) + "</p>";
        if (b.type === "p")     return "<p>" + esc(t(b.text)) + "</p>";
        if (b.type === "h3")    return "<h3>" + esc(t(b.text)) + "</h3>";
        if (b.type === "quote") return "<blockquote>" + esc(t(b.text)) + "</blockquote>";
        if (b.type === "ul") {
          var arr = (b.items && (b.items[L.state.lang] || b.items.en || b.items.zh)) || [];
          return "<ul>" + arr.map(function (li) { return "<li>" + esc(li) + "</li>"; }).join("") + "</ul>";
        }
        if (b.type === "callout") {
          var v = b.variant || "note";
          var ic = b.icon || (v === "tip" ? "tips_and_updates" : v === "warn" ? "warning" : v === "analogy" ? "lightbulb" : "info");
          var title = t(b.title) ? '<p class="callout__title">' + esc(t(b.title)) + "</p>" : "";
          return '<div class="callout callout--' + esc(v) + '"><span class="callout__icon"><span class="material-symbols-rounded">' +
            esc(ic) + "</span></span>" +
            '<div class="callout__body">' + title + '<p class="callout__text">' + esc(t(b.text)) + "</p></div></div>";
        }
        if (b.type === "cards") {
          var cs = (b.items || []).map(function (c) {
            return '<div class="icard"><span class="icard__icon"><span class="material-symbols-rounded">' + esc(c.icon || "label") + "</span></span>" +
              '<p class="icard__t">' + esc(t(c.title)) + "</p>" +
              (t(c.text) ? '<p class="icard__d">' + esc(t(c.text)) + "</p>" : "") + "</div>";
          }).join("");
          return '<div class="icards">' + cs + "</div>";
        }
        if (b.type === "steps") {
          var ss = (b.items || []).map(function (s) {
            return '<li class="step"><p class="step__t">' + esc(t(s.title)) + "</p>" +
              (t(s.text) ? '<p class="step__d">' + esc(t(s.text)) + "</p>" : "") +
              (s.code ? codeHTML(s.code) : "") + "</li>";
          }).join("");
          return '<ol class="steps">' + ss + "</ol>";
        }
        if (b.type === "code") return codeHTML(b);
        if (b.type === "mermaid") {
          var src = t(b.code);
          var dtitle = t(b.title)
            ? '<figcaption class="diagram__title"><span class="material-symbols-rounded">schema</span>' + esc(t(b.title)) + "</figcaption>" : "";
          return '<figure class="diagram" data-item>' + dtitle +
            '<div class="mermaid-block" data-mermaid="' + esc(src) + '"></div></figure>';
        }
        return "";
      }).join("");
    }

    function lessonFoot(p) {
      var EN = L.state.lang === "en";
      var rel = (p.related || []).map(function (rr) {
        return '<a href="' + esc(rr.slug) + '.html">' + esc(t(rr.label)) + "</a>";
      }).join("");
      var docs = p.docs ? '<a class="docs-btn" href="' + esc(p.docs) + '" target="_blank" rel="noopener">' +
        '<span class="material-symbols-rounded">menu_book</span>' + (EN ? "Official docs" : "官方文件") +
        '<span class="material-symbols-rounded">open_in_new</span></a>' : "";
      /* previous / next stop along the whole line */
      var key = lineKeyOf(p), hop = "";
      if (key) {
        var line = productsOf(key), i = -1;
        for (var k = 0; k < line.length; k++) if (line[k].slug === p.slug) i = k;
        var prev = i > 0 ? line[i - 1] : null, next = i >= 0 && i < line.length - 1 ? line[i + 1] : null;
        if (prev || next) {
          hop = '<nav class="hop" data-line="' + esc(key) + '" aria-label="' + (EN ? "Along this line" : "沿著這條線") + '">' +
            (prev ? '<a class="hop__prev" href="' + esc(L.pageHref(prev)) + '"><span class="hop__dir">' +
              '<span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>' + (EN ? "Previous stop" : "上一站") +
              '</span><span class="hop__name">' + esc(t(prev.title)) + "</span></a>" : "<span></span>") +
            (next ? '<a class="hop__next" href="' + esc(L.pageHref(next)) + '"><span class="hop__dir">' + (EN ? "Next stop" : "下一站") +
              '<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></span>' +
              '<span class="hop__name">' + esc(t(next.title)) + "</span></a>" : "") +
          "</nav>";
        }
      }
      if (!rel && !docs && !hop) return "";
      return '<div class="lesson-foot">' + hop +
        (rel ? '<div class="related"><p class="related__label">' + (EN ? "Related products" : "相關產品") + "</p>" + rel + "</div>" : "") +
        docs + "</div>";
    }

    function wireCopy() {
      [].forEach.call(pageEl.querySelectorAll("[data-copy]"), function (btn) {
        btn.addEventListener("click", function () {
          var block = btn.closest(".codeblock");
          var codeEl = block ? block.querySelector("code") : null;
          var text = codeEl ? codeEl.textContent : "";
          var icon = btn.querySelector(".material-symbols-rounded");
          function done() { if (icon) { icon.textContent = "check"; setTimeout(function () { icon.textContent = "content_copy"; }, 1500); } }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () {});
          } else {
            try { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(); } catch (e) {}
          }
        });
      });
    }

    function lessonScrollspy() {
      var prog = document.getElementById("readingProgress");
      var links = [].slice.call(pageEl.querySelectorAll(".lesson-toc a[data-toc]"));
      var secs = [].slice.call(pageEl.querySelectorAll(".lsec"));
      if (prog) {
        var onScroll = function () {
          var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
          prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        teardowns.push(function () { window.removeEventListener("scroll", onScroll); });
      }
      if ("IntersectionObserver" in window && links.length) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            links.forEach(function (a) { a.classList.toggle("is-active", a.dataset.toc === en.target.id); });
          });
        }, { rootMargin: "-25% 0px -65% 0px" });
        secs.forEach(function (s) { io.observe(s); });
        teardowns.push(function () { io.disconnect(); });
      }
    }

    /* ---- mermaid diagrams: lazy-load from CDN, theme-aware, fail-soft ---- */
    var mermaidSeq = 0;
    function ensureMermaid(cb) {
      if (window.mermaid) { cb(); return; }
      if (window.__ldwMermaidPending) { window.__ldwMermaidPending.push(cb); return; }
      window.__ldwMermaidPending = [cb];
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      s.async = true;
      s.onload = function () {
        var q = window.__ldwMermaidPending || []; window.__ldwMermaidPending = null;
        q.forEach(function (f) { try { f(); } catch (e) {} });
      };
      s.onerror = function () { window.__ldwMermaidPending = null; };
      document.head.appendChild(s);
    }
    function renderMermaid() {
      var blocks = [].slice.call(pageEl.querySelectorAll(".mermaid-block[data-mermaid]"));
      if (!blocks.length) return;
      ensureMermaid(function () {
        if (!window.mermaid) return;
        var dark = document.documentElement.getAttribute("data-theme") === "dark";
        try {
          window.mermaid.initialize({
            startOnLoad: false, securityLevel: "strict", logLevel: "fatal",
            theme: dark ? "dark" : "default",
            themeVariables: {
              fontFamily: '"Archivo","Noto Sans TC",sans-serif',
              primaryColor: dark ? "#1E2128" : "#FFFFFF",
              primaryBorderColor: dark ? "#C9CCD3" : "#16181D",
              primaryTextColor: dark ? "#ECEDEF" : "#16181D",
              secondaryColor: dark ? "#262A33" : "#F3F4F6",
              tertiaryColor: dark ? "#171A20" : "#FAFAFB",
              lineColor: dark ? "#8A90A0" : "#4A4F5C"
            }
          });
        } catch (e) {}
        blocks.forEach(function (el) {
          var src = el.getAttribute("data-mermaid");
          if (!src) return;
          var gid = "mmd-" + (mermaidSeq++);
          var done = function (svg) { el.innerHTML = svg; };
          var fail = function () { el.innerHTML = '<pre class="diagram-fallback">' + esc(src) + "</pre>"; };
          var go = function () {
            try {
              var out = window.mermaid.render(gid, src);
              if (out && typeof out.then === "function") out.then(function (r) { done(r.svg); }, fail);
              else if (out && out.svg) done(out.svg);
              else fail();
            } catch (e) { fail(); }
          };
          try {
            var pv = window.mermaid.parse(src, { suppressErrors: true });
            if (pv && typeof pv.then === "function") pv.then(function (ok) { ok === false ? fail() : go(); }, fail);
            else if (pv === false) fail();
            else go();
          } catch (e) { fail(); }
        });
      });
    }

    /* ---- hero count-up (shared by hub) ---- */
    function animateCounters() {
      var els = [].slice.call(pageEl.querySelectorAll(".hero__stat-value[data-count]"));
      if (!els.length) return;
      function run(el) {
        var target = parseFloat(el.dataset.count) || 0, dur = 1000, start = null;
        function step(ts) {
          if (start === null) start = ts;
          var pr = Math.min(1, (ts - start) / dur), eased = 1 - Math.pow(1 - pr, 3);
          el.textContent = String(Math.round(target * eased));
          if (pr < 1) requestAnimationFrame(step); else el.textContent = String(target);
        }
        requestAnimationFrame(step);
      }
      if (!("IntersectionObserver" in window)) { els.forEach(run); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.4 });
      els.forEach(function (el) { io.observe(el); });
      teardowns.push(function () { io.disconnect(); });
    }

    /* =====================================================================
       RENDER the current page
       ===================================================================== */
    function render() {
      teardowns.forEach(function (fn) { try { fn(); } catch (e) {} });
      teardowns = [];
      var p = L.currentPage();
      if (!p) { pageEl.innerHTML = '<p class="empty">No page data.</p>'; return; }
      var fn = RENDERERS[p.layout] || RENDERERS.gallery;
      var key = lineKeyOf(p);
      pageEl.className = "page page--" + p.layout;
      /* the wrapper sits INSIDE <main>, so the prerendered static copy keeps
         its layout class and line colour even without JS */
      pageEl.innerHTML = '<div class="pg pg--' + esc(p.layout) + '"' + (key ? ' data-line="' + key + '"' : "") + ">" + fn(p) + "</div>";
      var w = WIRE[p.layout];
      if (w) w(p);
      centerStrip();
    }

    if (typeof L.onTheme === "function") L.onTheme(function () { renderMermaid(); });
    render();
  }

  boot();
})();
