import {
    Plugin,
    showMessage,
    fetchSyncPost,
} from "siyuan";
import "./index.scss";

/**
 * 瀑布流画廊插件
 * 为带有 #gallery 标签的文档自动以瀑布流形式展示图片
 */
export default class ImageWaterfallGallery extends Plugin {
    private currentRootId: string = "";
    private galleryOverlay: HTMLElement | null = null;

    async onload() {
        console.log("Loading Image Waterfall Gallery Plugin");

        // 监听文档切换事件
        this.eventBus.on("switch-protyle", this.handleDocumentSwitch.bind(this));
    }

    onunload() {
        console.log("Unloading Image Waterfall Gallery Plugin");
        // 清理画廊覆盖层
        this.destroyGallery();
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
        console.log("[DEBUG] Created waterfall container");

        // 添加图片
        for (const imageSrc of images) {
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
}
