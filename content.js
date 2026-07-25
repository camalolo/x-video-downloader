/* ==========================================================================
   X Video Downloader - content.js (ISOLATED world)
   Watches the timeline for video tweets (flagged by inject.js via the
   data-xdl-url attribute) and injects a download button next to the share
   button in each tweet's action bar.
   ========================================================================== */

(function () {
  'use strict';

  var VIDEO_ATTR = 'data-xdl-url';
  var CONTAINER_CLASS = 'xdl-btn-wrap';
  var ICON_DOWNLOAD =
    '<svg viewBox="0 0 24 24" class="xdl-svg"><g><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></g></svg>';
  var ICON_SPINNER =
    '<svg viewBox="0 0 24 24" class="xdl-svg xdl-spin"><path d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"></path></svg>';
  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" class="xdl-svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>';

  /* -- Button creation -------------------------------------------------- */

  function createButton(article) {
    if (article.querySelector('.' + CONTAINER_CLASS)) return;

    // Locate the action bar — the [role="group"] containing like/reply buttons
    var bar = article.querySelector('[role="group"]');
    if (!bar) return;
    if (!bar.querySelector('[data-testid="like"]') && !bar.querySelector('[data-testid="reply"]')) return;

    // Find where to insert: right before the share button (after bookmark)
    var children = Array.prototype.slice.call(bar.children);
    var insertBefore = null;
    for (var i = 0; i < children.length; i++) {
      if (children[i].querySelector('[data-testid="bookmark"]')) {
        insertBefore = i + 1 < children.length ? children[i + 1] : null;
        break;
      }
    }
    if (!insertBefore) insertBefore = bar.lastElementChild; // fallback: before last child

    var wrap = document.createElement('div');
    wrap.className = CONTAINER_CLASS;

    var btn = document.createElement('button');
    btn.className = 'xdl-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Download video');
    btn.setAttribute('role', 'button');
    btn.innerHTML = ICON_DOWNLOAD;
    btn.addEventListener('click', onDownload);

    wrap.appendChild(btn);
    bar.insertBefore(wrap, insertBefore);
  }

  function removeButton(article) {
    var existing = article.querySelector('.' + CONTAINER_CLASS);
    if (existing) existing.remove();
  }

  /* -- Download handler ------------------------------------------------- */

  function onDownload(e) {
    e.preventDefault();
    e.stopPropagation();

    var btn = e.currentTarget;
    if (btn.classList.contains('xdl-loading')) return;

    var article = btn.closest('article[data-testid="tweet"]');
    if (!article) return;

    var url = article.getAttribute(VIDEO_ATTR);

    if (!url) {
      // Ask inject.js to rescan, then retry once
      window.postMessage({ type: 'XDL_RESCAN' }, '*');
      setTimeout(function () {
        var u = article.getAttribute(VIDEO_ATTR);
        if (u) doDownload(btn, article, u);
        else flash(btn, 'xdl-error');
      }, 600);
      return;
    }

    doDownload(btn, article, url);
  }

  function doDownload(btn, article, url) {
    btn.classList.add('xdl-loading');
    btn.innerHTML = ICON_SPINNER;

    // Build a friendly filename
    var filename = 'x_video.mp4';
    var link = article.querySelector('a[href*="/status/"]');
    if (link) {
      var m = (link.href || '').match(/\/([^/]+)\/status\/(\d+)/);
      if (m) filename = m[1] + '_' + m[2] + '.mp4';
    }

    chrome.runtime.sendMessage(
      { type: 'XDL_DOWNLOAD', url: url, filename: filename },
      function (resp) {
        btn.classList.remove('xdl-loading');
        if (resp && resp.success) {
          btn.innerHTML = ICON_CHECK;
          btn.classList.add('xdl-ok');
          setTimeout(resetButton, 2000, btn);
        } else {
          btn.innerHTML = ICON_DOWNLOAD;
          flash(btn, 'xdl-error');
        }
      }
    );
  }

  function resetButton(btn) {
    btn.innerHTML = ICON_DOWNLOAD;
    btn.classList.remove('xdl-ok');
  }

  function flash(btn, cls) {
    btn.classList.add(cls);
    setTimeout(function () { btn.classList.remove(cls); }, 1200);
  }

  /* -- Timeline scanning ------------------------------------------------ */

  function process() {
    var articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      if (a.hasAttribute(VIDEO_ATTR)) {
        createButton(a);
      } else {
        removeButton(a); // tweet recycled to non-video
      }
    }
  }

  // Debounced MutationObserver + interval fallback
  var timer = null;
  var observer = new MutationObserver(function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(process, 400);
  });

  function start() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    process();
    setInterval(process, 1500);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
