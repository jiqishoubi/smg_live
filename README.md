# 收看SMG电视频道直播<br>
可自由观看SMG电视频道直播

# 安装
需要浏览器装有 [Tampermonkey](https://tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 插件, 点击下方表格中安装，即可安装脚本.

|正式版 (GitHub 源)                                                                           |
|---------------------------------------------------------------------------------------------|
| [安装](https://raw.githubusercontent.com/Popukok/smg_live/refs/heads/main/smg_fivestar.user.js)  |

安完脚本后[点击打开看看新闻](https://live.kankanews.com/huikan?id=10)，点击对应的频道即可观看节目<br>
<br>
**例如收看体育频道的比赛直播，可以跳过以下图片提示**

![这是图片](https://p.statickksmg.com/cont/2023/10/08/image_1696731269_qOxBpp34.jpg "")

# 兼容性
### [Tampermonkey](https://tampermonkey.net/) / [Violentmonkey](https://violentmonkey.github.io/)
兼容, 但在较旧的浏览器中 Violentmonkey 可能无法运行此脚本.
支持**最新版** Chrome, Firefox, Safari.

### Safari（macOS / iOS）
从 v0.16 起已针对 Safari 做兼容适配：
- **macOS Safari**：使用 [Tampermonkey](https://tampermonkey.net/) 或免费的 [Userscripts App](https://apps.apple.com/app/userscripts/id1463198887) 加载脚本
- **iOS / iPadOS Safari**（需 iOS 15+）：安装 [Userscripts App](https://apps.apple.com/app/userscripts/id1463198887) 或 Tampermonkey，在「设置 → Safari → 扩展」中启用，并允许访问 `kankanews.com`，然后导入脚本即可
- iPhone 上全屏会自动使用 iOS 原生视频全屏；CSS 兜底全屏已适配动态视口（dvh/dvw）与安全区域（刘海 / Home 指示条）

> ⚠️ 安装后建议在管理器中**关闭此脚本的自动更新**，否则会从 GitHub 拉取上游原版覆盖本地改动。

# 移动端
支持在移动端收看，前提是移动端浏览器支持 **[Tampermonkey](https://tampermonkey.net/)** 插件，<br>并且支持运行 **[Tampermonkey](https://tampermonkey.net/)** 脚本

💎  **如何选择**

*   如果你希望**安装过程最接近电脑上的Chrome体验**，能直接从Chrome网上应用店安装各种扩展，**Kiwi Browser** ，**Chrome Browser** , **Edge Browser** 是很不错的选择。
*   如果你看重**国产浏览器且对Chrome和Edge扩展生态的兼容性**，**狐猴浏览器**值得考虑。
*   如果你**习惯使用Firefox桌面版**，或者看重**开源生态**，那么**Firefox for Android** 会很适合你。
*   **X浏览器**则以其**轻量级、无广告**的特点，并支持油猴脚本，吸引了部分用户。
*   如果你使用的是 **iPhone / iPad**，可直接用 **Safari + Userscripts App** 或 **Tampermonkey**，无需更换浏览器。

# 脚本仅供学习交流

💎在苹果设备上怎么用

macOS Safari（两种任选）：
Userscripts（免费开源，推荐）：App Store 搜 "Userscripts" 安装 → Safari 设置 → 扩展里启用它 → 打开 Userscripts App 设定脚本目录 → 把 smg_fivestar.user.js 拷进该目录即可。
Tampermonkey：App Store 安装 Tampermonkey → Safari 设置 → 扩展启用并允许访问网站 → 双击/拖入 .user.js 或访问脚本链接，点"安装"。

iPhone / iPad（需 iOS 15+）：
App Store 装 Userscripts（免费）或 Tampermonkey；
设置 → Safari → 扩展 → 启用该扩展，并允许它访问 kankanews.com；
用"文件" App 把 smg_fivestar.user.js 放到 Userscripts 的脚本目录（App 内有图示说明），或在 Safari 里打开脚本链接通过分享菜单导入；
访问 https://live.kankanews.com/huikan?id=10 ，点频道即可

