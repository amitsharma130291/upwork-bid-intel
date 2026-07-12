chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    chrome.storage.local.set({ stats: { checked:0, skipped:0, connects:0 } });
  }
});
