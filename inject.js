/* ==========================================================================
   X Video Downloader - inject.js
   Runs in the MAIN world to read React component props from the DOM and
   extract direct video URLs. Communicates findings to the content script
   via data attributes (shared between worlds).
   ========================================================================== */

(function () {
  'use strict';

  var VIDEO_ATTR = 'data-xdl-url';
  var TWEET_ID_ATTR = 'data-xdl-tid';
  var DONE_ATTR = 'data-xdl-done';

  /* -- Helpers ---------------------------------------------------------- */

  function reactPropsKey(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('reactProps') !== -1) return keys[i];
    }
    return null;
  }

  /**
   * Pick the best-quality MP4 variant from a Twitter/X video_info block.
   */
  function bestVariant(variants) {
    var best = null;
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      if (v.content_type === 'video/mp4') {
        if (!best || (v.bitrate || 0) > (best.bitrate || 0)) best = v;
      }
    }
    return best || variants[variants.length - 1];
  }

  function urlFromTweet(tweet) {
    if (!tweet) return null;
    var media = tweet.entities && tweet.entities.media;
    if ((!media || !media.length) && tweet.retweeted_status) {
      media = tweet.retweeted_status.entities && tweet.retweeted_status.entities.media;
    }
    if ((!media || !media.length) && tweet.quoted_status) {
      media = tweet.quoted_status.entities && tweet.quoted_status.entities.media;
    }
    if (!media) return null;
    for (var i = 0; i < media.length; i++) {
      var m = media[i];
      if ((m.type === 'video' || m.type === 'animated_gif') && m.video_info && m.video_info.variants) {
        var v = bestVariant(m.video_info.variants);
        if (v && v.url) return v.url;
      }
    }
    return null;
  }

  /**
   * Walk the React props tree to find a tweet object that carries media.
   * Tries known fast paths first, then a bounded depth-first fallback.
   */
  function findTweet(props) {
    // Fast paths — common React component tree locations
    var p = props;
    var tries = [
      p && p.children && p.children[0] && p.children[0].props && p.children[0].props.children && p.children[0].props.children[0] && p.children[0].props.children[0].props && p.children[0].props.children[0].props.tweet,
      p && p.children && p.children[0] && p.children[0].props && p.children[0].props.tweet,
      p && p.children && p.children[1] && p.children[1].props && p.children[1].props.tweet,
    ];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      if (t && ((t.entities && t.entities.media) || t.retweeted_status)) return t;
    }

    // Bounded fallback search (with cycle guard)
    return search(props, 0, new Set());
  }

  function search(obj, depth, visited) {
    if (!obj || typeof obj !== 'object' || depth > 7) return null;
    if (visited.has(obj)) return null;
    visited.add(obj);
    if (obj.entities && obj.entities.media) return obj;
    if (obj.retweeted_status && obj.retweeted_status.entities && obj.retweeted_status.entities.media) return obj.retweeted_status;

    var followKeys = ['props', 'tweet', 'result', 'legacy', 'retweeted_status', 'quoted_status'];
    for (var i = 0; i < followKeys.length; i++) {
      var k = followKeys[i];
      if (obj[k]) {
        var found = search(obj[k], depth + 1, visited);
        if (found) return found;
      }
    }
    if (Array.isArray(obj.children)) {
      for (var j = 0; j < obj.children.length; j++) {
        var f = search(obj.children[j], depth + 1, visited);
        if (f) return f;
      }
    }
    return null;
  }

  function getTweetId(article) {
    var link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    var match = (link.href || '').match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /* -- Scanning --------------------------------------------------------- */

  function scanArticle(article) {
    var tid = getTweetId(article);
    var stored = article.getAttribute(TWEET_ID_ATTR);

    // Detect virtual-scroll recycling
    if (stored && tid && stored !== tid) {
      article.removeAttribute(VIDEO_ATTR);
      article.removeAttribute(DONE_ATTR);
    }

    if (article.hasAttribute(DONE_ATTR)) return;

    var labeled = article.querySelector('[aria-labelledby]');
    if (!labeled) return;

    var key = reactPropsKey(labeled);
    if (!key) return;

    var props = labeled[key];
    if (!props) return;

    var tweet = findTweet(props);
    if (!tweet) return; // will retry next cycle

    var url = urlFromTweet(tweet);
    if (url) article.setAttribute(VIDEO_ATTR, url);
    if (tid) article.setAttribute(TWEET_ID_ATTR, tid);
    article.setAttribute(DONE_ATTR, '1');
  }

  function scanAll() {
    try {
      var articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (var i = 0; i < articles.length; i++) scanArticle(articles[i]);
    } catch (e) { /* ignore */ }
  }

  // Listen for on-demand rescan from content script
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'XDL_RESCAN') scanAll();
  });

  scanAll();
  setInterval(scanAll, 1500);
})();
