(function() {
  if (window.copyGoInjected) return;
  window.copyGoInjected = true;

  let inspectorEnabled = false;
  let isLocked = false;
  let highlightElement = null;
  let toolbarElement = null;
  let currentTarget = null;
  let currentText = '';
  let currentMarkdown = '';

  const ICONS = {
    add: '<svg class="copygo-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    copy: '<svg class="copygo-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    export: '<svg class="copygo-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    close: '<svg class="copygo-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
  };

  function getListDepth(node) {
    let depth = 0;
    let parent = node.parentNode;
    while (parent) {
      if (parent.nodeType === 1 && parent.tagName) {
        const t = parent.tagName.toLowerCase();
        if (t === 'ul' || t === 'ol') depth++;
      }
      parent = parent.parentNode;
    }
    return Math.max(0, depth - 1);
  }

  function domToMarkdown(node) {
    if (node.nodeType === 3) {
      return node.textContent.replace(/([*_[\]`|])/g, '\\$1');
    }
    if (node.nodeType !== 1) return '';
    if (window.getComputedStyle(node).display === 'none') return '';

    const tag = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') || '').toLowerCase();
    
    if (['button', 'script', 'style', 'noscript', 'iframe', 'svg', 'input', 'select', 'textarea'].includes(tag)) return '';
    if (tag !== 'a' && tag !== 'img' && cls.includes('copy') && node.innerText.trim().length <= 10) return '';

    // 特殊块：Pre/Code
    if (tag === 'pre') {
        const codeChild = node.querySelector('code');
        const text = (codeChild ? codeChild.innerText : node.innerText).trim();
        return '\n```\n' + text + '\n```\n\n';
    }

    // 特殊块：Table Row (修复表头分割线缺失问题)
    if (tag === 'tr') {
        const cells = [];
        const alignments = [];
        let hasTh = false;
        
        node.childNodes.forEach(child => {
            if (child.nodeType !== 1) return;
            const cTag = child.tagName.toLowerCase();
            if (cTag === 'td' || cTag === 'th') {
                if (cTag === 'th') hasTh = true;
                
                // 探测对齐方式
                const align = child.getAttribute('align') || child.style.textAlign;
                if (align === 'center') alignments.push(':---:');
                else if (align === 'right') alignments.push('---:');
                else alignments.push('---');

                // 获取单元格内容
                let cText = domToMarkdown(child).trim().replace(/\n/g, '<br>');
                cells.push(cText || ' ');
            }
        });

        if (cells.length === 0) return '';

        const rowStr = '| ' + cells.join(' | ') + ' |\n';
        
        // 决定是否在此行后插入分割线 (|---|---|)
        // 1. 包含 <th> 标签
        // 2. 是 thead 中的第一行
        // 3. 是 table 或 tbody 中的第一行（兼容非规范 HTML 表格）
        const prev = node.previousElementSibling;
        const isFirstInParent = !prev || (prev.tagName && prev.tagName.toLowerCase() !== 'tr');
        const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : '';
        
        const shouldAddSeparator = hasTh || (parentTag === 'thead' && isFirstInParent) || 
                                   ((parentTag === 'table' || parentTag === 'tbody') && isFirstInParent);

        if (shouldAddSeparator) {
            const sepStr = '| ' + alignments.join(' | ') + ' |\n';
            return rowStr + sepStr;
        }
        return rowStr;
    }

    if (tag === 'td' || tag === 'th') {
        let content = '';
        node.childNodes.forEach(child => content += domToMarkdown(child));
        return content;
    }

    if (tag === 'li') {
        const depth = getListDepth(node);
        const indent = '  '.repeat(depth);
        let content = '';
        node.childNodes.forEach(child => {
            content += domToMarkdown(child).trim() + ' ';
        });
        const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : '';
        const symbol = parentTag === 'ol' ? '1. ' : '- ';
        return indent + symbol + content.trim() + '\n';
    }

    let content = '';
    node.childNodes.forEach(child => content += domToMarkdown(child));
    
    switch (tag) {
      case 'h1': return '\n# ' + content.trim() + '\n\n';
      case 'h2': return '\n## ' + content.trim() + '\n\n';
      case 'h3': return '\n### ' + content.trim() + '\n\n';
      case 'h4': return '\n#### ' + content.trim() + '\n\n';
      case 'h5': return '\n##### ' + content.trim() + '\n\n';
      case 'h6': return '\n###### ' + content.trim() + '\n\n';
      case 'p': 
      case 'div': 
      case 'section': 
      case 'article':
      case 'header':
      case 'footer':
      case 'nav':
      case 'main':
        return content.trim() ? '\n' + content.trim() + '\n\n' : '';
      case 'br': return '  \n';
      case 'hr': return '\n---\n\n';
      case 'b':
      case 'strong': return ' **' + content.trim() + '** ';
      case 'i':
      case 'em': return ' *' + content.trim() + '* ';
      case 'del':
      case 's': return ' ~~' + content.trim() + '~~ ';
      case 'code': return ' `' + content.trim() + '` ';
      case 'blockquote': return '\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
      case 'a': return ' [' + content.trim() + '](' + node.href + ') ';
      case 'img': return ' ![' + (node.alt || 'image') + '](' + node.src + ') ';
      case 'ul': 
      case 'ol': return '\n' + content + '\n';
      case 'table': return '\n\n' + content + '\n\n';
      case 'tbody': case 'thead': case 'tfoot': return content;
      default: return content;
    }
  }

  function createOverlay() {
    if (!highlightElement) {
      highlightElement = document.createElement('div');
      highlightElement.id = 'copygo-highlight-overlay';
      highlightElement.classList.add('copygo-highlight-overlay');
      document.body.appendChild(highlightElement);
    }
  }

  function createToolbar() {
    if (toolbarElement) return;
    toolbarElement = document.createElement('div');
    toolbarElement.id = 'copygo-toolbar';
    toolbarElement.classList.add('copygo-toolbar');
    var html = '';
    html += '<button id="cg-btn-add" title="收藏 Markdown">' + ICONS.add + ' 收藏</button>';
    html += '<div class="separator"></div>';
    html += '<button id="cg-btn-copy" title="复制 Markdown">' + ICONS.copy + ' 复制</button>';
    html += '<div class="separator"></div>';
    html += '<div class="copygo-btn-group">';
    html += '  <button id="cg-btn-export" title="导出选项">' + ICONS.export + ' 导出</button>';
    html += '  <div id="cg-export-dropdown" class="copygo-dropdown">';
    html += '    <button id="cg-btn-export-txt">导出为 TXT</button>';
    html += '    <button id="cg-btn-export-md">导出为 Markdown</button>';
    html += '  </div>';
    html += '</div>';
    html += '<div class="separator"></div>';
    html += '<button id="cg-btn-close" title="退出选择">' + ICONS.close + '</button>';
    toolbarElement.innerHTML = html;
    document.body.appendChild(toolbarElement);
    document.getElementById('cg-btn-add').addEventListener('click', handleAdd);
    document.getElementById('cg-btn-copy').addEventListener('click', handleCopy);
    document.getElementById('cg-btn-export').addEventListener('click', toggleExportDropdown);
    document.getElementById('cg-btn-export-txt').addEventListener('click', handleExportTxt);
    document.getElementById('cg-btn-export-md').addEventListener('click', handleExportMd);
    document.getElementById('cg-btn-close').addEventListener('click', handleClose);
    document.addEventListener('click', (e) => {
      const d = document.getElementById('cg-export-dropdown');
      const b = document.getElementById('cg-btn-export');
      if (d && d.classList.contains('show')) {
        if (!d.contains(e.target) && !b.contains(e.target)) {
          d.classList.remove('show'); b.classList.remove('active');
        }
      }
    });
  }

  function updateHighlight(target, locked = false) {
    if (!highlightElement) createOverlay();
    const rect = target.getBoundingClientRect();
    const st = window.pageYOffset || document.documentElement.scrollTop;
    const sl = window.pageXOffset || document.documentElement.scrollLeft;
    highlightElement.style.width = rect.width + 'px';
    highlightElement.style.height = rect.height + 'px';
    highlightElement.style.top = (rect.top + st) + 'px';
    highlightElement.style.left = (rect.left + sl) + 'px';
    highlightElement.style.display = 'block';
    if (locked) { highlightElement.classList.add('locked'); document.body.classList.remove('copygo-is-selecting'); } 
    else { highlightElement.classList.remove('locked'); document.body.classList.add('copygo-is-selecting'); }
  }

  function showToolbar(target) {
    if (!toolbarElement) createToolbar();
    const rect = target.getBoundingClientRect();
    const st = window.pageYOffset || document.documentElement.scrollTop;
    const sl = window.pageXOffset || document.documentElement.scrollLeft;
    const th = 40;
    let top = rect.top + st - th - 12;
    let left = rect.left + sl;
    if (top < st) top = rect.bottom + st + 12;
    const maxLeft = document.documentElement.scrollWidth - 320; 
    if (left > maxLeft) left = maxLeft;
    toolbarElement.style.top = top + 'px';
    toolbarElement.style.left = left + 'px';
    toolbarElement.style.display = 'flex';
    closeDropdown();
  }

  function hideToolbar() { if (toolbarElement) { toolbarElement.style.display = 'none'; closeDropdown(); } }
  function closeDropdown() {
    const d = document.getElementById('cg-export-dropdown');
    const b = document.getElementById('cg-btn-export');
    if (d) d.classList.remove('show'); if (b) b.classList.remove('active');
  }

  function resetState() {
    isLocked = false; currentTarget = null; currentText = ''; currentMarkdown = '';
    document.body.classList.remove('copygo-is-selecting');
    if (inspectorEnabled) document.body.classList.add('copygo-is-selecting');
    if (highlightElement) { highlightElement.classList.remove('locked'); highlightElement.style.display = 'none'; }
    hideToolbar();
  }

  function handleMouseOver(e) {
    if (!inspectorEnabled || isLocked) return;
    e.stopPropagation();
    if (e.target.closest('.copygo-toolbar') || e.target.closest('.copygo-highlight-overlay')) return;
    updateHighlight(e.target, false);
  }

  function handleClick(e) {
    if (!inspectorEnabled || e.target.closest('.copygo-toolbar')) return;
    e.stopPropagation(); e.preventDefault();
    if (isLocked) resetState();
    const target = e.target;
    let text = (target.innerText || target.textContent || '').trim();
    if (text) {
      try {
        currentMarkdown = domToMarkdown(target).trim().replace(/\n{3,}/g, '\n\n');
        isLocked = true; currentTarget = target; currentText = text;
        updateHighlight(target, true); showToolbar(target);
      } catch (err) {
        console.error('CopyGo Extraction Error:', err);
        showToastAt(e.clientX, e.clientY, '提取失败');
        updateHighlight(target, false);
      }
    }
  }

  function handleAdd(e) {
    if (!currentMarkdown) return;
    saveTextToStorage(currentMarkdown);
    showToast(e.target, '已收藏');
    handleClose(); 
  }

  function handleCopy(e) {
    if (!currentMarkdown) return;
    navigator.clipboard.writeText(currentMarkdown).then(() => {
      showToast(e.target, '已复制');
      handleClose();
    });
  }

  function toggleExportDropdown(e) {
    e.stopPropagation(); 
    const d = document.getElementById('cg-export-dropdown');
    const b = document.getElementById('cg-btn-export');
    if (d.classList.contains('show')) { d.classList.remove('show'); b.classList.remove('active'); } 
    else { d.classList.add('show'); b.classList.add('active'); }
  }

  function handleExportTxt(e) {
    e.stopPropagation();
    const rect = document.getElementById('cg-btn-export').getBoundingClientRect();
    downloadFile(currentText, 'selection.txt', 'text/plain');
    showToastAt(rect.left, rect.top, '下载 TXT'); 
    handleClose();
  }

  function handleExportMd(e) {
    e.stopPropagation();
    const rect = document.getElementById('cg-btn-export').getBoundingClientRect();
    downloadFile(currentMarkdown, 'selection.md', 'text/markdown');
    showToastAt(rect.left, rect.top, '下载 MD');
    handleClose();
  }

  function handleClose() {
    toggleInspector(false);
    chrome.runtime.sendMessage({ action: 'inspectorDisabled' }).catch(() => {});
  }

  function showToast(btn, msg) { if (btn) { const r = btn.getBoundingClientRect(); showToastAt(r.left, r.top, msg); } }
  function showToastAt(x, y, msg) {
    const t = document.createElement('div');
    t.className = 'copygo-toast'; t.textContent = msg;
    t.style.top = (y + window.scrollY - 30) + 'px';
    t.style.left = (x + window.scrollX) + 'px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }

  function downloadFile(content, filename, contentType) {
    chrome.runtime.sendMessage({ action: 'download', content, filename, contentType }, (r) => {
      if (chrome.runtime.lastError) alert('下载失败: ' + chrome.runtime.lastError.message);
    });
  }

  function saveTextToStorage(md) {
    chrome.storage.local.get(['copyGoItems'], (res) => {
      const items = res.copyGoItems || [];
      items.push(md);
      chrome.storage.local.set({ copyGoItems: items }, () => {
        chrome.runtime.sendMessage({ action: 'newItemAdded' }).catch(() => {});
      });
    });
  }

  function toggleInspector(state) {
    inspectorEnabled = state;
    if (inspectorEnabled) {
      document.body.classList.add('copygo-inspector-active');
      document.body.classList.add('copygo-is-selecting');
      window.addEventListener('mouseover', handleMouseOver, true);
      window.addEventListener('click', handleClick, true);
      chrome.runtime.sendMessage({ action: 'inspectorEnabled' }).catch(() => {});
    } else {
      document.body.classList.remove('copygo-inspector-active');
      document.body.classList.remove('copygo-is-selecting');
      window.removeEventListener('mouseover', handleMouseOver, true);
      window.removeEventListener('click', handleClick, true);
      resetState();
      chrome.runtime.sendMessage({ action: 'inspectorDisabled' }).catch(() => {});
    }
  }

  chrome.runtime.onMessage.addListener((req, s, res) => {
    if (req.action === 'toggleInspector') { toggleInspector(req.state); res({ result: 'success' }); }
    else if (req.action === 'getStatus') { res({ isActive: inspectorEnabled }); }
  });

  let curShortcut = 'Alt+X';
  chrome.storage.local.get(['copyGoShortcut'], (r) => { if (r.copyGoShortcut) curShortcut = r.copyGoShortcut; });
  chrome.storage.onChanged.addListener((c, ns) => { if (ns === 'local' && c.copyGoShortcut) curShortcut = c.copyGoShortcut.newValue; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (inspectorEnabled) handleClose(); return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return; 
    const p = []; if (e.ctrlKey) p.push('Ctrl'); if (e.altKey) p.push('Alt'); if (e.shiftKey) p.push('Shift'); if (e.metaKey) p.push('Command');
    let k = e.key.toUpperCase(); if (k === ' ') k = 'Space'; p.push(k);
    if (p.join('+') === curShortcut) { e.preventDefault(); toggleInspector(!inspectorEnabled); }
  });
})();