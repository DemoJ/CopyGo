let isInspectorActive = false;
let collectedItems = [];
const DEFAULT_SHORTCUT = 'Alt+X';

const views = {
  main: document.getElementById('main-view'),
  settings: document.getElementById('settings-view')
};
const toggleBtn = document.getElementById('toggle-inspector');
const contentList = document.getElementById('content-list');
const countSpan = document.getElementById('count');
const clearBtn = document.getElementById('clear-all');
const exportTxtBtn = document.getElementById('export-txt');
const exportMdBtn = document.getElementById('export-md');
const openSettingsBtn = document.getElementById('open-settings');
const backToMainBtn = document.getElementById('back-to-main');
const shortcutInput = document.getElementById('shortcut-input');
const resetShortcutBtn = document.getElementById('reset-shortcut');

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  await loadSettings();
  await checkInspectorState();
  renderList();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'newItemAdded') {
    loadData().then(renderList);
  } else if (request.action === 'inspectorDisabled' || request.action === 'inspectorEnabled') {
    isInspectorActive = (request.action === 'inspectorEnabled');
    updateToggleButton();
  }
});

toggleBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  const newStatus = !isInspectorActive;
  try {
    await sendMessageToContentScript(tab.id, { action: 'toggleInspector', state: newStatus });
    isInspectorActive = newStatus;
    updateToggleButton();
  } catch (error) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      setTimeout(async () => {
        await sendMessageToContentScript(tab.id, { action: 'toggleInspector', state: newStatus });
        isInspectorActive = newStatus; updateToggleButton();
      }, 200);
    } catch (e) { alert('无法在当前页面启动。'); }
  }
});

openSettingsBtn.addEventListener('click', () => { views.main.style.display = 'none'; views.settings.style.display = 'block'; });
backToMainBtn.addEventListener('click', () => { views.settings.style.display = 'none'; views.main.style.display = 'block'; });

shortcutInput.addEventListener('keydown', (e) => {
  e.preventDefault();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift'); if (e.metaKey) parts.push('Command');
  let key = e.key.toUpperCase(); if (key === ' ') key = 'Space';
  parts.push(key);
  const shortcut = parts.join('+');
  shortcutInput.value = shortcut;
  chrome.storage.local.set({ copyGoShortcut: shortcut });
});

resetShortcutBtn.addEventListener('click', () => {
  shortcutInput.value = DEFAULT_SHORTCUT;
  chrome.storage.local.set({ copyGoShortcut: DEFAULT_SHORTCUT });
});

async function loadSettings() {
  const result = await chrome.storage.local.get(['copyGoShortcut']);
  shortcutInput.value = result.copyGoShortcut || DEFAULT_SHORTCUT;
}

clearBtn.addEventListener('click', () => { collectedItems = []; saveData(); renderList(); });

contentList.addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-btn')) {
    collectedItems.splice(parseInt(e.target.dataset.index), 1);
    saveData(); renderList();
  }
});

// 辅助：简单的 Markdown 转纯文本
function stripMd(md) {
  return md
    .replace(/^#+\s+/gm, '') // 标题
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 加粗
    .replace(/\*([^*]+)\*/g, '$1') // 斜体
    .replace(/[[^\\\]]+]\[[^)]+\]/g, '$1') // 链接
    .replace(/^>\s+/gm, '') // 引用
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '')) // 代码块
    .replace(/`([^`]+)`/g, '$1'); // 行内代码
}

exportTxtBtn.addEventListener('click', () => {
  if (collectedItems.length === 0) return;
  const text = collectedItems.map(item => {
    const md = typeof item === 'string' ? item : (item.markdown || item.text);
    return stripMd(md);
  }).join('\n\n-------------------\n\n');
  downloadFile(text, 'copygo-export.txt', 'text/plain');
});

exportMdBtn.addEventListener('click', () => {
  if (collectedItems.length === 0) return;
  const text = collectedItems.map(item => {
    return typeof item === 'string' ? item : (item.markdown || item.text);
  }).join('\n\n---\n\n');
  downloadFile(text, 'copygo-export.md', 'text/markdown');
});

function updateToggleButton() {
  const text = isInspectorActive ? '停止选择模式' : '开启选择模式';
  // 保持 SVG 图标，并将文本包裹在 span 中以修复 z-index 层级问题
  const icon = '<svg style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  
  toggleBtn.innerHTML = `${icon}<span>${text}</span>`;
  
  if (isInspectorActive) {
    toggleBtn.classList.add('active');
  } else {
    toggleBtn.classList.remove('active');
  }
}

async function checkInspectorState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const response = await sendMessageToContentScript(tab.id, { action: 'getStatus' });
    if (response) { isInspectorActive = response.isActive; updateToggleButton(); }
  } catch (e) { isInspectorActive = false; updateToggleButton(); }
}

async function loadData() {
  const result = await chrome.storage.local.get(['copyGoItems']);
  collectedItems = result.copyGoItems || [];
}

async function saveData() {
  await chrome.storage.local.set({ copyGoItems: collectedItems });
  updateCount();
}

function updateCount() { countSpan.textContent = collectedItems.length; }

function renderList() {
  contentList.innerHTML = '';
  if (collectedItems.length === 0) {
    contentList.innerHTML = '<li class="empty-state">暂无内容，请开启选择模式点击网页元素。</li>';
    return;
  }
  collectedItems.forEach((item, index) => {
    // 列表预览依然显示纯文本，更易读
    const md = typeof item === 'string' ? item : (item.markdown || item.text);
    const text = stripMd(md);
    const li = document.createElement('li');
    li.innerHTML = `<div class="text-content" title="${escapeHtml(text)}">${escapeHtml(text)}</div><span class="delete-btn" data-index="${index}">×</span>`;
    contentList.appendChild(li);
  });
  updateCount();
}

function escapeHtml(u) { return u.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function downloadFile(content, filename, contentType) {
  chrome.runtime.sendMessage({ action: 'download', content, filename, contentType });
}

function sendMessageToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve(response);
    });
  });
}