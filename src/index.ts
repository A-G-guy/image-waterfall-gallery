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
        const detail = event.detail;
        if (!detail || !detail.protyle || !detail.protyle.block) {
            return;
        }

        const rootId = detail.protyle.block.rootID;
        console.log("Document switched, rootID:", rootId);

        // 防抖处理：如果快速切换文档，只处理最新的
        this.currentRootId = rootId;

        // 检查文档是否有 #gallery 标签
        const hasGalleryTag = await this.checkTags(rootId);

        if (hasGalleryTag) {
            console.log("Document has #gallery tag, loading gallery...");
            await this.loadGallery(rootId);
        } else {
            // 如果当前文档没有 gallery 标签，销毁画廊
            this.destroyGallery();
        }
    }

    /**
     * 检查文档是否有 gallery 标签
     */
    private async checkTags(rootId: string): Promise<boolean> {
        const sql = `SELECT value FROM attributes WHERE block_id = '${rootId}' AND name = 'tags'`;

        try {
            const result = await this.sqlQuery(sql);
            if (result && result.length > 0) {
                const tags = result[0].value || "";
                return tags.includes("gallery");
            }
        } catch (error) {
            console.error("Error checking tags:", error);
        }

        return false;
    }

    /**
     * 执行 SQL 查询
     */
    private async sqlQuery(sql: string): Promise<any[]> {
        try {
            const response = await fetchSyncPost("/api/query/sql", { stmt: sql });
            if (response.code === 0) {
                return response.data || [];
            } else {
                console.error("SQL query failed:", response.msg);
                return [];
            }
        } catch (error) {
            console.error("SQL query error:", error);
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
        const sql = `SELECT markdown FROM blocks WHERE root_id = '${rootId}' AND type = 'i' ORDER BY sort ASC`;

        try {
            const result = await this.sqlQuery(sql);
            const images: string[] = [];

            // 正则表达式匹配图片路径
            const regex = /!\[.*?\]\((.*?)(?:\s+".*?")?\)/;

            for (const row of result) {
                const markdown = row.markdown || "";
                const match = markdown.match(regex);
                if (match && match[1]) {
                    images.push(match[1]);
                }
            }

            return images;
        } catch (error) {
            console.error("Error extracting images:", error);
            return [];
        }
    }

    /**
     * 渲染画廊
     */
    private renderGallery(images: string[]) {
        // 如果已经有画廊，先销毁
        this.destroyGallery();

        // 创建画廊覆盖层
        const overlay = document.createElement("div");
        overlay.id = "gallery-overlay";
        overlay.className = "image-waterfall-gallery-overlay";

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

        // 创建瀑布流容器
        const container = document.createElement("div");
        container.className = "waterfall-container";

        // 添加图片
        for (const imageSrc of images) {
            const item = document.createElement("div");
            item.className = "waterfall-item";

            const img = document.createElement("img");
            img.src = imageSrc;
            img.loading = "lazy";
            img.onerror = () => {
                // 图片加载失败时隐藏
                item.style.display = "none";
            };

            item.appendChild(img);
            container.appendChild(item);
        }

        overlay.appendChild(toolbar);
        overlay.appendChild(container);

        // 添加到页面
        document.body.appendChild(overlay);
        this.galleryOverlay = overlay;

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
            overlay.classList.add("show");
        }, 10);
    }

    /**
     * 销毁画廊
     */
    private destroyGallery() {
        if (this.galleryOverlay) {
            this.galleryOverlay.remove();
            this.galleryOverlay = null;
        }
    }
}
