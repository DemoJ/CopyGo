chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    // 使用 Data URL 进行下载
    const dataUrl = `data:${request.contentType};charset=utf-8,${encodeURIComponent(request.content)}`;
    
    chrome.downloads.download({
      url: dataUrl,
      filename: request.filename,
      saveAs: true // 让用户选择保存位置，或者根据设置自动保存
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('下载失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    
    return true; // 异步响应
  }
});
