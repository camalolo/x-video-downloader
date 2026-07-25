/* ==========================================================================
   X Video Downloader - background.js (MV3 service worker)
   Receives download requests from the content script and triggers a browser
   download via the chrome.downloads API.
   ========================================================================== */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type !== 'XDL_DOWNLOAD') return;

  chrome.downloads.download(
    {
      url: msg.url,
      filename: sanitizeFilename(msg.filename),
      saveAs: false,
    },
    function (downloadId) {
      if (chrome.runtime.lastError || !downloadId) {
        sendResponse({ success: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Download failed' });
      } else {
        sendResponse({ success: true, id: downloadId });
      }
    }
  );

  return true; // keep channel open for async sendResponse
});

function sanitizeFilename(name) {
  return (name || 'video.mp4').replace(/[\\/:*?"<>|]/g, '_').substring(0, 200);
}
