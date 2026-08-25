const ENDPOINT_MATCH = /\/api\/v1\/finding-dashboard-v2(\?|$)/;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== 'GET' || !ENDPOINT_MATCH.test(details.url)) return;

    const record = { url: details.url, timestamp: Date.now(), tabId: details.tabId };
    const updates = { lastFindingsRequest: record };
    if (details.tabId >= 0) {
      updates[`lastFindingsRequest_${details.tabId}`] = record;
    }
    chrome.storage.local.set(updates);
  },
  { urls: ['*://*.accuknox.com/*'] },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`lastFindingsRequest_${tabId}`);
});
