// ==UserScript==
// @name             收看SMGTV电视节目
// @namespace        http://tampermonkey.net/
// @version          0.15
// @description      收看SMGTV，并解除页面部分限制
// @author           https://github.com/Popukok
// @match            *://*.kankanews.com/huikan*
// @icon             https://live.kankanews.com/favicon.ico
// @updateURL        https://raw.githubusercontent.com/Popukok/smg_live/refs/heads/main/smg_fivestar.user.js
// @downloadURL      https://raw.githubusercontent.com/Popukok/smg_live/refs/heads/main/smg_fivestar.user.js
// @grant            none
// @run-at           document-start
// ==/UserScript==


(function() {
    'use strict';
    const STYLE_ID = 'smgtv-unlock-style';
    const VIDEO_READY_CLASS = 'smgtv-video-ready';
    const FULLSCREEN_FALLBACK_CLASS = 'smgtv-fallback-fullscreen';
    const FULLSCREEN_TARGET_CLASS = 'smgtv-fallback-fullscreen-target';
    const FULLSCREEN_BUTTON_SELECTOR = '.xgplayer-fullscreen';
    const VIDEO_READY_EVENTS = ['loadeddata', 'canplay', 'playing', 'timeupdate', 'progress'];
    const VIDEO_RESET_EVENTS = ['loadstart', 'waiting', 'stalled', 'emptied'];
    const watchedVideos = new WeakSet();
    const streamAddressCache = Object.create(null);
    let fullscreenFallbackTarget = null;
    let cssFullscreenFallbackPlayer = null;
    let lastFullscreenActionAt = 0;
    const logThrottle = Object.create(null);
    function throttleLog(key, intervalMs, fn) {
        const now = Date.now();
        if ((logThrottle[key] || 0) + intervalMs > now) {
            return;
        }
        logThrottle[key] = now;
        fn();
    }
    function rememberStreamAddresses(channelId, liveAddress, shiftAddress) {
        if (channelId == null || channelId === '') {
            return;
        }
        const key = String(channelId);
        const prev = streamAddressCache[key] || { live_address: '', shift_address: '' };
        streamAddressCache[key] = {
            live_address: liveAddress || prev.live_address || '',
            shift_address: shiftAddress || prev.shift_address || ''
        };
    }
    function fillStreamAddresses(target, channelId) {
        if (!target) {
            return false;
        }
        const cached = streamAddressCache[String(channelId)] || {};

        const channelLiveAddress = cached.live_address || cached.shift_address;
        const channelShiftAddress = cached.shift_address || cached.live_address;
        if (channelLiveAddress && !target.live_address) {
            target.live_address = channelLiveAddress;
        }
        if (channelShiftAddress && !target.shift_address) {
            target.shift_address = channelShiftAddress;
        }

    }
    function getResultChannelId(result) {
        return result?.channel_id || result?.channel_info?.id || result?.id;
    }
    function forceOpenProgram(program) {
        if (!program) {
            return;
        }
        program.is_shield = 0;
        program.can_review = 1;
        program.is_review = 1;
        // 注意：不能动 isOutDate。前端 handleProgramList 用它标记"未到播出时间"的节目
        // （now < start_time → isOutDate=1，灰掉不可点），强改为 0 会解锁未开播节目。
    }
    function forceOpenProgramList(component) {
        if (!component) {
            return;
        }
        ['currentProgramList', 'playingProgramList', 'slitProgramList'].forEach(key => {
            const list = component[key];
            if (!Array.isArray(list)) {
                return;
            }
            list.forEach(program => {
                if (program && (program.is_shield !== 0 || program.can_review !== 1 || program.is_review !== 1)) {
                    forceOpenProgram(program);
                }
            });
        });
        const detailPrograms = component.programDetail?.program_list;
        if (Array.isArray(detailPrograms)) {
            detailPrograms.forEach(program => forceOpenProgram(program));
        }
    }
    function ensurePlayableStream(component) {
        if (!component) {
            return;
        }
        forceOpenProgram(component.programObj);
        const channelDetail = component.currChannelDetail;
        if (channelDetail) {
            rememberStreamAddresses(channelDetail.id, channelDetail.live_address, channelDetail.shift_address);
        }
        const detail = component.programDetail;
        if (!detail) {
            return;
        }
        forceOpenProgram(detail);
        if (detail.is_exist_pad && !(detail.pad_video_info && detail.pad_video_info.play_url)) {
            detail.is_exist_pad = 0;
            detail.pad_src = '';
        }
        const channelInfo = detail.channel_info || (detail.channel_info = {});
        const channelId = getResultChannelId(detail) || channelDetail?.id;
        if (channelDetail) {
            if (channelDetail.live_address) {
                channelInfo.live_address = channelDetail.live_address;
            }
            if (channelDetail.shift_address) {
                channelInfo.shift_address = channelDetail.shift_address;
            }
        }
        fillStreamAddresses(channelInfo, channelId);
    }
    function installReplayUrlPatch(component) {
        const XGPlayer = component.$xgplayer;
        if (!XGPlayer || component.__smgReplayPatchInstalled) {
            return;
        }
        component.__smgReplayPatchInstalled = true;
        // 接口不再返回 shift_address
        component.$xgplayer = new Proxy(XGPlayer, {
            construct(target, args) {
                const config = args[0] || {};
                const program = component.programObj;
                if (config.isLive === false && config.url && typeof config.url === 'string') {
                    const startTime = program?.start_time;
                    const endTime = program?.end_time;
                    if (startTime && endTime && /\.m3u8/.test(config.url) && !/\bstart=\d/.test(config.url)) {
                        const sep = config.url.includes('?') ? '&' : '?';
                        config.url = config.url + sep + 'start=' + startTime + '&end=' + endTime;
                        console.log('[SMGTV] 已获取到播放地址');
                    }
                }
                return new target(...args);
            }
        });
    }
    function recoverPlayerIfNeeded(component) {
        if (!component || typeof component.initPlayer !== 'function' || component.__smgRecovering) {
            return;
        }
        const video = getPlayerVideo(component);
        const mediaError = video?.error;
        if (!(component.player && mediaError && mediaError.code === 4)) {
            return;
        }
        ensurePlayableStream(component);
        const hasLive = !!(component.programDetail?.channel_info?.live_address ||
            component.currChannelDetail?.live_address);
        if (!hasLive) {
            return;
        }
        component.__smgRecoverCount = (component.__smgRecoverCount || 0) + 1;
        if (component.__smgRecoverCount > 3) {
            return;
        }
        component.__smgRecovering = true;
        console.log('[SMGTV] 检测到无效播放地址，正在重新初始化播放器');
        component.initPlayer({ changeCurrentList: false, isPlay: true, trigger: 'click' });
        setTimeout(() => {
            component.__smgRecovering = false;
        }, 2000);
    }
    function injectStyle(cssText) {
        const appendStyle = () => {
            if (document.getElementById(STYLE_ID)) {
                return;
            }
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = cssText;
            (document.head || document.documentElement).appendChild(style);
        };
        if (document.head || document.documentElement) {
            appendStyle();
        } else {
            document.addEventListener('DOMContentLoaded', appendStyle, { once: true });
        }
    }
    function getVueInstance(el) {
        return el?.__vue__ || el?.__vueParentComponent?.proxy || null;
    }
    function isTVComponent(instance) {
        return !!instance && (
            typeof instance.initPlayer === 'function' ||
            typeof instance.playProgram === 'function' ||
            typeof instance.setLiveTimer === 'function' ||
            ('isLoading' in instance && 'player' in instance)
        );
    }
    function findComponentFromElement(el) {
        let current = el;
        while (current) {
            const instance = getVueInstance(current);
            if (isTVComponent(instance)) {
                return instance;
            }
            current = current.parentElement;
        }
        return null;
    }
    function findTVComponent() {
        const selectors = ['.huikan', '.live-container', '.live-box', '.live-player', '.tv', '.player-box'];
        for (const selector of selectors) {
            const component = findComponentFromElement(document.querySelector(selector));
            if (component) {
                return component;
            }
        }
        return null;
    }
    function getPlayerVideo(component) {
        const player = component?.player;
        return player?.video ||
            player?.media ||
            player?.root?.querySelector?.('video') ||
            component?.$refs?.livePlayer?.querySelector?.('video') ||
            document.querySelector('.live-player video, .player-box video, .xgplayer video, video');
    }
    function isVideoReady(video) {
        return !!video && !video.error && (
            video.readyState >= 2 ||
            (!video.paused && video.currentTime > 0)
        );
    }
    function setVideoReadyClass(isReady) {
        const target = document.body || document.documentElement;
        target?.classList?.toggle(VIDEO_READY_CLASS, isReady);
    }
    function syncLoadingState(component) {
        forceOpenProgramList(component);
        recoverPlayerIfNeeded(component);
        const video = getPlayerVideo(component);
        if (video) {
            watchPlayerVideo(component, video);
        }
        const isReady = isVideoReady(video);
        setVideoReadyClass(isReady);
        if (isReady && component && component.isLoading) {
            component.isLoading = false;
        }
        return isReady;
    }
    function watchPlayerVideo(component, video) {
        if (!video || watchedVideos.has(video)) {
            return;
        }
        watchedVideos.add(video);
        const markReady = () => syncLoadingState(component);
        const resetReady = () => {
            if (!isVideoReady(video)) {
                setVideoReadyClass(false);
            }
        };
        VIDEO_READY_EVENTS.forEach(eventName => {
            video.addEventListener(eventName, markReady, { passive: true });
        });
        VIDEO_RESET_EVENTS.forEach(eventName => {
            video.addEventListener(eventName, resetReady, { passive: true });
        });
        markReady();
    }
    function cleanupComponent(component) {
        if (!component) {
            return;
        }
        if (component.__smgLoadingMonitor) {
            clearInterval(component.__smgLoadingMonitor);
            component.__smgLoadingMonitor = null;
        }
        if (component.__smgLoadingObserver) {
            component.__smgLoadingObserver.disconnect();
            component.__smgLoadingObserver = null;
        }
        if (component.pageVisibilityChange) {
            document.removeEventListener('visibilitychange', component.pageVisibilityChange);
        }
    }
    function startLoadingMonitor(component) {
        if (!component || component.__smgLoadingMonitor) {
            return;
        }
        component.__smgLoadingMonitor = setInterval(() => {
            const rootEl = component.$el;
            if (rootEl && !rootEl.isConnected) {
                // 组件已销毁：清理定时器与观察器，避免长期持有组件引用
                cleanupComponent(component);
                initComponentPatch();
                return;
            }
            syncLoadingState(component);
        }, 500);
        if (component.$refs?.livePlayer && !component.__smgLoadingObserver) {
            component.__smgLoadingObserver = new MutationObserver(() => syncLoadingState(component));
            component.__smgLoadingObserver.observe(component.$refs.livePlayer, {
                childList: true,
                subtree: true
            });
        }
    }
    function getBrowserFullscreenElement() {
        return document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            null;
    }
    function requestElementFullscreen(el) {
        if (!el) {
            return Promise.reject(new Error('missing fullscreen target'));
        }
        const request =
            el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.webkitRequestFullScreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen;
        if (!request) {
            return Promise.reject(new Error('fullscreen api unavailable'));
        }
        try {
            const result = request.call(el);
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    function exitBrowserFullscreen() {
        const exit =
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.webkitCancelFullScreen ||
            document.mozCancelFullScreen ||
            document.msExitFullscreen;
        if (!exit) {
            return Promise.resolve();
        }
        try {
            const result = exit.call(document);
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    function getFullscreenTarget(component, button) {
        return component?.player?.root ||
            button?.closest?.('.xgplayer') ||
            component?.$refs?.livePlayer?.querySelector?.('.xgplayer') ||
            component?.$refs?.livePlayer ||
            document.querySelector('.live-player .xgplayer, .player-box .xgplayer, .xgplayer, .live-player, .player-box');
    }
    function syncFullscreenButtonState(component, isFullscreen) {
        // 不能写 player.fullscreen：那是 xgplayer 内部状态，它靠它在 fullscreenchange
        // 里决定退出全屏时是否恢复样式。抢写会让 xgplayer 跳过样式恢复，把
        // xgplayer-is-fullscreen 残留下来，表现为退出全屏后播放器变成网页全屏盖住整页。
        document.querySelectorAll(FULLSCREEN_BUTTON_SELECTOR).forEach(button => {
            button.setAttribute('data-state', isFullscreen ? 'full' : 'normal');
        });
    }
    function enterFallbackFullscreen(target, component) {
        if (!target) {
            return;
        }
        const player = component?.player;
        if (player && typeof player.getCssFullscreen === 'function') {
            try {
                player.getCssFullscreen(target);
                cssFullscreenFallbackPlayer = player;
                syncFullscreenButtonState(component, true);
                console.log('[SMGTV] 已启用 xgplayer CSS 全屏兜底');
                return;
            } catch (e) {
                console.warn('[SMGTV] xgplayer CSS 全屏失败，使用样式兜底', e);
            }
        }
        exitFallbackFullscreen(component);
        fullscreenFallbackTarget = target;
        target.classList.add(FULLSCREEN_TARGET_CLASS);
        document.body?.classList.add(FULLSCREEN_FALLBACK_CLASS);
        syncFullscreenButtonState(component, true);
        console.log('[SMGTV] 已启用 CSS 全屏兜底');
    }
    function exitFallbackFullscreen(component) {
        const player = component?.player || cssFullscreenFallbackPlayer;
        if (cssFullscreenFallbackPlayer && player && typeof player.exitCssFullscreen === 'function') {
            try {
                player.exitCssFullscreen();
            } catch (e) {
                console.warn('[SMGTV] 退出 xgplayer CSS 全屏失败', e);
            }
        }
        cssFullscreenFallbackPlayer = null;
        if (fullscreenFallbackTarget) {
            fullscreenFallbackTarget.classList.remove(FULLSCREEN_TARGET_CLASS);
            fullscreenFallbackTarget = null;
        }
        document.body?.classList.remove(FULLSCREEN_FALLBACK_CLASS);
        syncFullscreenButtonState(component, false);
    }
    function isFallbackFullscreen() {
        return !!document.body?.classList.contains(FULLSCREEN_FALLBACK_CLASS) ||
            !!cssFullscreenFallbackPlayer?.cssfullscreen ||
            !!cssFullscreenFallbackPlayer?.isCssfullScreen;
    }
    function callFullscreenMethod(fn) {
        try {
            const result = fn();
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    function enterFullscreen(component, target) {
        const player = component?.player;
        const enterNative = callFullscreenMethod(() => (
            player && typeof player.getFullscreen === 'function' ?
                player.getFullscreen(target) :
                requestElementFullscreen(target)
        ));
        Promise.resolve(enterNative)
            .then(() => syncFullscreenButtonState(component, true))
            .catch(() => enterFallbackFullscreen(target, component));
    }
    function exitFullscreen(component) {
        const player = component?.player;
        if (isFallbackFullscreen()) {
            exitFallbackFullscreen(component);
            return;
        }
        const exitNative = callFullscreenMethod(() => (
            player && typeof player.exitFullscreen === 'function' ?
                player.exitFullscreen() :
                exitBrowserFullscreen()
        ));
        Promise.resolve(exitNative)
            .catch(exitBrowserFullscreen)
            .then(
                () => syncFullscreenButtonState(component, false),
                () => syncFullscreenButtonState(component, false)
            );
    }
    function handleFullscreenControl(event) {
        const button = event.target?.closest?.(FULLSCREEN_BUTTON_SELECTOR);
        if (!button) {
            return;
        }
        const now = Date.now();
        if (now - lastFullscreenActionAt < 300) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return;
        }
        lastFullscreenActionAt = now;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const component = findTVComponent();
        const target = getFullscreenTarget(component, button);
        syncLoadingState(component);
        if (getBrowserFullscreenElement() || isFallbackFullscreen()) {
            exitFullscreen(component);
        } else {
            enterFullscreen(component, target);
        }
    }
    function handleFullscreenChange() {
        if (getBrowserFullscreenElement()) {
            if (isFallbackFullscreen()) {
                exitFallbackFullscreen(findTVComponent());
            }
            syncFullscreenButtonState(findTVComponent(), true);
        } else if (!isFallbackFullscreen()) {
            syncFullscreenButtonState(findTVComponent(), false);
        }
    }
    function initFullscreenPatch() {
        document.addEventListener('click', handleFullscreenControl, true);
        document.addEventListener('touchend', handleFullscreenControl, true);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && isFallbackFullscreen()) {
                exitFallbackFullscreen(findTVComponent());
            }
        });
    }
    function wrapComponentMethod(component, methodName, after) {
        const original = component?.[methodName];
        if (typeof original !== 'function' || original.__smgWrapped) {
            return;
        }
        const wrapped = function() {
            const programId = this.programObj?.id;
            if (programId && programId !== this.__smgRecoverProgramId) {
                this.__smgRecoverProgramId = programId;
                this.__smgRecoverCount = 0;
            }
            ensurePlayableStream(this);
            const result = original.apply(this, arguments);
            const runAfter = () => {
                ensurePlayableStream(this);
                setTimeout(() => after(this), 0);
                setTimeout(() => after(this), 250);
                setTimeout(() => after(this), 1000);
            };
            if (result && typeof result.then === 'function') {
                result.then(runAfter, runAfter);
            } else {
                runAfter();
            }
            return result;
        };
        wrapped.__smgWrapped = true;
        wrapped.__smgOriginal = original;
        component[methodName] = wrapped;
    }
    function patchComponent(component) {
        if (!component) {
            return;
        }
        startLoadingMonitor(component);
        if (component.__smgPatched) {
            syncLoadingState(component);
            return;
        }
        component.__smgPatched = true;
        if (typeof component.countdown === 'number') {
            component.countdown = 99999999;
        }
        component.showOpenApp = false;
        component.showFlag = false;
        component.startCountdown = function() {
            console.log('[SMGTV] 已拦截试看倒计时');
        };
        if (component.liveTimer) {
            clearTimeout(component.liveTimer);
            component.liveTimer = null;
        }
        if (!component.player && component.programObj?.id && typeof component.playProgram === 'function') {
            console.log('[SMGTV] 播放器已销毁，尝试重新加载节目');
            component.playProgram();
        }
        if (typeof component.pageVisibilityChange === 'function') {
            document.removeEventListener('visibilitychange', component.pageVisibilityChange);
            component.pageVisibilityChange = function() {
                console.log('[SMGTV] 已拦截切换标签页自动暂停');
            };
            document.addEventListener('visibilitychange', component.pageVisibilityChange);
        }
        if (component._handlerUnload) {
            window.removeEventListener('unload', component._handlerUnload);
            component._handlerUnload = null;
        }
        ['initPlayer', 'initNoProgramPlayer', 'initPadPlayer', 'changeProgram', 'changeChannel', 'getProgramDetail'].forEach(methodName => {
            wrapComponentMethod(component, methodName, syncLoadingState);
        });
        installReplayUrlPatch(component);
        ensurePlayableStream(component);
        // 首次打开时若 API 改写未赶上首批 /programs 请求，节目列表仍是灰色不可点
        // （dateout: isOutDate===1 || play!==1 && can_review===0）。这里在组件层解锁：
        // 包一层 handleProgramList，让每次生成的列表都直接打开；并兜底扫一遍现有列表。
        const handleProgramList = component.handleProgramList;
        if (typeof handleProgramList === 'function' && !handleProgramList.__smgWrapped) {
            const wrappedList = function(...args) {
                const result = handleProgramList.apply(this, args);
                if (Array.isArray(result)) {
                    result.forEach(program => forceOpenProgram(program));
                }
                return result;
            };
            wrappedList.__smgWrapped = true;
            component.handleProgramList = wrappedList;
        }
        forceOpenProgramList(component);
        syncLoadingState(component);
        // 补丁生效前页面已自动播放的回看节目：播放器是用原始 initPlayer 建的，
        // config.url 没有 start/end。这里走一遍补丁后的 initPlayer，让回放参数生效。
        if (component.player && !component.player.config?.isPad && component.programObj?.play === 0) {
            const playerUrl = component.player?.config?.url || '';
            if (!/\bstart=\d/.test(playerUrl)) {
                console.log('[SMGTV] 首次补丁：重新加载当前回放节目');
                component.initPlayer({ changeCurrentList: false, isPlay: true, trigger: 'auto' });
            }
        }
        console.log('[SMGTV] 页面限制补丁已生效');
    }
    let scanning = false;
    function initComponentPatch() {
        if (scanning) {
            return;
        }
        scanning = true;
        let attempts = 0;
        const maxAttempts = 50;
        const timer = setInterval(() => {
            const component = findTVComponent();
            if (component) {
                clearInterval(timer);
                scanning = false;
                patchComponent(component);
                return;
            }
            attempts += 1;
            if (attempts >= maxAttempts) {
                clearInterval(timer);
                scanning = false;
                console.warn('[SMGTV] 未找到播放器组件实例');
            }
        }, 200);
    }
    injectStyle(`
    .video-tip {
        display: none !important;
    }
    body.${VIDEO_READY_CLASS} .loading-mask {
        display: none !important;
        pointer-events: none !important;
    }
    body.${FULLSCREEN_FALLBACK_CLASS} {
        overflow: hidden !important;
    }
    .${FULLSCREEN_TARGET_CLASS} {
        background: #000 !important;
        box-sizing: border-box !important;
        height: 100vh !important;
        inset: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        min-height: 100vh !important;
        min-width: 100vw !important;
        padding: 0 !important;
        position: fixed !important;
        transform: none !important;
        width: 100vw !important;
        z-index: 2147483647 !important;
    }
    .${FULLSCREEN_TARGET_CLASS}.xgplayer,
    .${FULLSCREEN_TARGET_CLASS} .xgplayer {
        height: 100% !important;
        inset: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        padding: 0 !important;
        padding-top: 0 !important;
        position: absolute !important;
        transform: none !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} .xgplayer-screen-container,
    .${FULLSCREEN_TARGET_CLASS} xg-video-container.xg-video-container,
    .${FULLSCREEN_TARGET_CLASS} .xg-video-container {
        bottom: 0 !important;
        display: block !important;
        height: 100% !important;
        inset: 0 !important;
        position: absolute !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} video,
    .${FULLSCREEN_TARGET_CLASS} canvas,
    .${FULLSCREEN_TARGET_CLASS} live-video {
        bottom: 0 !important;
        height: 100% !important;
        left: 0 !important;
        max-height: none !important;
        max-width: none !important;
        object-fit: contain !important;
        position: absolute !important;
        right: 0 !important;
        top: 0 !important;
        transform: none !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} .xgplayer-controls,
    .${FULLSCREEN_TARGET_CLASS} .xg-top-bar {
        z-index: 2147483647 !important;
    }
    `);
    
    // 保存原始的XMLHttpRequest.open方法
    const originalOpen = XMLHttpRequest.prototype.open;
    // 重写XMLHttpRequest.open方法
    function isTargetTVApi(url) {
        try {
            return new URL(String(url), location.href).pathname.includes('/content/pc/tv/');
        } catch (e) {
            return String(url).includes('/content/pc/tv/');
        }
    }
    function rewriteTvApiResponse(requestUrl, response) {
        let modified = false;
        if (!response || typeof response !== 'object') {
            return false;
        }
        if (requestUrl.includes('/channel/detail') && response.result) {
            rememberStreamAddresses(
                response.result.id,
                response.result.live_address,
                response.result.shift_address
            );
        }
        if (requestUrl.includes('/program/detail') && response.result) {
            forceOpenProgram(response.result);
            const channelInfo = response.result.channel_info || (response.result.channel_info = {});
            forceOpenProgram(channelInfo);
            const channelId = getResultChannelId(response.result);
            fillStreamAddresses(channelInfo, channelId);
            modified = true;
        }
        if (requestUrl.includes('/programs') && response.result?.programs) {
            response.result.programs.forEach(program => {
                forceOpenProgram(program);
                modified = true;
            });
        }
        return modified;
    }
    function replaceXhrResponse(xhr, body) {
        try {
            Object.defineProperty(xhr, 'responseText', {
                value: body,
                writable: false,
                configurable: true
            });
            // responseType='json' 时页面读 xhr.response 期望的是对象，不能覆写成字符串
            Object.defineProperty(xhr, 'response', {
                value: xhr.responseType === 'json' ? JSON.parse(body) : body,
                writable: false,
                configurable: true
            });
        } catch (e) {
            throttleLog('rewrite-error', 5000, () => console.error('[SMGTV] 重写接口响应失败:', e));
        }
    }
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__smgRequestUrl = String(url);
        // 检查是否是目标API请求
        if (isTargetTVApi(this.__smgRequestUrl)) {
            // 同一实例只挂一次监听，避免重复挂载导致监听器累计
            if (!this.__smgHooked) {
                this.__smgHooked = true;
                this.addEventListener('readystatechange', function() {
                    if (this.readyState !== 4) {
                        return;
                    }
                    const requestUrl = this.__smgRequestUrl;
                    try {
                        let response;
                        let rawText = null;
                        try {
                            rawText = this.responseText;
                        } catch (e) {
                            rawText = null;
                        }
                        if (typeof rawText === 'string' && rawText) {
                            response = JSON.parse(rawText);
                        } else if (this.response && typeof this.response === 'object') {
                            response = this.response;
                        } else {
                            return;
                        }
                        if (rewriteTvApiResponse(requestUrl, response)) {
                            replaceXhrResponse(this, JSON.stringify(response));
                            console.log('[SMGTV] 已重写接口响应:', requestUrl);
                        }
                    } catch (e) {
                        throttleLog('parse-error', 5000, () => console.error('[SMGTV] 解析接口响应失败:', e));
                    }
                });
            }
        }

        // 调用原始的open方法
        return originalOpen.apply(this, arguments);
    };
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function(input, init) {
            const requestUrl = String(typeof input === 'string' ? input : (input && input.url) || '');
            const request = originalFetch.apply(this, arguments);
            if (!isTargetTVApi(requestUrl)) {
                return request;
            }
            return request.then(res => {
                if (!res) {
                    return res;
                }
                try {
                    return res.clone().text().then(raw => {
                        try {
                            const response = JSON.parse(raw);
                            if (!rewriteTvApiResponse(requestUrl, response)) {
                                return res;
                            }
                            console.log('[SMGTV] 已重写接口响应:', requestUrl);
                            return new Response(JSON.stringify(response), {
                                status: res.status,
                                statusText: res.statusText,
                                headers: res.headers
                            });
                        } catch (e) {
                            throttleLog('parse-error', 5000, () => console.error('[SMGTV] 解析接口响应失败:', e));
                            return res;
                        }
                    }).catch(() => res);
                } catch (e) {
                    // clone()/text() 失败（body 已消费、流式响应等）：退回原响应，绝不能 reject 打断页面
                    throttleLog('rewrite-error', 5000, () => console.error('[SMGTV] 重写接口响应失败:', e));
                    return res;
                }
            });
        };
    }
    // 立即开始扫描组件：不等 window.load，否则页面首个自动播放的节目会在补丁生效前
    // 用原始 initPlayer 初始化（回看节目拿不到 start/end 回放参数）。扫描循环会等到组件挂载。
    initComponentPatch();
    initFullscreenPatch();
})();
