/* =========================================================================
   multipage · app.js   (vanilla, no build, no chart lib)

   The PAGE-LEVEL LAYOUT ENGINE. shell.js has already injected the shared
   chrome and published window.LDW. This script:

     1. reads the current page from <body data-page="..."> (via LDW),
     2. picks a renderer from RENDERERS by that page's `layout`,
     3. paints it into <main id="page"> and wires its interactions,
     4. registers an onLang() callback so a language switch repaints the body.

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

      /* ---- home: big hero + category cards + learning tools ---- */
      home: function (p) {
        var cats = window.SITE_CATEGORIES || [];
        var products = L.pages.filter(function (q) { return q.layout === "lesson" && q.category && q.category !== "start"; });
        var catCards = cats.map(function (c) {
          var prods = products.filter(function (q) { return q.category === c.key; });
          var MAXCHIPS = 6;
          var chips = prods.slice(0, MAXCHIPS).map(function (q) {
            return '<a class="prodchip" href="' + esc(q.slug) + '.html">' + esc(t(q.title)) + "</a>";
          }).join("");
          if (prods.length > MAXCHIPS) {
            chips += '<a class="prodchip prodchip--more" href="' + esc(c.key) + '.html">+' + (prods.length - MAXCHIPS) + (L.state.lang === "en" ? " more" : " 篇") + "</a>";
          }
          var countLabel = prods.length + (L.state.lang === "en" ? " topics" : " 篇");
          var more = L.state.lang === "en" ? "Explore" : "看這一類";
          return '<div class="cat-card reveal" data-item>' +
            '<a class="cat-card__head" href="' + esc(c.key) + '.html" aria-label="' + esc(t(c.title)) + '">' +
              '<span class="cat-card__icon"><span class="material-symbols-rounded">' + esc(c.icon || "category") + "</span></span>" +
              '<div><h3 class="cat-card__name">' + esc(t(c.title)) + "</h3>" +
              '<span class="cat-card__count">' + esc(String(countLabel)) + "</span></div></a>" +
            '<p class="cat-card__blurb">' + esc(t(c.blurb)) + "</p>" +
            '<div class="cat-card__chips">' + chips + "</div>" +
            '<a class="cat-card__more" href="' + esc(c.key) + '.html">' + esc(more) +
              ' <span class="material-symbols-rounded">arrow_forward</span></a>' +
          "</div>";
        }).join("");
        var tools = ["start", "glossary", "quiz", "flashcards"].map(function (slug) {
          var q = L.pages.filter(function (x) { return x.slug === slug; })[0];
          if (!q) return "";
          return '<a class="tool-card reveal" data-item href="' + esc(L.pageHref(q)) + '">' +
            '<span class="tool-card__icon"><span class="material-symbols-rounded">' + esc(q.icon || "school") + "</span></span>" +
            '<div><p class="tool-card__t">' + esc(t(q.title)) + "</p>" +
            '<p class="tool-card__d">' + esc(t(q.subtitle)) + "</p></div></a>";
        }).join("");
        var EN = L.state.lang === "en";
        var intro = t(p.intro) ? '<p class="lead reveal">' + esc(t(p.intro)) + "</p>" : "";
        return lheroHTML(p) + intro +
          '<div class="home-section"><h2 class="home-section__title"><span class="material-symbols-rounded">grid_view</span>' +
            (EN ? "Browse by category" : "依分類瀏覽") + "</h2>" +
            '<p class="home-section__sub">' + (EN ? "Six product families make up the Cloudflare developer platform." : "六大產品家族構成了 Cloudflare 開發者平台。") + "</p></div>" +
          '<div class="cat-grid">' + catCards + "</div>" +
          '<div class="home-section"><h2 class="home-section__title"><span class="material-symbols-rounded">school</span>' +
            (EN ? "Learning tools" : "學習工具") + "</h2>" +
            '<p class="home-section__sub">' + (EN ? "Practice and look things up as you learn." : "邊學邊練習、隨時查得到。") + "</p></div>" +
          '<div class="tools-grid">' + tools + "</div>";
      },

      /* ---- category: product/guide cards filtered by category, optionally grouped ---- */
      category: function (p) {
        var products = L.pages.filter(function (q) { return q.layout === "lesson" && q.category === p.key; });
        var EN = L.state.lang === "en";
        function prodCard(q) {
          return '<a class="prod-card reveal" data-item href="' + esc(q.slug) + '.html">' +
            '<div class="prod-card__head"><span class="prod-card__icon"><span class="material-symbols-rounded">' + esc(q.icon || "label") + "</span></span>" +
            '<h3 class="prod-card__name">' + esc(t(q.title)) + "</h3></div>" +
            '<p class="prod-card__sub">' + esc(t(q.subtitle)) + "</p>" +
            '<span class="prod-card__go">' + (EN ? "Learn" : "開始學") + ' <span class="material-symbols-rounded">arrow_forward</span></span></a>';
        }
        var intro = t(p.intro) ? '<p class="lead reveal">' + esc(t(p.intro)) + "</p>" : "";
        var body;
        if (products.some(function (q) { return q.group; })) {
          var order = [], buckets = {};
          products.forEach(function (q) {
            var key = q.group ? t(q.group) : (EN ? "More" : "其他");
            if (!buckets[key]) { buckets[key] = []; order.push(key); }
            buckets[key].push(q);
          });
          body = order.map(function (key) {
            return '<div class="home-section"><h2 class="home-section__title">' +
              '<span class="material-symbols-rounded">folder_open</span>' + esc(key) +
              ' <span class="group-count">' + buckets[key].length + "</span></h2></div>" +
              '<div class="grid">' + buckets[key].map(prodCard).join("") + "</div>";
          }).join("");
        } else {
          body = '<div class="grid">' + products.map(prodCard).join("") + "</div>";
        }
        return lheroHTML(p) + intro + body;
      },

      /* ---- lesson: hero + sticky TOC + sectioned beginner content ---- */
      lesson: function (p) {
        var toc = (p.sections || []).map(function (s) {
          return '<a href="#' + esc(s.id) + '" data-toc="' + esc(s.id) + '">' +
            '<span class="material-symbols-rounded">' + esc(s.icon || "chevron_right") + "</span>" + esc(t(s.heading)) + "</a>";
        }).join("");
        var body = (p.sections || []).map(function (s) {
          return '<section class="lsec reveal" data-item id="' + esc(s.id) + '">' +
            '<div class="lsec__head"><span class="lsec__icon"><span class="material-symbols-rounded">' + esc(s.icon || "label") + "</span></span>" +
            "<h2>" + esc(t(s.heading)) + "</h2></div>" +
            renderBlocks(s.blocks) + "</section>";
        }).join("");
        return '<div class="reading-progress" id="readingProgress" aria-hidden="true"></div>' +
          lheroHTML(p) +
          '<div class="lesson-layout">' +
            '<nav class="lesson-toc" aria-label="Sections"><div class="lesson-toc__inner">' + toc + "</div></nav>" +
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
          return '<button class="fc reveal" data-item type="button" data-fc="' + i + '" aria-pressed="false">' +
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
      }
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

      home: function () { revealAll(); },
      category: function () { revealAll(); },

      lesson: function () {
        lessonScrollspy();
        wireCopy();
        revealAll();
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
        revealAll();
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
            '<p class="quiz-result__msg">' + esc(msg) + " (" + st.score + "/" + qs.length + ")</p>" +
            '<button class="quiz-btn" type="button" data-restart><span class="material-symbols-rounded">replay</span>' +
            (EN ? "Try again" : "再試一次") + "</button></div>";
          root.querySelector("[data-restart]").addEventListener("click", function () {
            st.i = 0; st.score = 0; st.answered = false; st.picked = -1; renderQ();
          });
        }
        renderQ();
      }
    };

    /* =====================================================================
       shared builders + helpers for the learning layouts
       ===================================================================== */
    function lheroHTML(p) {
      var badge = p.hero && t(p.hero.badge)
        ? '<span class="lhero__badge"><span class="material-symbols-rounded">sell</span>' + esc(t(p.hero.badge)) + "</span>" : "";
      var tagline = p.hero && t(p.hero.tagline) ? esc(t(p.hero.tagline))
                  : (t(p.subtitle) ? esc(t(p.subtitle)) : "");
      var taglineHtml = tagline ? '<p class="lhero__tagline">' + tagline + "</p>" : "";
      var stats = (p.stats || []).map(function (s) {
        return '<div class="lhero__stat"><b>' + esc(String(s.value)) + "</b><span>" + esc(t(s.label)) + "</span></div>";
      }).join("");
      return '<div class="lhero">' + badge +
        '<div class="lhero__top">' +
          '<span class="lhero__icon"><span class="material-symbols-rounded">' + esc(p.icon || "label") + "</span></span>" +
          '<h1 class="lhero__title">' + esc(t(p.title)) + "</h1>" +
        "</div>" + taglineHtml +
        (stats ? '<div class="lhero__stats">' + stats + "</div>" : "") +
      "</div>";
    }

    function codeHTML(c) {
      var lang = c.lang || "code";
      var name = t(c.title) ? '<span class="codeblock__name">' + esc(t(c.title)) + "</span>" : "";
      var copyLabel = L.state.lang === "en" ? "Copy" : "複製";
      return '<div class="codeblock">' +
        '<div class="codeblock__bar">' +
          '<span class="codeblock__dot" style="background:#FF5F56"></span>' +
          '<span class="codeblock__dot" style="background:#FFBD2E"></span>' +
          '<span class="codeblock__dot" style="background:#27C93F"></span>' +
          '<span class="codeblock__lang">' + esc(lang) + "</span>" +
          '<span style="flex:1"></span>' + name +
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
        return '<a href="' + esc(rr.slug) + '.html"><span class="material-symbols-rounded">arrow_forward</span>' + esc(t(rr.label)) + "</a>";
      }).join("");
      var docs = p.docs ? '<a class="docs-btn" href="' + esc(p.docs) + '" target="_blank" rel="noopener">' +
        '<span class="material-symbols-rounded">menu_book</span>' + (EN ? "Official docs" : "官方文件") +
        '<span class="material-symbols-rounded">open_in_new</span></a>' : "";
      if (!rel && !docs) return "";
      return '<div class="lesson-foot">' +
        (rel ? '<p class="lesson-foot__label">' + (EN ? "Related products" : "相關產品") + "</p><div class=\"related\">" + rel + "</div>" : "") +
        docs + "</div>";
    }

    function revealAll() {
      var els = [].slice.call(pageEl.querySelectorAll(".reveal"));
      if (!els.length) return;
      if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("is-in"); }); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
      }, { threshold: 0.08 });
      els.forEach(function (el) { io.observe(el); });
      teardowns.push(function () { io.disconnect(); });
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
              fontFamily: '"Roboto Flex","Noto Sans TC",sans-serif',
              primaryColor: dark ? "#3a2a1d" : "#FFDBC8",
              primaryBorderColor: "#F6821F",
              primaryTextColor: dark ? "#EFE0D6" : "#211A15",
              lineColor: dark ? "#A08D81" : "#85736A"
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
       RENDER the current page; re-runnable on language switch
       ===================================================================== */
    function render() {
      teardowns.forEach(function (fn) { try { fn(); } catch (e) {} });
      teardowns = [];
      var p = L.currentPage();
      if (!p) { pageEl.innerHTML = '<p class="empty">No page data.</p>'; return; }
      var fn = RENDERERS[p.layout] || RENDERERS.gallery;
      pageEl.className = "page page--" + p.layout;
      pageEl.innerHTML = fn(p);
      var w = WIRE[p.layout];
      if (w) w(p);
    }

    L.onLang(render);
    if (typeof L.onTheme === "function") L.onTheme(function () { renderMermaid(); });
    render();
  }

  boot();
})();
