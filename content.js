(function() {
  if (window.copyGoInjected) return;
  window.copyGoInjected = true;

  let inspectorEnabled = false;
  let isLocked = false;
  let hoverOverlay = null;
  let lockedOverlays = [];
  let selectedTargets = new Set();
  let toolbarElement = null;
  let currentText = '';
  let currentMarkdown = '';
  let toolbarFollowActive = false;
  let toolbarFollowRaf = 0;

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

  function createHoverOverlay() {
    if (!hoverOverlay) {
      hoverOverlay = document.createElement('div');
      hoverOverlay.id = 'copygo-hover-overlay';
      hoverOverlay.classList.add('copygo-highlight-overlay');
      document.body.appendChild(hoverOverlay);
    }
  }

  function updateHoverHighlight(target) {
    if (!hoverOverlay) createHoverOverlay();
    const rect = target.getBoundingClientRect();
    const st = window.pageYOffset || document.documentElement.scrollTop;
    const sl = window.pageXOffset || document.documentElement.scrollLeft;
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
    hoverOverlay.style.top = (rect.top + st) + 'px';
    hoverOverlay.style.left = (rect.left + sl) + 'px';
    hoverOverlay.style.display = 'block';
    if (!isLocked) {
        document.body.classList.add('copygo-is-selecting');
    }
  }

  function hideHoverHighlight() {
    if (hoverOverlay) hoverOverlay.style.display = 'none';
  }

  function updateLockedOverlays() {
    lockedOverlays.forEach(el => el.remove());
    lockedOverlays = [];

    selectedTargets.forEach(target => {
      const overlay = document.createElement('div');
      overlay.className = 'copygo-highlight-overlay locked';
      document.body.appendChild(overlay);
      const rect = target.getBoundingClientRect();
      const st = window.pageYOffset || document.documentElement.scrollTop;
      const sl = window.pageXOffset || document.documentElement.scrollLeft;
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.top = (rect.top + st) + 'px';
      overlay.style.left = (rect.left + sl) + 'px';
      overlay.style.display = 'block';
      lockedOverlays.push(overlay);
    });

    if (selectedTargets.size > 0) {
      document.body.classList.remove('copygo-is-selecting');
    } else if (inspectorEnabled) {
      document.body.classList.add('copygo-is-selecting');
    }
  }

  function createToolbar() {
    if (toolbarElement) return;
    toolbarElement = document.createElement('div');
    toolbarElement.id = 'copygo-toolbar';
    toolbarElement.classList.add('copygo-toolbar');
    var html = '';
    html += '<button id="cg-btn-add" title="收藏 Markdown (按住Shift多选)">' + ICONS.add + ' <span>收藏</span></button>';
    html += '<div class="separator"></div>';
    html += '<button id="cg-btn-copy" title="复制 Markdown (按住Shift多选)">' + ICONS.copy + ' <span>复制</span></button>';
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

  function updateToolbarIndicators() {
      if (!toolbarElement) return;
      const count = selectedTargets.size;
      const bText = document.querySelector('#cg-btn-copy span');
      if (bText) bText.innerText = count > 1 ? `复制 (${count})` : '复制';
      const aText = document.querySelector('#cg-btn-add span');
      if (aText) aText.innerText = count > 1 ? `收藏 (${count})` : '收藏';
  }

  function getVisibleUnionRect() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let union = null;
    selectedTargets.forEach((el) => {
      if (!el || !el.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      if (!union) {
        union = { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
      } else {
        union.top = Math.min(union.top, r.top);
        union.left = Math.min(union.left, r.left);
        union.right = Math.max(union.right, r.right);
        union.bottom = Math.max(union.bottom, r.bottom);
      }
    });
    if (!union) {
      return { top: vh / 2 - 20, bottom: vh / 2 + 20, left: 16, right: vw - 16, visible: false };
    }
    const top = Math.max(union.top, 0);
    const bottom = Math.min(union.bottom, vh);
    const left = Math.max(union.left, 0);
    const right = Math.min(union.right, vw);
    if (bottom <= top || right <= left) {
      const nearTop = union.bottom < 0;
      const y = nearTop ? 12 : (union.top > vh ? vh - 56 : vh / 2 - 22);
      return {
        top: y,
        bottom: y + 44,
        left: Math.max(16, Math.min(union.left, vw - 16)),
        right: Math.max(16, Math.min(union.right, vw - 16)),
        visible: false
      };
    }
    return { top, bottom, left, right, visible: true };
  }

  function positionToolbar() {
    if (!toolbarElement || toolbarElement.style.display === 'none') return;
    const gap = 12;
    const vis = getVisibleUnionRect();
    const tw = toolbarElement.offsetWidth || 300;
    const th = toolbarElement.offsetHeight || 44;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = vis.top - th - gap;
    if (top < gap) top = vis.bottom + gap;
    if (top + th > vh - gap || top < gap) {
      top = Math.min(vis.bottom, vh) - th - gap;
      if (top < gap) top = gap;
      if (top + th > vh - gap) top = Math.max(gap, vh - th - gap);
    }

    let left = vis.left;
    if (left + tw > vw - gap) left = vw - tw - gap;
    if (left < gap) left = gap;

    toolbarElement.style.top = top + 'px';
    toolbarElement.style.left = left + 'px';
  }

  function onToolbarFollowEvent() {
    if (toolbarFollowRaf) return;
    toolbarFollowRaf = requestAnimationFrame(() => {
      toolbarFollowRaf = 0;
      if (!isLocked || !toolbarElement || toolbarElement.style.display === 'none') return;
      closeDropdown();
      positionToolbar();
    });
  }

  function startToolbarFollow() {
    if (toolbarFollowActive) return;
    toolbarFollowActive = true;
    window.addEventListener('scroll', onToolbarFollowEvent, true);
    window.addEventListener('resize', onToolbarFollowEvent);
  }

  function stopToolbarFollow() {
    if (!toolbarFollowActive) return;
    toolbarFollowActive = false;
    window.removeEventListener('scroll', onToolbarFollowEvent, true);
    window.removeEventListener('resize', onToolbarFollowEvent);
    if (toolbarFollowRaf) {
      cancelAnimationFrame(toolbarFollowRaf);
      toolbarFollowRaf = 0;
    }
  }

  function showToolbar() {
    if (!toolbarElement) createToolbar();
    toolbarElement.style.display = 'flex';
    closeDropdown();
    positionToolbar();
    startToolbarFollow();
  }

  function hideToolbar() {
    stopToolbarFollow();
    if (toolbarElement) {
      toolbarElement.style.display = 'none';
      closeDropdown();
    }
  }
  function closeDropdown() {
    const d = document.getElementById('cg-export-dropdown');
    const b = document.getElementById('cg-btn-export');
    if (d) d.classList.remove('show'); if (b) b.classList.remove('active');
  }

  function resetState() {
    isLocked = false; 
    selectedTargets.clear();
    currentText = ''; 
    currentMarkdown = '';
    
    document.body.classList.remove('copygo-is-selecting');
    if (inspectorEnabled) document.body.classList.add('copygo-is-selecting');
    
    hideHoverHighlight();
    lockedOverlays.forEach(el => el.remove());
    lockedOverlays = [];
    
    hideToolbar();
  }

  function handleMouseOver(e) {
    if (!inspectorEnabled) return;
    if (isLocked && !e.shiftKey) return; 
    e.stopPropagation();
    if (e.target.closest('.copygo-toolbar') || e.target.closest('.copygo-highlight-overlay')) return;
    updateHoverHighlight(e.target);
  }

  function handleClick(e) {
    if (!inspectorEnabled || e.target.closest('.copygo-toolbar')) return;
    e.stopPropagation(); e.preventDefault();
    
    let isMultiSelect = e.shiftKey;
    if (isLocked && !isMultiSelect) resetState();
    
    const target = e.target;
    if (isMultiSelect && selectedTargets.has(target)) {
        selectedTargets.delete(target);
        if (selectedTargets.size === 0) {
            resetState();
            return;
        }
    } else {
        selectedTargets.add(target);
    }
    
    try {
        const sortedTargets = Array.from(selectedTargets).sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
        });

        currentMarkdown = '';
        currentText = '';
        sortedTargets.forEach(el => {
            let text = (el.innerText || el.textContent || '').trim();
            if (text) {
                currentText += text + '\n\n';
                currentMarkdown += domToMarkdown(el).trim().replace(/\n{3,}/g, '\n\n') + '\n\n';
            }
        });
        currentText = currentText.trim();
        currentMarkdown = currentMarkdown.trim();

        if (currentText) {
            isLocked = true; 
            hideHoverHighlight();
            updateLockedOverlays();
            showToolbar(target);
            updateToolbarIndicators();
        } else {
            selectedTargets.delete(target);
            if (selectedTargets.size === 0) resetState();
        }
    } catch (err) {
        console.error('CopyGo Extraction Error:', err);
        showToastAt(e.clientX, e.clientY, '提取失败');
        selectedTargets.delete(target);
        if (selectedTargets.size > 0) updateLockedOverlays();
        else resetState();
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

  document.addEventListener('keyup', (e) => {
    if (inspectorEnabled && isLocked && e.key === 'Shift') {
        hideHoverHighlight();
    }
  });
})();