# CopyGo - 复制页面文字给你的 AI 们

一个强大的浏览器扩展，让你像开发者工具一样选择网页元素，提取文字并复制或导出为 TXT 或 Markdown 格式。非常适合将网页内容快速整理后发送给 AI 助手。

Chrome浏览器：[Chrome浏览器插件地址](https://chromewebstore.google.com/detail/copygo-%E5%A4%8D%E5%88%B6%E9%A1%B5%E9%9D%A2%E6%96%87%E5%AD%97%E7%BB%99%E4%BD%A0%E7%9A%84-ai-%E4%BB%AC/cimljhjgmdkgldpaklejmgmkmbjlmham)

EDGE浏览器：[EDGE浏览器插件地址](https://microsoftedge.microsoft.com/addons/detail/copygo-%E5%A4%8D%E5%88%B6%E9%A1%B5%E9%9D%A2%E6%96%87%E5%AD%97%E7%BB%99%E4%BD%A0%E7%9A%84-ai-%E4%BB%AC/cbpijekabpeepjfaiagehegmolmdpckd)

## ✨ 功能特性

- **元素选择器** - 类似开发者工具的元素选择体验，悬停高亮，点击锁定
- **智能提取** - 自动提取选中元素的文本内容
- **Markdown 转换** - 将网页 DOM 结构智能转换为 Markdown 格式
  - 支持标题 (h1-h6)
  - 支持列表 (ul/ol) 和嵌套列表
  - 支持表格（包括对齐方式）
  - 支持代码块和行内代码
  - 支持链接、图片、引用等
- **多种操作方式**
  - 📋 复制到剪贴板
  - ⭐ 收藏到本地存储
  - 📥 导出为 TXT 文件
  - 📥 导出为 Markdown 文件
- **快捷键支持** - 可自定义快捷键（默认 `Alt+X`）
- **批量导出** - 可将所有收藏的内容批量导出

## 🚀 安装方法

### 方式一：开发者模式安装（推荐）

1. 下载或克隆此项目到本地
2. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/` 或 `edge://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目文件夹

### 方式二：打包安装

1. 在扩展管理页面点击「打包扩展程序」
2. 选择项目文件夹
3. 生成 `.crx` 文件后拖拽到浏览器安装

## 📖 使用指南

### 基本操作

1. **开启选择模式**
   - 点击扩展图标，在弹窗中点击「开启选择模式」
   - 或使用快捷键（默认 `Alt+X`）

2. **选择元素**
   - 鼠标悬在网页元素上会显示高亮边框
   - 点击想要提取的元素

3. **操作工具栏**
   - ⭐ **收藏** - 将内容保存到扩展的收藏列表
   - 📋 **复制** - 将 Markdown 格式内容复制到剪贴板
   - 📥 **导出** - 选择导出为 TXT 或 Markdown 文件
   - ❌ **关闭** - 退出选择模式

4. **管理收藏**
   - 在扩展弹窗中查看所有收藏的内容
   - 点击 × 删除单个收藏
   - 点击「清空全部」删除所有收藏
   - 批量导出所有收藏内容

### 自定义快捷键

1. 点击扩展图标
2. 点击「设置」按钮
3. 在快捷键输入框中按下你想要的组合键
4. 点击「重置」可恢复默认快捷键（`Alt+X`）

## 🎯 使用场景

- **AI 对话准备** - 快速提取网页内容，整理后给 AI 分析
- **文档整理** - 将网页文章转换为 Markdown 格式保存
- **内容收集** - 浏览时收藏感兴趣的内容片段
- **数据提取** - 从网页表格中提取结构化数据

## 📁 项目结构

```
CopyGo/
├── manifest.json       # 扩展配置文件
├── background.js       # 后台服务（处理下载）
├── content.js          # 内容脚本（元素选择、DOM 转换）
├── content.css         # 内容脚本样式
├── popup.html          # 弹窗界面
├── popup.js            # 弹窗逻辑
├── popup.css           # 弹窗样式
└── icons/              # 扩展图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🔧 技术栈

- **Manifest V3** - 最新的扩展规范
- **Vanilla JavaScript** - 纯原生 JS，无依赖
- **Chrome Extension APIs**
  - `chrome.scripting` - 动态注入脚本
  - `chrome.storage` - 本地数据存储
  - `chrome.downloads` - 文件下载
  - `chrome.tabs` - 标签页操作

## 📝 开发说明

### 本地开发

1. 修改代码后，在扩展管理页面点击「重新加载」
2. 或使用快捷键 `Ctrl+R` 刷新扩展

### 调试

- **弹窗调试** - 右键点击扩展图标 → 检查弹出内容
- **内容脚本调试** - 在网页上按 `F12`，在 Console 中查看日志
- **后台脚本调试** - 在扩展管理页面点击「Service Worker」

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

感谢所有使用和反馈的用户！

---

**CopyGo** - 让网页内容提取变得简单高效
