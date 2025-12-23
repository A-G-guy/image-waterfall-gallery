import {
    Plugin,
    showMessage,
    fetchSyncPost,
    Setting,
    getFrontend,
} from "siyuan";
import "./index.scss";

const STORAGE_NAME = "gallery-settings";

interface IGallerySettings {
    imageOrder: "random" | "sequential" | "reverse";
    imageWidth: number; // 图片宽度（像素）
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

    async onload() {
        console.log("Loading Image Waterfall Gallery Plugin");

        // 初始化设置
        await this.loadSettings();

        // 创建设置界面
        this.initSettings();

        // 监听文档切换事件
        this.eventBus.on("switch-protyle", this.handleDocumentSwitch.bind(this));
    }

    onunload() {
        console.log("Unloading Image Waterfall Gallery Plugin");
        // 清理画廊覆盖层
        this.destroyGallery();
        this.destroyLightbox();
    }

    /**
     * 加载设置
     */
    private async loadSettings() {
        // 检测平台
        const frontend = getFrontend();
        const isMobile = frontend === "mobile" || frontend === "browser-mobile";

        // 根据平台设置默认图片宽度
        const defaultWidth = isMobile ? 300 : 350;

        // 加载保存的设置或使用默认值
        const savedSettings = await this.loadData(STORAGE_NAME);
        this.settings = {
            imageOrder: savedSettings?.imageOrder || "random",
            imageWidth: savedSettings?.imageWidth || defaultWidth,
        };

        console.log("[DEBUG] Settings loaded:", this.settings, "Platform:", frontend);
    }

    /**
     * 初始化设置界面
     */
    private initSettings() {
        const imageOrderSelect = document.createElement("select");
        imageOrderSelect.className = "b3-select fn__flex-center";
        imageOrderSelect.innerHTML = `
            <option value="random" ${this.settings.imageOrder === "random" ? "selected" : ""}>随机顺序</option>
            <option value="sequential" ${this.settings.imageOrder === "sequential" ? "selected" : ""}>顺序</option>
            <option value="reverse" ${this.settings.imageOrder === "reverse" ? "selected" : ""}>倒序</option>
        `;

        const imageWidthInput = document.createElement("input");
        imageWidthInput.className = "b3-text-field fn__flex-center";
        imageWidthInput.type = "number";
        imageWidthInput.min = "200";
        imageWidthInput.max = "600";
        imageWidthInput.step = "50";
        imageWidthInput.value = this.settings.imageWidth.toString();

        const galleryManagementBtn = document.createElement("button");
        galleryManagementBtn.className = "b3-button b3-button--outline";
        galleryManagementBtn.textContent = "管理画廊文件";
        galleryManagementBtn.onclick = () => {
            this.showGalleryManagement();
        };

        this.setting = new Setting({
            confirmCallback: () => {
                this.settings.imageOrder = imageOrderSelect.value as "random" | "sequential" | "reverse";
                this.settings.imageWidth = parseInt(imageWidthInput.value);
                this.saveData(STORAGE_NAME, this.settings);
                showMessage("设置已保存");
            }
        });

        this.setting.addItem({
            title: "图片顺序",
            description: "设置图片在瀑布流中的显示顺序",
            actionElement: imageOrderSelect,
        });

        this.setting.addItem({
            title: "图片宽度（像素）",
            description: "设置瀑布流中图片的宽度，范围 200-600",
            actionElement: imageWidthInput,
        });

        this.setting.addItem({
            title: "画廊文件管理",
            description: "查看和管理所有画廊文件",
            actionElement: galleryManagementBtn,
        });
    }

    /**
     * 处理文档切换事件
     */
    private async handleDocumentSwitch(event: any) {
        console.log("[DEBUG] handleDocumentSwitch called, event:", event);
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
     * 检查文档是否有 gallery 标签
     */
    private async checkTags(rootId: string): Promise<boolean> {
        // 标签存储在 blocks 表的 tag 字段中,格式为 #标签1# #标签2#
        const sql = `SELECT tag FROM blocks WHERE id = '${rootId}' AND type = 'd'`;
        console.log("[DEBUG] checkTags SQL:", sql);

        try {
            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] checkTags result:", result);

            if (result && result.length > 0) {
                const tags = result[0].tag || "";
                console.log("[DEBUG] Tags found:", tags);
                // 标签格式为 #gallery#,需要匹配完整格式
                const hasGallery = tags.includes("#gallery#") || tags.includes("gallery");
                console.log("[DEBUG] Contains 'gallery':", hasGallery);
                return hasGallery;
            } else {
                console.log("[DEBUG] No tags found for this document");
            }
        } catch (error) {
            console.error("[DEBUG] Error checking tags:", error);
        }

        return false;
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
        // 应用图片宽度设置
        container.style.setProperty("--gallery-image-width", `${this.settings.imageWidth}px`);
        console.log("[DEBUG] Created waterfall container with width:", this.settings.imageWidth);

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
        if (this.galleryOverlay) {
            console.log("[DEBUG] Removing overlay from DOM");
            this.galleryOverlay.remove();
            this.galleryOverlay = null;
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
     * 查询所有画廊文件
     */
    private async queryAllGalleryFiles(): Promise<IGalleryFile[]> {
        // 查询所有带有 #gallery# 标签的文档
        const sql = `
            SELECT id, content, created, updated
            FROM blocks
            WHERE type = 'd' AND (tag LIKE '%#gallery#%' OR tag LIKE '%gallery%')
            ORDER BY created DESC
        `;
        console.log("[DEBUG] queryAllGalleryFiles SQL:", sql);

        try {
            const result = await this.sqlQuery(sql);
            console.log("[DEBUG] queryAllGalleryFiles result count:", result.length);

            const galleryFiles: IGalleryFile[] = [];

            for (const row of result) {
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

            console.log("[DEBUG] Total gallery files found:", galleryFiles.length);
            return galleryFiles;
        } catch (error) {
            console.error("[DEBUG] Error querying gallery files:", error);
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

            const imageInfos: IImageInfo[] = [];
            const regex = /!\[.*?\]\((.*?)(?:\s+".*?")?\)/;

            for (const row of result) {
                const markdown = row.markdown || "";
                const match = markdown.match(regex);
                if (match && match[1]) {
                    imageInfos.push({
                        id: row.id,
                        markdown: markdown,
                        src: match[1],
                        blockId: row.block_id,
                        content: row.content || "",
                    });
                }
            }

            console.log("[DEBUG] Total image details extracted:", imageInfos.length);
            return imageInfos;
        } catch (error) {
            console.error("[DEBUG] Error getting image details:", error);
            return [];
        }
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
        const date = new Date(file.created);
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

        const addImageBtn = document.createElement("button");
        addImageBtn.className = "b3-button b3-button--outline";
        addImageBtn.textContent = "+ 添加图片";
        addImageBtn.onclick = () => {
            this.showAddImageDialog(file);
        };
        infoBar.appendChild(addImageBtn);

        overlay.appendChild(infoBar);

        // 创建图片网格容器
        const gridContainer = document.createElement("div");
        gridContainer.className = "single-gallery-grid";

        // 渲染图片列表
        for (const imageInfo of imageInfos) {
            const imageItem = this.createImageManagementItem(imageInfo, file);
            gridContainer.appendChild(imageItem);
        }

        overlay.appendChild(gridContainer);
    }

    /**
     * 创建图片管理项
     */
    private createImageManagementItem(imageInfo: IImageInfo, file: IGalleryFile): HTMLElement {
        const item = document.createElement("div");
        item.className = "image-management-item";

        // 图片预览
        const imgPreview = document.createElement("div");
        imgPreview.className = "image-preview";

        const img = document.createElement("img");
        img.src = imageInfo.src;
        img.loading = "lazy";
        img.onclick = () => {
            // 点击查看大图
            this.showLightbox(imageInfo.src, [imageInfo.src]);
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
            if (confirm("确定要删除这张图片的引用吗？")) {
                await this.deleteImageReference(imageInfo, file);
            }
        };

        actionsContainer.appendChild(deleteBtn);

        item.appendChild(imgPreview);
        item.appendChild(infoContainer);
        item.appendChild(actionsContainer);

        return item;
    }

    /**
     * 显示添加图片对话框
     */
    private showAddImageDialog(file: IGalleryFile) {
        const imagePath = prompt("请输入图片路径或URL：");
        if (!imagePath || imagePath.trim() === "") {
            return;
        }

        this.addImageToGallery(file, imagePath.trim());
    }

    /**
     * 添加图片到画廊
     */
    private async addImageToGallery(file: IGalleryFile, imagePath: string) {
        try {
            // 构造图片 markdown
            const imageMarkdown = `![](${imagePath})`;

            // 在文档末尾插入图片
            const response = await fetchSyncPost("/api/block/appendBlock", {
                dataType: "markdown",
                data: imageMarkdown,
                parentID: file.id,
            });

            if (response.code === 0) {
                showMessage("图片添加成功");
                // 刷新单个画廊管理界面
                this.showSingleGalleryManagement(file);
            } else {
                showMessage(`添加失败: ${response.msg}`);
            }
        } catch (error) {
            console.error("[DEBUG] Error adding image:", error);
            showMessage("添加图片失败");
        }
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
