import {
    Plugin,
    showMessage,
    fetchSyncPost,
    Setting,
    getFrontend,
    getBackend,
} from "siyuan";
import "./index.scss";
import pluginJson from "../plugin.json";

const STORAGE_NAME = "gallery-settings";

interface IGallerySettings {
    imageOrder: "random" | "sequential" | "reverse";
    imageWidthDesktop: number; // 桌面端图片宽度（像素）
    imageWidthMobile: number; // 移动端图片宽度（像素）
}

interface IGalleryFile {
    id: string; // 文档 ID
    name: string; // 文档名称
    created: string; // 创建时间
    updated: string; // 更新时间
    imageCount: number; // 图片数量
}

interface IImageInfo {
    id: string; // span ID
    markdown: string; // markdown 原文
    src: string; // 图片路径
    blockId: string; // 所在块 ID
    content: string; // 所在块内容
}

type SortOrder = "date-desc" | "date-asc" | "reference-order";
type ImageSortOrder = "block-order" | "path-asc" | "path-desc";

/**
 * 瀑布流画廊插件
 * 为带有 #gallery 标签的文档自动以瀑布流形式展示图片
 */
export default class ImageWaterfallGallery extends Plugin {
    private currentRootId: string = "";
    private galleryOverlay: HTMLElement | null = null;
    private lightboxOverlay: HTMLElement | null = null;
    private galleryManagementOverlay: HTMLElement | null = null;
    private settings: IGallerySettings;
    private currentSortOrder: SortOrder = "date-desc";
    private currentImageSortOrder: ImageSortOrder = "block-order";
    private lastProcessedRootId: string = ""; // 防抖：记录最后处理的文档 ID
    private lastProcessedTime: number = 0; // 防抖：记录最后处理的时间戳
    private galleryLoadedForRootId: string = ""; // 记录当前已加载画廊的文档 ID

    async onload() {
        console.log("Loading Image Waterfall Gallery Plugin");

        // 初始化设置
        await this.loadSettings();

        // 创建设置界面
        this.initSettings();

        // 监听文档切换事件
        this.eventBus.on("switch-protyle", this.handleDocumentSwitch.bind(this));

        // 监听文档加载完成事件（用于移动端更可靠的标签检测）
        this.eventBus.on("loaded-protyle-static", this.handleDocumentLoaded.bind(this));
    }

    onunload() {
        console.log("Unloading Image Waterfall Gallery Plugin");
        // 清理画廊覆盖层
        this.destroyGallery();
        this.destroyLightbox();
    }

    async uninstall() {
        console.log("Uninstalling Image Waterfall Gallery Plugin");
        // 清理画廊覆盖层
        this.destroyGallery();
        this.destroyLightbox();
        // 删除插件配置数据
        await this.removeData(STORAGE_NAME);
    }

    /**
     * 加载设置
     */
    private async loadSettings() {
        // 加载保存的设置或使用默认值
        const savedSettings = await this.loadData(STORAGE_NAME);

        // 设置默认值
        const defaultDesktopWidth = 350;
        const defaultMobileWidth = 300;

        this.settings = {
            imageOrder: savedSettings?.imageOrder || "random",
            imageWidthDesktop: savedSettings?.imageWidthDesktop || defaultDesktopWidth,
            imageWidthMobile: savedSettings?.imageWidthMobile || defaultMobileWidth,
        };

        // 检测平台并记录日志
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";
        const currentWidth = isMobile ? this.settings.imageWidthMobile : this.settings.imageWidthDesktop;

        console.log("[DEBUG] Settings loaded:", this.settings, "Platform:", frontend, "Current width:", currentWidth);
    }

    /**
     * 初始化设置界面
     */
    private initSettings() {
        // 版本号显示
        const versionDisplay = document.createElement("span");
        versionDisplay.className = "b3-label__text";
        versionDisplay.textContent = `v${pluginJson.version}`;
        versionDisplay.style.color = "var(--b3-theme-on-surface-light)";

        const imageOrderSelect = document.createElement("select");
        imageOrderSelect.className = "b3-select fn__flex-center";
        imageOrderSelect.innerHTML = `
            <option value="random" ${this.settings.imageOrder === "random" ? "selected" : ""}>随机顺序</option>
            <option value="sequential" ${this.settings.imageOrder === "sequential" ? "selected" : ""}>顺序</option>
            <option value="reverse" ${this.settings.imageOrder === "reverse" ? "selected" : ""}>倒序</option>
        `;

        const imageWidthDesktopInput = document.createElement("input");
        imageWidthDesktopInput.className = "b3-text-field fn__flex-center";
        imageWidthDesktopInput.type = "number";
        imageWidthDesktopInput.min = "200";
        imageWidthDesktopInput.max = "600";
        imageWidthDesktopInput.step = "50";
        imageWidthDesktopInput.value = this.settings.imageWidthDesktop.toString();

        const imageWidthMobileInput = document.createElement("input");
        imageWidthMobileInput.className = "b3-text-field fn__flex-center";
        imageWidthMobileInput.type = "number";
        imageWidthMobileInput.min = "200";
        imageWidthMobileInput.max = "600";
        imageWidthMobileInput.step = "50";
        imageWidthMobileInput.value = this.settings.imageWidthMobile.toString();

        const galleryManagementBtn = document.createElement("button");
        galleryManagementBtn.className = "b3-button b3-button--outline";
        galleryManagementBtn.textContent = "管理画廊文件";
        galleryManagementBtn.onclick = () => {
            this.showGalleryManagement();
        };

        const manualDetectBtn = document.createElement("button");
        manualDetectBtn.className = "b3-button b3-button--outline";
        manualDetectBtn.textContent = "手动检测画廊";
        manualDetectBtn.onclick = async () => {
            await this.manualDetectGallery();
        };

        this.setting = new Setting({
            confirmCallback: () => {
                this.settings.imageOrder = imageOrderSelect.value as "random" | "sequential" | "reverse";
                this.settings.imageWidthDesktop = parseInt(imageWidthDesktopInput.value);
                this.settings.imageWidthMobile = parseInt(imageWidthMobileInput.value);
                this.saveData(STORAGE_NAME, this.settings);
                showMessage("设置已保存");
            }
        });

        this.setting.addItem({
            title: "插件版本",
            description: "当前插件版本号",
            actionElement: versionDisplay,
        });

        this.setting.addItem({
            title: "图片顺序",
            description: "设置图片在瀑布流中的显示顺序",
            actionElement: imageOrderSelect,
        });

        this.setting.addItem({
            title: "桌面端图片宽度（像素）",
            description: "设置桌面端瀑布流中图片的宽度，范围 200-600",
            actionElement: imageWidthDesktopInput,
        });

        this.setting.addItem({
            title: "移动端图片宽度（像素）",
            description: "设置移动端瀑布流中图片的宽度，范围 200-600",
            actionElement: imageWidthMobileInput,
        });

        this.setting.addItem({
            title: "画廊文件管理",
            description: "查看和管理所有画廊文件",
            actionElement: galleryManagementBtn,
        });

        this.setting.addItem({
            title: "手动检测画廊",
            description: "扫描所有文档并显示画廊列表（SQL + API 双重保障，宽松容错）",
            actionElement: manualDetectBtn,
        });
    }

    /**
     * 处理文档切换事件
     */
    private async handleDocumentSwitch(event: any) {
        console.log("[DEBUG] handleDocumentSwitch called, event:", event);

        // 在移动端，只使用 loaded-protyle-static 事件，避免事件冲突
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";
        if (isMobile) {
            console.log("[DEBUG] Mobile platform detected, skipping switch-protyle handler");
            return;
        }

        const detail = event.detail;
        if (!detail || !detail.protyle || !detail.protyle.block) {
            console.log("[DEBUG] Event detail invalid, skipping");
            return;
        }

        const rootId = detail.protyle.block.rootID;
        console.log("[DEBUG] Document switched, rootID:", rootId);

        // 防抖处理：如果快速切换文档，只处理最新的
        this.currentRootId = rootId;

        // 检查文档是否有 #gallery 标签
        console.log("[DEBUG] Checking for #gallery tag...");
        const hasGalleryTag = await this.checkTags(rootId);
        console.log("[DEBUG] Has gallery tag:", hasGalleryTag);

        if (hasGalleryTag) {
            console.log("[DEBUG] Document has #gallery tag, loading gallery...");
            await this.loadGallery(rootId);
        } else {
            console.log("[DEBUG] No #gallery tag, destroying gallery if exists");
            this.destroyGallery();
        }
    }

    /**
     * 处理文档加载完成事件（用于移动端更可靠的标签检测）
     */
    private async handleDocumentLoaded(event: any) {
        console.log("[DEBUG] handleDocumentLoaded called, event:", event);
        const detail = event.detail;
        if (!detail || !detail.protyle || !detail.protyle.block) {
            console.log("[DEBUG] Event detail invalid, skipping");
            return;
        }

        const rootId = detail.protyle.block.rootID;
        console.log("[DEBUG] Document loaded, rootID:", rootId);

        // 只在移动端处理此事件，避免桌面端重复触发
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";

        if (!isMobile) {
            console.log("[DEBUG] Not mobile platform, skipping loaded-protyle-static handler");
            return;
        }

        console.log("[DEBUG] Mobile platform detected, checking for #gallery tag after load...");

        // 检查是否切换到了不同的文档
        const isDocumentChanged = rootId !== this.lastProcessedRootId;

        // 移动端最高权限：如果画廊已经加载，永不自动关闭，只能用户手动关闭
        if (this.galleryLoadedForRootId) {
            console.log("[DEBUG] Mobile: Gallery already loaded, NEVER auto-close (highest priority)");
            return;
        }

        if (isDocumentChanged) {
            console.log("[DEBUG] Document changed, processing new document:", rootId);
            // 文档切换了，更新记录
            this.lastProcessedRootId = rootId;
            this.lastProcessedTime = Date.now();
            this.currentRootId = rootId;
        } else {
            // 同一个文档，检查是否需要防抖
            const now = Date.now();
            const timeSinceLastProcess = now - this.lastProcessedTime;

            if (timeSinceLastProcess < 10000) {
                console.log(`[DEBUG] Debounce: Same document processed ${timeSinceLastProcess}ms ago, skipping`);
                return;
            }
            console.log("[DEBUG] Same document, but enough time passed, re-checking...");
            this.lastProcessedTime = now;
        }

        // 在移动端添加初始延迟，给数据库更多时间同步标签数据
        console.log("[DEBUG] Waiting 500ms for database sync...");
        await new Promise(resolve => setTimeout(resolve, 500));

        // 检查文档是否有 #gallery 标签
        const hasGalleryTag = await this.checkTags(rootId);
        console.log("[DEBUG] Has gallery tag (after load):", hasGalleryTag);

        if (hasGalleryTag) {
            console.log("[DEBUG] Document has #gallery tag, loading gallery...");
            await this.loadGallery(rootId);
        } else {
            console.log("[DEBUG] No #gallery tag, but mobile never auto-closes gallery");
        }
    }

    /**
     * 手动检测画廊（扫描所有文档并显示画廊列表）
     */
    private async manualDetectGallery() {
        console.log("[DEBUG] manualDetectGallery called - scanning all documents");

        try {
            // 显示开始检测的消息
            showMessage("开始扫描所有文档...");

            // 调用画廊管理界面，会自动使用增强版的查询方法（SQL + API 双重保障）
            await this.showGalleryManagement();
        } catch (error) {
            console.error("[DEBUG] Error in manual detect:", error);
            showMessage("✗ 检测失败：" + error.message);
        }
    }

    /**
     * 获取移动端重试延迟时间（增强容错策略：递增延迟）
     * @param retryCount 当前重试次数
     * @returns 延迟时间（毫秒）
     */
    private getMobileRetryDelay(retryCount: number): number {
        // 使用递增延迟策略：200ms -> 400ms -> 600ms -> 800ms -> 1000ms -> 1200ms
        // 确保即使最慢的设备也能成功加载
        const delays = [200, 400, 600, 800, 1000, 1200];
        const delay = delays[retryCount] || 1200;
        console.log(`[DEBUG] Retry ${retryCount + 1}/6, using ${delay}ms delay (enhanced fault tolerance)`);
        return delay;
    }

    /**
     * 获取手动检测的重试延迟时间（最强保障策略：更长的递增延迟）
     * @param retryCount 当前重试次数
     * @returns 延迟时间（毫秒）
     */
    private getMaxRetryDelay(retryCount: number): number {
        // 使用更长的递增延迟策略：300ms -> 500ms -> 700ms -> 900ms -> 1100ms -> 1300ms -> 1500ms -> 1700ms -> 1900ms -> 2100ms
        // 最强保障机制，确保在任何情况下都能成功
        const delays = [300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100];
        const delay = delays[retryCount] || 2100;
        console.log(`[DEBUG] Max retry ${retryCount + 1}/10, using ${delay}ms delay (strongest safeguard)`);
        return delay;
    }

    /**
     * 使用最强保障机制检查文档是否有 gallery 标签（最多重试10次）
     * @param rootId 文档 ID
     * @param retryCount 重试次数
     */
    private async checkTagsWithMaxRetry(rootId: string, retryCount: number = 0): Promise<boolean> {
        console.log("[DEBUG] ========== checkTagsWithMaxRetry START ==========");
        console.log("[DEBUG] rootId:", rootId);
        console.log("[DEBUG] retryCount:", retryCount);

        let hasGallery = false;

        // 方法1: 优先使用 SQL 查询
        try {
            const sql = `SELECT id, type, tag, content FROM blocks WHERE id = '${rootId}'`;
            console.log("[DEBUG] [MaxRetry] SQL query:", sql);

            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] [MaxRetry] SQL result:", JSON.stringify(result, null, 2));

            if (result && result.length > 0) {
                const block = result[0];
                const tags = block.tag || "";
                hasGallery = tags.includes("#gallery#") || tags.includes("gallery");
                console.log("[DEBUG] [MaxRetry] SQL method - Contains 'gallery':", hasGallery);
            } else {
                console.log("[DEBUG] [MaxRetry] SQL query returned no results");
            }
        } catch (sqlError) {
            console.error("[DEBUG] [MaxRetry] SQL query error:", sqlError);
        }

        // 方法2: 如果 SQL 未找到标签，尝试使用 getDocInfo API 作为兜底
        if (!hasGallery) {
            console.log("[DEBUG] [MaxRetry] Trying getDocInfo API as fallback...");
            try {
                const response = await fetchSyncPost("/api/block/getDocInfo", { id: rootId });
                console.log("[DEBUG] [MaxRetry] getDocInfo API response:", JSON.stringify(response, null, 2));

                if (response.code === 0 && response.data) {
                    const docInfo = response.data;
                    console.log("[DEBUG] [MaxRetry] getDocInfo data keys:", Object.keys(docInfo));

                    // ial 是一个对象，直接访问 ial.tags
                    if (docInfo.ial && docInfo.ial.tags) {
                        const tags = docInfo.ial.tags;
                        console.log("[DEBUG] [MaxRetry] Tags from ial.tags:", tags);
                        hasGallery = tags.includes("gallery");
                    }

                    console.log("[DEBUG] [MaxRetry] API method - Contains 'gallery':", hasGallery);
                }
            } catch (apiError) {
                console.error("[DEBUG] [MaxRetry] getDocInfo API error:", apiError);
            }
        }

        console.log("[DEBUG] [MaxRetry] Final result - hasGallery:", hasGallery);

        // 如果没有找到标签且重试次数小于10次，则重试
        if (!hasGallery && retryCount < 10) {
            const delay = this.getMaxRetryDelay(retryCount);
            console.log(`[DEBUG] [MaxRetry] Retrying after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.checkTagsWithMaxRetry(rootId, retryCount + 1);
        }

        console.log("[DEBUG] ========== checkTagsWithMaxRetry END ==========");
        return hasGallery;
    }

    /**
     * 检查文档是否有 gallery 标签
     * @param rootId 文档 ID
     * @param retryCount 重试次数（用于移动端延迟加载）
     */
    private async checkTags(rootId: string, retryCount: number = 0): Promise<boolean> {
        console.log("[DEBUG] ========== checkTags START ==========");
        console.log("[DEBUG] rootId:", rootId);
        console.log("[DEBUG] retryCount:", retryCount);
        console.log("[DEBUG] Platform:", getFrontend());

        let hasGallery = false;

        // 方法1: 优先使用 SQL 查询（桌面端已验证可用）
        try {
            const sql = `SELECT id, type, tag, content FROM blocks WHERE id = '${rootId}'`;
            console.log("[DEBUG] SQL query:", sql);

            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] SQL result:", JSON.stringify(result, null, 2));

            if (result && result.length > 0) {
                const block = result[0];
                console.log("[DEBUG] Block found via SQL:");
                console.log("[DEBUG]   - id:", block.id);
                console.log("[DEBUG]   - type:", block.type);
                console.log("[DEBUG]   - tag:", block.tag);
                console.log("[DEBUG]   - content:", block.content);

                const tags = block.tag || "";
                console.log("[DEBUG] Tags string:", tags);
                console.log("[DEBUG] Tags type:", typeof tags);
                console.log("[DEBUG] Tags length:", tags.length);

                hasGallery = tags.includes("#gallery#") || tags.includes("gallery");
                console.log("[DEBUG] SQL method - Contains 'gallery':", hasGallery);
            } else {
                console.log("[DEBUG] SQL query returned no results");
            }
        } catch (sqlError) {
            console.error("[DEBUG] SQL query error:", sqlError);
        }

        // 方法2: 如果 SQL 未找到标签，尝试使用 getDocInfo API 作为兜底
        if (!hasGallery) {
            console.log("[DEBUG] Trying getDocInfo API as fallback...");
            try {
                const response = await fetchSyncPost("/api/block/getDocInfo", { id: rootId });
                console.log("[DEBUG] getDocInfo API response:", JSON.stringify(response, null, 2));

                if (response.code === 0 && response.data) {
                    const docInfo = response.data;
                    console.log("[DEBUG] getDocInfo data keys:", Object.keys(docInfo));
                    console.log("[DEBUG] Full docInfo:", JSON.stringify(docInfo, null, 2));

                    // ial 是一个对象，直接访问 ial.tags
                    if (docInfo.ial && docInfo.ial.tags) {
                        const tags = docInfo.ial.tags;
                        console.log("[DEBUG] Tags from ial.tags:", tags);
                        console.log("[DEBUG] Tags type:", typeof tags);
                        hasGallery = tags.includes("gallery");
                    }

                    console.log("[DEBUG] API method - Contains 'gallery':", hasGallery);
                } else {
                    console.log("[DEBUG] getDocInfo API failed, code:", response.code, "msg:", response.msg);
                }
            } catch (apiError) {
                console.error("[DEBUG] getDocInfo API error:", apiError);
            }
        }

        console.log("[DEBUG] Final result - hasGallery:", hasGallery);

        // 如果没有找到标签且重试次数小于6次，则在移动端重试
        if (!hasGallery && retryCount < 6) {
            const frontend = getFrontend();
            const isMobile = frontend === "mobile" || frontend === "browser-mobile";
            if (isMobile) {
                const delay = this.getMobileRetryDelay(retryCount);
                console.log(`[DEBUG] Mobile platform, retrying after ${delay}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.checkTags(rootId, retryCount + 1);
            }
        }

        console.log("[DEBUG] ========== checkTags END ==========");
        return hasGallery;
    }

    /**
     * 执行 SQL 查询
     */
    private async sqlQuery(sql: string): Promise<any[]> {
        console.log("[DEBUG] sqlQuery executing:", sql);
        try {
            const response = await fetchSyncPost("/api/query/sql", { stmt: sql });
            console.log("[DEBUG] sqlQuery response:", response);

            if (response.code === 0) {
                console.log("[DEBUG] sqlQuery success, data length:", response.data?.length || 0);
                return response.data || [];
            } else {
                console.error("[DEBUG] SQL query failed, code:", response.code, "msg:", response.msg);
                return [];
            }
        } catch (error) {
            console.error("[DEBUG] SQL query error:", error);
            return [];
        }
    }

    /**
     * 加载画廊
     */
    private async loadGallery(rootId: string) {
        // 提取文档中的所有图片
        const images = await this.extractImages(rootId);

        if (images.length === 0) {
            showMessage("当前文档无图片");
            return;
        }

        console.log(`Found ${images.length} images, rendering gallery...`);

        // 渲染画廊
        this.renderGallery(images);

        // 记录当前已加载画廊的文档 ID
        this.galleryLoadedForRootId = rootId;
        console.log("[DEBUG] Gallery loaded successfully for document:", rootId);
    }

    /**
     * 根据设置对图片进行排序
     */
    private orderImages(images: string[]): string[] {
        const orderedImages = [...images];

        switch (this.settings.imageOrder) {
            case "random":
                // Fisher-Yates 洗牌算法
                for (let i = orderedImages.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [orderedImages[i], orderedImages[j]] = [orderedImages[j], orderedImages[i]];
                }
                break;
            case "reverse":
                orderedImages.reverse();
                break;
            case "sequential":
            default:
                // 保持原顺序
                break;
        }

        return orderedImages;
    }

    /**
     * 提取文档中的所有图片
     */
    private async extractImages(rootId: string): Promise<string[]> {
        // 图片存储在 spans 表中,type = 'img'
        const sql = `SELECT markdown FROM spans WHERE root_id = '${rootId}' AND type = 'img'`;
        console.log("[DEBUG] extractImages SQL:", sql);

        try {
            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] extractImages query result count:", result.length);
            const images: string[] = [];

            // 正则表达式匹配图片路径
            const regex = /!\[.*?\]\((.*?)(?:\s+".*?")?\)/;

            for (const row of result) {
                const markdown = row.markdown || "";
                console.log("[DEBUG] Processing markdown:", markdown);
                const match = markdown.match(regex);
                if (match && match[1]) {
                    console.log("[DEBUG] Extracted image URL:", match[1]);
                    images.push(match[1]);
                } else {
                    console.log("[DEBUG] No match found for markdown:", markdown);
                }
            }

            console.log("[DEBUG] Total images extracted:", images.length, images);
            return images;
        } catch (error) {
            console.error("[DEBUG] Error extracting images:", error);
            return [];
        }
    }

    /**
     * 渲染画廊
     */
    private renderGallery(images: string[]) {
        console.log("[DEBUG] renderGallery called with", images.length, "images");

        // 根据设置对图片进行排序
        const orderedImages = this.orderImages(images);
        console.log("[DEBUG] Images ordered with", this.settings.imageOrder, "order");

        // 如果已经有画廊，先销毁
        this.destroyGallery();

        // 创建画廊覆盖层
        const overlay = document.createElement("div");
        overlay.id = "gallery-overlay";
        overlay.className = "image-waterfall-gallery-overlay";
        console.log("[DEBUG] Created overlay element");

        // 创建工具栏
        const toolbar = document.createElement("div");
        toolbar.className = "gallery-toolbar";

        const title = document.createElement("span");
        title.className = "gallery-title";
        title.textContent = "Gallery Mode";

        const closeBtn = document.createElement("button");
        closeBtn.className = "gallery-close-btn";
        closeBtn.textContent = "✕";
        closeBtn.onclick = () => this.destroyGallery();

        toolbar.appendChild(title);
        toolbar.appendChild(closeBtn);
        console.log("[DEBUG] Created toolbar");

        // 创建瀑布流容器
        const container = document.createElement("div");
        container.className = "waterfall-container";
        // 检测平台并应用对应的图片宽度设置
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";
        const currentWidth = isMobile ? this.settings.imageWidthMobile : this.settings.imageWidthDesktop;
        container.style.setProperty("--gallery-image-width", `${currentWidth}px`);
        console.log("[DEBUG] Created waterfall container with width:", currentWidth, "Platform:", frontend);

        // 添加图片（使用排序后的图片列表）
        for (const imageSrc of orderedImages) {
            console.log("[DEBUG] Creating image item for:", imageSrc);
            const item = document.createElement("div");
            item.className = "waterfall-item";

            const img = document.createElement("img");
            img.src = imageSrc;
            img.loading = "lazy";
            img.onload = () => {
                console.log("[DEBUG] Image loaded successfully:", imageSrc);
            };
            img.onerror = () => {
                console.error("[DEBUG] Image failed to load:", imageSrc);
                item.style.display = "none";
            };

            // 添加点击事件打开灯箱
            img.onclick = () => {
                this.showLightbox(imageSrc, orderedImages);
            };

            item.appendChild(img);
            container.appendChild(item);
        }
        console.log("[DEBUG] Added all images to container");

        overlay.appendChild(toolbar);
        overlay.appendChild(container);

        // 添加到页面
        document.body.appendChild(overlay);
        this.galleryOverlay = overlay;
        console.log("[DEBUG] Appended overlay to document.body");
        console.log("[DEBUG] Overlay element:", overlay);
        console.log("[DEBUG] Overlay in DOM:", document.getElementById("gallery-overlay"));

        // 添加 ESC 键关闭功能
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.destroyGallery();
                document.removeEventListener("keydown", handleEscape);
            }
        };
        document.addEventListener("keydown", handleEscape);

        // 添加淡入动画
        setTimeout(() => {
            console.log("[DEBUG] Adding 'show' class to overlay");
            overlay.classList.add("show");
            console.log("[DEBUG] Overlay classes:", overlay.className);
        }, 10);
    }

    /**
     * 销毁画廊
     */
    private destroyGallery() {
        console.log("[DEBUG] destroyGallery called, overlay exists:", !!this.galleryOverlay);

        // 添加堆栈跟踪，查看是谁调用了 destroyGallery
        console.log("[DEBUG] destroyGallery call stack:", new Error().stack);

        if (this.galleryOverlay) {
            console.log("[DEBUG] Removing overlay from DOM");
            this.galleryOverlay.remove();
            this.galleryOverlay = null;
            this.galleryLoadedForRootId = ""; // 清除加载标志
            console.log("[DEBUG] Gallery destroyed");
        }
    }

    /**
     * 显示灯箱
     */
    private showLightbox(imageSrc: string, allImages: string[]) {
        console.log("[DEBUG] showLightbox called for:", imageSrc);

        // 如果已经有灯箱，先销毁
        this.destroyLightbox();

        const currentIndex = allImages.indexOf(imageSrc);

        // 创建灯箱覆盖层
        const lightbox = document.createElement("div");
        lightbox.className = "gallery-lightbox";

        // 创建关闭按钮
        const closeBtn = document.createElement("button");
        closeBtn.className = "lightbox-close-btn";
        closeBtn.textContent = "✕";
        closeBtn.onclick = () => this.destroyLightbox();

        // 创建图片容器
        const imgContainer = document.createElement("div");
        imgContainer.className = "lightbox-image-container";

        const img = document.createElement("img");
        img.src = imageSrc;
        img.className = "lightbox-image";

        imgContainer.appendChild(img);

        // 创建导航按钮（如果有多张图片）
        if (allImages.length > 1) {
            const prevBtn = document.createElement("button");
            prevBtn.className = "lightbox-nav-btn lightbox-prev-btn";
            prevBtn.innerHTML = "‹";
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                const prevIndex = (currentIndex - 1 + allImages.length) % allImages.length;
                this.showLightbox(allImages[prevIndex], allImages);
            };

            const nextBtn = document.createElement("button");
            nextBtn.className = "lightbox-nav-btn lightbox-next-btn";
            nextBtn.innerHTML = "›";
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                const nextIndex = (currentIndex + 1) % allImages.length;
                this.showLightbox(allImages[nextIndex], allImages);
            };

            lightbox.appendChild(prevBtn);
            lightbox.appendChild(nextBtn);
        }

        // 创建图片计数器
        const counter = document.createElement("div");
        counter.className = "lightbox-counter";
        counter.textContent = `${currentIndex + 1} / ${allImages.length}`;

        lightbox.appendChild(closeBtn);
        lightbox.appendChild(imgContainer);
        lightbox.appendChild(counter);

        // 点击背景关闭
        lightbox.onclick = (e) => {
            if (e.target === lightbox || e.target === imgContainer) {
                this.destroyLightbox();
            }
        };

        // 添加到页面
        document.body.appendChild(lightbox);
        this.lightboxOverlay = lightbox;

        // 添加键盘导航
        const handleKeyboard = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.destroyLightbox();
            } else if (e.key === "ArrowLeft" && allImages.length > 1) {
                const prevIndex = (currentIndex - 1 + allImages.length) % allImages.length;
                this.showLightbox(allImages[prevIndex], allImages);
            } else if (e.key === "ArrowRight" && allImages.length > 1) {
                const nextIndex = (currentIndex + 1) % allImages.length;
                this.showLightbox(allImages[nextIndex], allImages);
            }
        };
        document.addEventListener("keydown", handleKeyboard);

        // 保存事件处理器以便清理
        (lightbox as any)._keyboardHandler = handleKeyboard;

        // 添加淡入动画
        setTimeout(() => {
            lightbox.classList.add("show");
        }, 10);
    }

    /**
     * 销毁灯箱
     */
    private destroyLightbox() {
        console.log("[DEBUG] destroyLightbox called");
        if (this.lightboxOverlay) {
            // 移除键盘事件监听
            const handler = (this.lightboxOverlay as any)._keyboardHandler;
            if (handler) {
                document.removeEventListener("keydown", handler);
            }
            this.lightboxOverlay.remove();
            this.lightboxOverlay = null;
        }
    }

    /**
     * 查询所有画廊文件（增强版：SQL + API 双重保障）
     */
    private async queryAllGalleryFiles(): Promise<IGalleryFile[]> {
        // 先尝试 SQL 方法
        console.log("[DEBUG] queryAllGalleryFiles - trying SQL method first...");
        const sqlResult = await this.queryAllGalleryFilesBySQL();

        if (sqlResult.length > 0) {
            console.log("[DEBUG] queryAllGalleryFiles - SQL method succeeded, found", sqlResult.length, "files");
            return sqlResult;
        }

        // SQL 失败或返回空，使用 API 方法作为兜底
        console.log("[DEBUG] queryAllGalleryFiles - SQL method failed or returned empty, trying API method...");
        const apiResult = await this.queryAllGalleryFilesByAPI();
        console.log("[DEBUG] queryAllGalleryFiles - API method found", apiResult.length, "files");
        return apiResult;
    }

    /**
     * 通过 SQL 查询所有画廊文件
     */
    private async queryAllGalleryFilesBySQL(): Promise<IGalleryFile[]> {
        // 查询所有带有 #gallery# 标签的文档
        const sql = `
            SELECT id, content, created, updated
            FROM blocks
            WHERE type = 'd' AND (tag LIKE '%#gallery#%' OR tag LIKE '%gallery%')
            ORDER BY created DESC
        `;
        console.log("[DEBUG] queryAllGalleryFilesBySQL SQL:", sql);

        try {
            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] queryAllGalleryFilesBySQL result count:", result.length);

            const galleryFiles: IGalleryFile[] = [];

            for (const row of result) {
                console.log("[DEBUG] Processing gallery file - id:", row.id, "content:", row.content);

                // 查询该文档的图片数量
                const imageCountSql = `
                    SELECT COUNT(*) as count
                    FROM spans
                    WHERE root_id = '${row.id}' AND type = 'img'
                `;
                const countResult = await this.sqlQuery(imageCountSql);
                const imageCount = countResult[0]?.count || 0;

                galleryFiles.push({
                    id: row.id,
                    name: row.content || "未命名文档",
                    created: row.created,
                    updated: row.updated,
                    imageCount: imageCount,
                });
            }

            console.log("[DEBUG] queryAllGalleryFilesBySQL - Total found:", galleryFiles.length);
            return galleryFiles;
        } catch (error) {
            console.error("[DEBUG] queryAllGalleryFilesBySQL error:", error);
            return [];
        }
    }

    /**
     * 通过 API 遍历所有文档查询画廊文件（兜底方案）
     */
    private async queryAllGalleryFilesByAPI(): Promise<IGalleryFile[]> {
        console.log("[DEBUG] queryAllGalleryFilesByAPI - starting API scan...");
        showMessage("正在扫描所有文档...");

        try {
            // 查询所有文档 ID
            const sql = `SELECT id, content, created, updated FROM blocks WHERE type = 'd' ORDER BY created DESC`;
            const allDocs = await this.sqlQuery(sql);
            console.log("[DEBUG] queryAllGalleryFilesByAPI - total documents:", allDocs.length);

            if (allDocs.length === 0) {
                showMessage("未找到任何文档");
                return [];
            }

            const galleryFiles: IGalleryFile[] = [];
            let scannedCount = 0;

            // 遍历所有文档，使用 getDocInfo API 检查标签
            for (const doc of allDocs) {
                scannedCount++;

                // 每扫描 10 个文档显示一次进度
                if (scannedCount % 10 === 0) {
                    showMessage(`正在扫描... ${scannedCount}/${allDocs.length}`);
                }

                try {
                    const response = await fetchSyncPost("/api/block/getDocInfo", { id: doc.id });

                    if (response.code === 0 && response.data) {
                        const docInfo = response.data;

                        // 宽松检测：只要返回结果中包含 "gallery" 就认为是画廊文档
                        const jsonStr = JSON.stringify(docInfo).toLowerCase();
                        if (jsonStr.includes("gallery")) {
                            console.log("[DEBUG] queryAllGalleryFilesByAPI - found gallery doc:", doc.id, doc.content);

                            // 查询该文档的图片数量
                            const imageCountSql = `
                                SELECT COUNT(*) as count
                                FROM spans
                                WHERE root_id = '${doc.id}' AND type = 'img'
                            `;
                            const countResult = await this.sqlQuery(imageCountSql);
                            const imageCount = countResult[0]?.count || 0;

                            galleryFiles.push({
                                id: doc.id,
                                name: doc.content || "未命名文档",
                                created: doc.created,
                                updated: doc.updated,
                                imageCount: imageCount,
                            });
                        }
                    }
                } catch (apiError) {
                    console.error("[DEBUG] queryAllGalleryFilesByAPI - error checking doc:", doc.id, apiError);
                    // 继续处理下一个文档
                }
            }

            console.log("[DEBUG] queryAllGalleryFilesByAPI - scan complete, found:", galleryFiles.length);
            showMessage(`扫描完成，找到 ${galleryFiles.length} 个画廊文档`);
            return galleryFiles;
        } catch (error) {
            console.error("[DEBUG] queryAllGalleryFilesByAPI error:", error);
            showMessage("API 扫描失败");
            return [];
        }
    }

    /**
     * 获取指定画廊文件的详细图片信息
     */
    private async getGalleryImageDetails(rootId: string): Promise<IImageInfo[]> {
        const sql = `
            SELECT s.id, s.markdown, s.block_id, b.content
            FROM spans s
            LEFT JOIN blocks b ON s.block_id = b.id
            WHERE s.root_id = '${rootId}' AND s.type = 'img'
            ORDER BY s.block_id
        `;
        console.log("[DEBUG] getGalleryImageDetails SQL:", sql);

        try {
            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] getGalleryImageDetails result count:", result.length);
            console.log("[DEBUG] getGalleryImageDetails raw result:", result);

            const imageInfos: IImageInfo[] = [];
            const regex = /!\[.*?\]\((.*?)(?:\s+".*?")?\)/;

            for (const row of result) {
                const markdown = row.markdown || "";
                console.log("[DEBUG] Processing image - id:", row.id, "markdown:", markdown, "block_id:", row.block_id);
                const match = markdown.match(regex);
                if (match && match[1]) {
                    const imageInfo = {
                        id: row.id,
                        markdown: markdown,
                        src: match[1],
                        blockId: row.block_id,
                        content: row.content || "",
                    };
                    console.log("[DEBUG] Extracted image info:", imageInfo);
                    imageInfos.push(imageInfo);
                } else {
                    console.log("[DEBUG] Failed to extract image from markdown:", markdown);
                }
            }

            console.log("[DEBUG] Total image details extracted:", imageInfos.length);
            console.log("[DEBUG] Image infos array:", imageInfos);
            return imageInfos;
        } catch (error) {
            console.error("[DEBUG] Error getting image details:", error);
            return [];
        }
    }

    /**
     * 规范化图片路径
     * 思源笔记的图片路径格式为 assets/xxx，需要添加前缀 /
     */
    private normalizeImagePath(path: string): string {
        console.log("[DEBUG] normalizeImagePath - input path:", path);

        if (!path) {
            console.log("[DEBUG] normalizeImagePath - empty path");
            return "";
        }

        // 如果已经是完整的URL（http/https），直接返回
        if (path.startsWith("http://") || path.startsWith("https://")) {
            console.log("[DEBUG] normalizeImagePath - already full URL");
            return path;
        }

        // 如果已经以 / 开头，直接返回
        if (path.startsWith("/")) {
            console.log("[DEBUG] normalizeImagePath - already starts with /");
            return path;
        }

        // 如果是 assets/ 开头，添加前缀 /
        if (path.startsWith("assets/")) {
            const normalizedPath = "/" + path;
            console.log("[DEBUG] normalizeImagePath - normalized to:", normalizedPath);
            return normalizedPath;
        }

        // 其他情况，直接返回原路径
        console.log("[DEBUG] normalizeImagePath - returning original path");
        return path;
    }

    /**
     * 解析思源笔记的时间戳格式
     * 思源笔记的时间戳格式为 YYYYMMDDHHmmss，如 "20251224190738"
     */
    private parseTimestamp(timestamp: string): Date {
        console.log("[DEBUG] parseTimestamp - input:", timestamp, "type:", typeof timestamp);

        // 如果已经是有效的日期字符串或数字，直接转换
        if (!timestamp || timestamp === "") {
            console.log("[DEBUG] parseTimestamp - empty timestamp, using current date");
            return new Date();
        }

        // 尝试直接转换（可能是标准格式）
        const directDate = new Date(timestamp);
        if (!isNaN(directDate.getTime())) {
            console.log("[DEBUG] parseTimestamp - direct conversion successful:", directDate);
            return directDate;
        }

        // 解析思源笔记格式：YYYYMMDDHHmmss
        const timestampStr = timestamp.toString();
        if (timestampStr.length === 14) {
            const year = parseInt(timestampStr.substring(0, 4));
            const month = parseInt(timestampStr.substring(4, 6)) - 1; // 月份从0开始
            const day = parseInt(timestampStr.substring(6, 8));
            const hour = parseInt(timestampStr.substring(8, 10));
            const minute = parseInt(timestampStr.substring(10, 12));
            const second = parseInt(timestampStr.substring(12, 14));

            const parsedDate = new Date(year, month, day, hour, minute, second);
            console.log("[DEBUG] parseTimestamp - parsed from format:", parsedDate);
            return parsedDate;
        }

        console.log("[DEBUG] parseTimestamp - unable to parse, using current date");
        return new Date();
    }

    /**
     * 对画廊文件进行排序
     */
    private sortGalleryFiles(files: IGalleryFile[], sortOrder: SortOrder): IGalleryFile[] {
        const sorted = [...files];

        switch (sortOrder) {
            case "date-desc":
                // 按创建日期倒序（最新的在前）
                sorted.sort((a, b) => {
                    return new Date(b.created).getTime() - new Date(a.created).getTime();
                });
                break;
            case "date-asc":
                // 按创建日期正序（最旧的在前）
                sorted.sort((a, b) => {
                    return new Date(a.created).getTime() - new Date(b.created).getTime();
                });
                break;
            case "reference-order":
                // 按文件内引用顺序（保持查询顺序）
                // 这里保持原顺序，因为查询时已经按 created DESC 排序
                break;
        }

        return sorted;
    }

    /**
     * 对画廊内的图片进行排序
     */
    private sortGalleryImages(images: IImageInfo[], sortOrder: ImageSortOrder): IImageInfo[] {
        const sorted = [...images];

        switch (sortOrder) {
            case "block-order":
                // 按块ID顺序（保持查询顺序）
                // 保持原顺序，因为查询时已经按 block_id 排序
                break;
            case "path-asc":
                // 按路径正序
                sorted.sort((a, b) => {
                    return a.src.localeCompare(b.src);
                });
                break;
            case "path-desc":
                // 按路径倒序
                sorted.sort((a, b) => {
                    return b.src.localeCompare(a.src);
                });
                break;
        }

        return sorted;
    }

    /**
     * 显示画廊管理界面
     */
    private async showGalleryManagement() {
        console.log("[DEBUG] showGalleryManagement called");

        // 如果已经有管理界面，先销毁
        this.destroyGalleryManagement();

        // 查询所有画廊文件
        const galleryFiles = await this.queryAllGalleryFiles();
        console.log("[DEBUG] Found", galleryFiles.length, "gallery files");

        if (galleryFiles.length === 0) {
            showMessage("未找到画廊文件");
            return;
        }

        // 创建管理界面覆盖层
        const overlay = document.createElement("div");
        overlay.className = "gallery-management-overlay";

        // 创建工具栏
        const toolbar = document.createElement("div");
        toolbar.className = "gallery-management-toolbar";

        const title = document.createElement("span");
        title.className = "gallery-management-title";
        title.textContent = "画廊文件管理";

        const closeBtn = document.createElement("button");
        closeBtn.className = "gallery-close-btn";
        closeBtn.textContent = "✕";
        closeBtn.onclick = () => this.destroyGalleryManagement();

        toolbar.appendChild(title);
        toolbar.appendChild(closeBtn);

        // 创建排序选择器
        const sortContainer = document.createElement("div");
        sortContainer.className = "gallery-management-sort";

        const sortLabel = document.createElement("span");
        sortLabel.textContent = "排序方式：";
        sortLabel.className = "gallery-management-sort-label";

        const sortSelect = document.createElement("select");
        sortSelect.className = "b3-select";
        sortSelect.innerHTML = `
            <option value="date-desc" ${this.currentSortOrder === "date-desc" ? "selected" : ""}>创建日期（倒序）</option>
            <option value="date-asc" ${this.currentSortOrder === "date-asc" ? "selected" : ""}>创建日期（正序）</option>
            <option value="reference-order" ${this.currentSortOrder === "reference-order" ? "selected" : ""}>引用顺序</option>
        `;

        sortSelect.onchange = () => {
            this.currentSortOrder = sortSelect.value as SortOrder;
            this.showGalleryManagement(); // 重新渲染
        };

        sortContainer.appendChild(sortLabel);
        sortContainer.appendChild(sortSelect);

        // 创建文件列表容器
        const listContainer = document.createElement("div");
        listContainer.className = "gallery-management-list";

        // 对文件进行排序
        const sortedFiles = this.sortGalleryFiles(galleryFiles, this.currentSortOrder);

        // 渲染文件列表
        for (const file of sortedFiles) {
            const fileItem = this.createGalleryFileItem(file);
            listContainer.appendChild(fileItem);
        }

        overlay.appendChild(toolbar);
        overlay.appendChild(sortContainer);
        overlay.appendChild(listContainer);

        // 添加到页面
        document.body.appendChild(overlay);
        this.galleryManagementOverlay = overlay;

        // 添加 ESC 键关闭功能
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.destroyGalleryManagement();
                document.removeEventListener("keydown", handleEscape);
            }
        };
        document.addEventListener("keydown", handleEscape);

        // 添加淡入动画
        setTimeout(() => {
            overlay.classList.add("show");
        }, 10);
    }

    /**
     * 销毁画廊管理界面
     */
    private destroyGalleryManagement() {
        console.log("[DEBUG] destroyGalleryManagement called");
        if (this.galleryManagementOverlay) {
            this.galleryManagementOverlay.remove();
            this.galleryManagementOverlay = null;
        }
    }

    /**
     * 创建画廊文件列表项
     */
    private createGalleryFileItem(file: IGalleryFile): HTMLElement {
        const item = document.createElement("div");
        item.className = "gallery-file-item";

        const nameContainer = document.createElement("div");
        nameContainer.className = "gallery-file-name";
        nameContainer.textContent = file.name;

        const infoContainer = document.createElement("div");
        infoContainer.className = "gallery-file-info";

        const dateSpan = document.createElement("span");
        dateSpan.className = "gallery-file-date";
        const date = this.parseTimestamp(file.created);
        console.log("[DEBUG] createGalleryFileItem - raw created:", file.created, "parsed date:", date);
        dateSpan.textContent = `创建于 ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

        const countSpan = document.createElement("span");
        countSpan.className = "gallery-file-count";
        countSpan.textContent = `${file.imageCount} 张图片`;

        infoContainer.appendChild(dateSpan);
        infoContainer.appendChild(countSpan);

        const manageBtn = document.createElement("button");
        manageBtn.className = "b3-button b3-button--outline gallery-file-manage-btn";
        manageBtn.textContent = "管理";
        manageBtn.onclick = () => {
            this.showSingleGalleryManagement(file);
        };

        item.appendChild(nameContainer);
        item.appendChild(infoContainer);
        item.appendChild(manageBtn);

        return item;
    }

    /**
     * 显示单个画廊文件的管理界面
     */
    private async showSingleGalleryManagement(file: IGalleryFile) {
        console.log("[DEBUG] showSingleGalleryManagement called for file:", file.id);

        // 销毁当前的管理界面
        this.destroyGalleryManagement();

        // 获取该画廊文件的详细图片信息
        const imageInfos = await this.getGalleryImageDetails(file.id);
        console.log("[DEBUG] Found", imageInfos.length, "images in gallery");

        // 创建单个画廊管理界面覆盖层
        const overlay = document.createElement("div");
        overlay.className = "gallery-management-overlay single-gallery-view";

        // 创建工具栏
        const toolbar = document.createElement("div");
        toolbar.className = "gallery-management-toolbar";

        const backBtn = document.createElement("button");
        backBtn.className = "b3-button b3-button--outline";
        backBtn.textContent = "← 返回";
        backBtn.onclick = () => {
            this.showGalleryManagement();
        };

        const title = document.createElement("span");
        title.className = "gallery-management-title";
        title.textContent = file.name;

        const closeBtn = document.createElement("button");
        closeBtn.className = "gallery-close-btn";
        closeBtn.textContent = "✕";
        closeBtn.onclick = () => this.destroyGalleryManagement();

        toolbar.appendChild(backBtn);
        toolbar.appendChild(title);
        toolbar.appendChild(closeBtn);

        overlay.appendChild(toolbar);

        // 继续添加其他部分...
        this.addSingleGalleryContent(overlay, file, imageInfos);

        // 添加到页面
        document.body.appendChild(overlay);
        this.galleryManagementOverlay = overlay;

        // 添加淡入动画
        setTimeout(() => {
            overlay.classList.add("show");
        }, 10);

        // 重置grid的scrollTop，确保从顶部开始显示
        setTimeout(() => {
            const gridContainer = overlay.querySelector('.single-gallery-grid') as HTMLElement;
            if (gridContainer) {
                gridContainer.scrollTop = 0;
                console.log("[DEBUG] Reset grid scrollTop to 0");
            }
        }, 50);
    }

    /**
     * 添加单个画廊管理界面的内容
     */
    private addSingleGalleryContent(overlay: HTMLElement, file: IGalleryFile, imageInfos: IImageInfo[]) {
        // 创建信息栏
        const infoBar = document.createElement("div");
        infoBar.className = "single-gallery-info-bar";

        const infoText = document.createElement("span");
        infoText.textContent = `共 ${imageInfos.length} 张图片`;
        infoBar.appendChild(infoText);

        // 添加图片排序选择器
        const sortLabel = document.createElement("span");
        sortLabel.textContent = "排序：";
        sortLabel.style.marginLeft = "20px";
        infoBar.appendChild(sortLabel);

        const sortSelect = document.createElement("select");
        sortSelect.className = "b3-select";
        sortSelect.innerHTML = `
            <option value="block-order" ${this.currentImageSortOrder === "block-order" ? "selected" : ""}>块顺序</option>
            <option value="path-asc" ${this.currentImageSortOrder === "path-asc" ? "selected" : ""}>路径（正序）</option>
            <option value="path-desc" ${this.currentImageSortOrder === "path-desc" ? "selected" : ""}>路径（倒序）</option>
        `;
        sortSelect.onchange = () => {
            this.currentImageSortOrder = sortSelect.value as ImageSortOrder;
            this.showSingleGalleryManagement(file); // 重新渲染
        };
        infoBar.appendChild(sortSelect);

        // 添加操作说明
        const tipText = document.createElement("span");
        tipText.textContent = "提示：添加或删除图片请直接编辑文档";
        tipText.style.marginLeft = "auto";
        tipText.style.color = "var(--b3-theme-on-surface-light)";
        tipText.style.fontSize = "12px";
        infoBar.appendChild(tipText);

        overlay.appendChild(infoBar);

        // 对图片进行排序
        const sortedImages = this.sortGalleryImages(imageInfos, this.currentImageSortOrder);

        // 创建图片网格容器
        const gridContainer = document.createElement("div");
        gridContainer.className = "single-gallery-grid";

        // 渲染图片列表（使用排序后的图片）
        for (const imageInfo of sortedImages) {
            const imageItem = this.createImageManagementItem(imageInfo, file);
            gridContainer.appendChild(imageItem);
        }

        overlay.appendChild(gridContainer);

        // 立即重置scrollTop，防止浏览器自动滚动
        gridContainer.scrollTop = 0;
        console.log("[DEBUG] Immediately reset grid scrollTop to 0 in addSingleGalleryContent");
    }

    /**
     * 创建图片管理项
     */
    private createImageManagementItem(imageInfo: IImageInfo, file: IGalleryFile): HTMLElement {
        console.log("[DEBUG] createImageManagementItem - imageInfo:", imageInfo);

        const item = document.createElement("div");
        item.className = "image-management-item";

        // 图片预览
        const imgPreview = document.createElement("div");
        imgPreview.className = "image-preview";

        const img = document.createElement("img");
        // 处理图片路径：确保路径格式正确
        const imageSrc = this.normalizeImagePath(imageInfo.src);
        console.log("[DEBUG] createImageManagementItem - original src:", imageInfo.src, "normalized src:", imageSrc);
        img.src = imageSrc;
        img.alt = "图片预览";
        // 移除 lazy loading 以确保图片立即加载

        // 添加加载中状态
        imgPreview.classList.add("loading");

        // 添加加载成功处理
        img.onload = () => {
            console.log("[DEBUG] Image loaded successfully:", imageSrc);
            imgPreview.classList.remove("loading");
            imgPreview.classList.add("loaded");
        };

        // 添加加载失败处理
        img.onerror = () => {
            console.error("[DEBUG] Image failed to load:", imageSrc);
            imgPreview.classList.remove("loading");
            imgPreview.classList.add("error");
            img.alt = "图片加载失败";
        };

        img.onclick = () => {
            // 点击查看大图
            this.showLightbox(imageSrc, [imageSrc]);
        };

        imgPreview.appendChild(img);

        // 图片信息
        const infoContainer = document.createElement("div");
        infoContainer.className = "image-info-container";

        const pathSpan = document.createElement("div");
        pathSpan.className = "image-path";
        pathSpan.textContent = imageInfo.src;
        pathSpan.title = imageInfo.src;

        const blockSpan = document.createElement("div");
        blockSpan.className = "image-block-info";
        blockSpan.textContent = `块ID: ${imageInfo.blockId}`;

        infoContainer.appendChild(pathSpan);
        infoContainer.appendChild(blockSpan);

        // 操作按钮
        const actionsContainer = document.createElement("div");
        actionsContainer.className = "image-actions";

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "b3-button b3-button--error";
        deleteBtn.textContent = "删除";
        deleteBtn.onclick = async () => {
            // 第一次确认：详细说明删除操作
            const firstConfirm = confirm(
                `⚠️ 警告：删除图片引用\n\n` +
                `即将删除以下图片的引用：\n${imageInfo.src}\n\n` +
                `注意：\n` +
                `• 此操作将从文档中删除该图片的 Markdown 引用\n` +
                `• 附件文件本身不会被删除，仍保留在 assets 目录中\n` +
                `• 如果该块只包含此图片，整个块将被删除\n\n` +
                `是否继续？`
            );

            if (firstConfirm) {
                // 第二次确认：最终确认
                const secondConfirm = confirm(
                    `⚠️ 最终确认\n\n` +
                    `确定要删除这张图片的引用吗？\n` +
                    `此操作不可撤销！`
                );

                if (secondConfirm) {
                    await this.deleteImageReference(imageInfo, file);
                }
            }
        };

        actionsContainer.appendChild(deleteBtn);

        item.appendChild(imgPreview);
        item.appendChild(infoContainer);
        item.appendChild(actionsContainer);

        return item;
    }

    /**
     * 删除图片引用
     */
    private async deleteImageReference(imageInfo: IImageInfo, file: IGalleryFile) {
        try {
            // 获取块的内容
            const blockSql = `SELECT markdown FROM blocks WHERE id = '${imageInfo.blockId}'`;
            const blockResult = await this.sqlQuery(blockSql);

            if (blockResult.length === 0) {
                showMessage("未找到图片所在的块");
                return;
            }

            const blockMarkdown = blockResult[0].markdown || "";

            // 从块内容中移除图片 markdown
            const newMarkdown = blockMarkdown.replace(imageInfo.markdown, "").trim();

            // 如果块内容为空，删除整个块
            if (newMarkdown === "") {
                const deleteResponse = await fetchSyncPost("/api/block/deleteBlock", {
                    id: imageInfo.blockId,
                });

                if (deleteResponse.code === 0) {
                    showMessage("图片引用已删除");
                    this.showSingleGalleryManagement(file);
                } else {
                    showMessage(`删除失败: ${deleteResponse.msg}`);
                }
            } else {
                // 更新块内容
                const updateResponse = await fetchSyncPost("/api/block/updateBlock", {
                    dataType: "markdown",
                    data: newMarkdown,
                    id: imageInfo.blockId,
                });

                if (updateResponse.code === 0) {
                    showMessage("图片引用已删除");
                    this.showSingleGalleryManagement(file);
                } else {
                    showMessage(`删除失败: ${updateResponse.msg}`);
                }
            }
        } catch (error) {
            console.error("[DEBUG] Error deleting image reference:", error);
            showMessage("删除图片引用失败");
        }
    }
}
