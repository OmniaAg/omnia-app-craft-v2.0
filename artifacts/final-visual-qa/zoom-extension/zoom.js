chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && tab.url?.startsWith('http://127.0.0.1:53170/')) {
    chrome.tabs.setZoom(tabId, 2)
  }
})
