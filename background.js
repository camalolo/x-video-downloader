/* ==========================================================================
   X Video Downloader - background.js (MV3 service worker)
   Receives download requests from the content script and triggers a browser
   download via the chrome.downloads API.
   ========================================================================== */

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'XDL_DOWNLOAD') return;

  chrome.downloads.download(
    {
      url: message.url,
      filename: sanitizeFilename(message.filename),
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
  return (name || 'video.mp4').replaceAll(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}
