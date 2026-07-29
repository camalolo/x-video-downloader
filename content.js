/* ==========================================================================
   X Video Downloader - content.js (ISOLATED world)
   Watches the timeline for video tweets (flagged by inject.js via the
   data-xdl-url attribute) and injects a download button next to the share
   button in each tweet's action bar.
   Also filters (hides) posts from user-blocked countries using the
   AboutAccountQuery data resolved by background.js.
   ========================================================================== */

(function () {
  var VIDEO_ATTR = 'data-xdl-url';
  var USER_ATTR = 'data-xdl-user';
  var COUNTRY_ATTR = 'data-xdl-country';
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
    for (var index = 0; index < children.length; index++) {
      if (children[index].querySelector('[data-testid="bookmark"]')) {
        insertBefore = index + 1 < children.length ? children[index + 1] : null;
        break;
      }
    }
    if (!insertBefore) insertBefore = bar.lastElementChild; // fallback: before last child

    var wrap = document.createElement('div');
    wrap.className = CONTAINER_CLASS;

    var button = document.createElement('button');
    button.className = 'xdl-btn';
    button.setAttribute('type', 'button');
    button.setAttribute('aria-label', 'Download video');
    button.setAttribute('role', 'button');
    button.innerHTML = ICON_DOWNLOAD;
    button.addEventListener('click', onDownload);

    wrap.append(button);
    insertBefore.before(wrap);
  }

  function removeButton(article) {
    var existing = article.querySelector('.' + CONTAINER_CLASS);
    if (existing) existing.remove();
  }

  /* -- Download handler ------------------------------------------------- */

  function onDownload(event) {
    event.preventDefault();
    event.stopPropagation();

    var button = event.currentTarget;
    if (button.classList.contains('xdl-loading')) return;

    var article = button.closest('article[data-testid="tweet"]');
    if (!article) return;

    var url = article.getAttribute(VIDEO_ATTR);

    if (!url) {
      // Ask inject.js to rescan, then retry once
      window.postMessage({ type: 'XDL_RESCAN' }, '*');
      setTimeout(function () {
        var u = article.getAttribute(VIDEO_ATTR);
        if (u) doDownload(button, article, u);
        else flash(button, 'xdl-error');
      }, 600);
      return;
    }

    doDownload(button, article, url);
  }

  function doDownload(button, article, url) {
    button.classList.add('xdl-loading');
    button.innerHTML = ICON_SPINNER;

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
        button.classList.remove('xdl-loading');
        if (resp && resp.success) {
          button.innerHTML = ICON_CHECK;
          button.classList.add('xdl-ok');
          setTimeout(resetButton, 2000, button);
        } else {
          button.innerHTML = ICON_DOWNLOAD;
          flash(button, 'xdl-error');
        }
      }
    );
  }

  function resetButton(button) {
    button.innerHTML = ICON_DOWNLOAD;
    button.classList.remove('xdl-ok');
  }

  function flash(button, cls) {
    button.classList.add(cls);
    setTimeout(function () { button.classList.remove(cls); }, 1200);
  }

  /* -- Country filter --------------------------------------------------- */

  var pendingLookups = new Set();
  var localCache = {}; // screenName -> country string
  var blockedCountries = [];
  var filterEnabled = false;

  // Load initial settings
  chrome.storage.local.get(['xdl_filter_enabled', 'xdl_blocked_countries'], function (data) {
    filterEnabled = !!data.xdl_filter_enabled;
    blockedCountries = data.xdl_blocked_countries || [];
  });

  // React to popup changes live
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.xdl_filter_enabled) {
      filterEnabled = !!changes.xdl_filter_enabled.newValue;
      reevaluateAll();
    }
    if (changes.xdl_blocked_countries) {
      blockedCountries = changes.xdl_blocked_countries.newValue || [];
      reevaluateAll();
    }
  });

  function getScreenName(article) {
    var link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    var m = (link.href || '').match(/\/([^/]+)\/status\/\d+/);
    return m ? m[1] : null;
  }

  function processCountry(article) {
    var screenName = getScreenName(article);
    if (!screenName) return;

    // Detect virtual-scroll recycling
    var previous = article.getAttribute(USER_ATTR);
    if (previous && previous !== screenName) {
      article.removeAttribute(COUNTRY_ATTR);
      removeBlock(article);
    }
    article.setAttribute(USER_ATTR, screenName);

    var country = article.getAttribute(COUNTRY_ATTR) || localCache[screenName];
    if (country) {
      article.setAttribute(COUNTRY_ATTR, country);
      if (filterEnabled && blockedCountries.includes(country)) {
        addBlock(article, country);
      } else {
        removeBlock(article);
      }
      return;
    }

    // Request lookup (deduplicated)
    if (!pendingLookups.has(screenName)) {
      requestLookup(screenName);
    }
  }

  function requestLookup(screenName) {
    pendingLookups.add(screenName);

    var csrf = (document.cookie.match(/ct0=([^;]+)/) || [])[1];
    if (!csrf) {
      pendingLookups.delete(screenName);
      return; // not logged in
    }

    chrome.runtime.sendMessage(
      { type: 'XDL_LOOKUP', screenName: screenName, csrf: csrf },
      function (resp) {
        pendingLookups.delete(screenName);
        if (chrome.runtime.lastError || !resp || !resp.country) return;

        localCache[screenName] = resp.country;
        var articles = document.querySelectorAll('article[' + USER_ATTR + '="' + screenName + '"]');
        for (var index = 0; index < articles.length; index++) {
          articles[index].setAttribute(COUNTRY_ATTR, resp.country);
          if (filterEnabled && blockedCountries.includes(resp.country)) {
            addBlock(articles[index], resp.country);
          }
        }
      }
    );
  }

  function addBlock(article) {
    if (article.classList.contains('xdl-blocked')) return;
    article.classList.add('xdl-blocked');
    scheduleStatsUpdate();
  }

  function removeBlock(article) {
    if (!article.classList.contains('xdl-blocked')) return;
    article.classList.remove('xdl-blocked');
    scheduleStatsUpdate();
  }

  /* -- Blocked stats (debounced write to storage) ---------------------- */

  var statsTimer = null;

  function scheduleStatsUpdate() {
    if (statsTimer) return;
    statsTimer = setTimeout(function () {
      statsTimer = null;
      var stats = {};
      var blocked = document.querySelectorAll('article.xdl-blocked[' + COUNTRY_ATTR + ']');
      for (var index = 0; index < blocked.length; index++) {
        var c = blocked[index].getAttribute(COUNTRY_ATTR);
        if (c) stats[c] = (stats[c] || 0) + 1;
      }
      chrome.storage.local.set({ xdl_blocked_stats: stats });
    }, 500);
  }

  function reevaluateAll() {
    var articles = document.querySelectorAll('article[' + COUNTRY_ATTR + ']');
    for (var index = 0; index < articles.length; index++) {
      var country = articles[index].getAttribute(COUNTRY_ATTR);
      if (filterEnabled && country && blockedCountries.includes(country)) {
        addBlock(articles[index], country);
      } else {
        removeBlock(articles[index]);
      }
    }
  }

  /* -- Timeline scanning ------------------------------------------------ */

  function process() {
    var articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (var a of articles) {
      // Download button (video tweets only)
      if (a.hasAttribute(VIDEO_ATTR)) {
        createButton(a);
      } else {
        removeButton(a);
      }
      // Country filter (all tweets)
      processCountry(a);
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
