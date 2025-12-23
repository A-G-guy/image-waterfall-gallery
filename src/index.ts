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

/**
 * 瀑布流画廊插件
 * 为带有 #gallery 标签的文档自动以瀑布流形式展示图片
 */
export default class ImageWaterfallGallery extends Plugin {
    private currentRootId: string = "";
    private galleryOverlay: HTMLElement | null = null;
    private lightboxOverlay: HTMLElement | null = null;
    private settings: IGallerySettings;

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
}
