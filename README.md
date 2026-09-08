# SMG 网页直播观看增强

在浏览器端为 SMG 视频直播页面提供更顺畅的观看体验，并对部分浏览器环境做兼容性优化。

# 说明

26.08.21 ---> 去掉了接口返回M3U8地址，可能出于业务需求，保留体育新闻回看。

26.09.08 ---> 地址由火山（volc-stream）改为腾讯（tencent-vods），回看（timeshift）和直播（token）改为两套路径，封堵升级。

# 安装

1. 浏览器安装 [Tampermonkey](https://tampermonkey.net/) 扩展（**推荐**）
2. 点击下方链接安装脚本

| 正式版 (GitHub 源)                                                                           |
|---------------------------------------------------------------------------------------------|
| [安装](https://raw.githubusercontent.com/Popukok/smg_live/refs/heads/main/smg_fivestar.user.js)  |

3. 打开 [SMG 直播页面](https://live.kankanews.com/huikan?id=10)，选择频道即可观看

# 兼容性

支持**最新版** Chrome、Firefox、Safari，脚本管理器推荐使用 [Tampermonkey](https://tampermonkey.net/)。

> ⚠️ 由于两款插件存在技术差异，基于 Tampermonkey（油猴）开发的脚本，在 Violentmonkey（暴力猴）上可能存在兼容性问题，**建议使用油猴插件**。

### Safari（macOS / iOS）

- **macOS Safari**：使用 [Tampermonkey](https://tampermonkey.net/) 或免费的 [Userscripts App](https://apps.apple.com/app/userscripts/id1463198887) 加载脚本
- **iOS / iPadOS Safari**（需 iOS 15+）：安装 [Userscripts App](https://apps.apple.com/app/userscripts/id1463198887) 或 Tampermonkey，在「设置 → Safari → 扩展」中启用并允许访问 `kankanews.com`，导入脚本即可
- iPhone 全屏使用 iOS 原生视频全屏；CSS 全屏已适配动态视口（dvh/dvw）与安全区域（刘海 / Home 指示条）

> ⚠️ 若自行修改过脚本，建议在管理器中**关闭自动更新**，避免被上游版本覆盖本地改动。

# 移动端

在支持用户脚本的移动浏览器中均可使用（Android 端此类浏览器通常内置 Violentmonkey，请一并留意上方兼容性提示）：

- **Kiwi Browser**、**Chrome**、**Edge**：安装体验与桌面端最接近
- **Firefox for Android**：支持扩展与脚本
- **X浏览器**：轻量、支持用户脚本
- **iPhone / iPad**：直接使用 Safari + Userscripts App 或 Tampermonkey，无需更换浏览器

# 苹果设备使用说明

**macOS Safari**（二选一）：
- Userscripts（免费开源，推荐）：App Store 安装 → Safari 设置 → 扩展中启用 → 打开 Userscripts App 设定脚本目录 → 将 `smg_fivestar.user.js` 放入该目录
- Tampermonkey：App Store 安装 → Safari 设置 → 扩展中启用并允许访问网站 → 导入脚本

**iPhone / iPad（需 iOS 15+）**：
1. App Store 安装 Userscripts（免费）或 Tampermonkey
2. 设置 → Safari → 扩展 → 启用并允许访问 `kankanews.com`
3. 将 `smg_fivestar.user.js` 放入 Userscripts 的脚本目录（或经分享菜单导入）
4. 打开 [SMG 直播页面](https://live.kankanews.com/huikan?id=10) 选择频道即可

本仓库内容仅供学习交流。
