# SiYuan Note - Image Waterfall Gallery Plugin

English | [简体中文](https://github.com/A-G-guy/image-waterfall-gallery/blob/main/README_zh_CN.md)

## 📖 Introduction

The Image Waterfall Gallery plugin provides an immersive image viewing experience for SiYuan Note. When you open a document with the `#gallery` tag, the plugin automatically extracts all images in the document and displays them fullscreen in a waterfall layout, so you can focus on images without text distractions.

## ✨ Features

### Gallery Viewing

- 🎯 **Auto Trigger**: Automatically enters gallery mode when opening documents with `#gallery` tag
- 🏞️ **Waterfall Layout**: Equal-width, variable-height waterfall layout to maximize screen space
- 🔍 **Lightbox View**: Click images to view in a lightbox with left/right navigation
- 🌙 **Theme Adaptation**: Automatically adapts to SiYuan's dark/light themes
- 📱 **Responsive Design**: Supports desktop and mobile with automatic column adjustment
- ⚡ **Performance Optimization**: Lazy loading to improve loading speed
- 🎬 **Elegant Animations**: Fade-in animation for a smooth visual experience
- ⌨️ **Quick Actions**: Press `ESC` to quickly exit gallery mode

### Gallery Management

- 📂 **File Management**: View and manage all documents with `#gallery` tag
- 🔄 **File Sorting**: Sort by creation date (ascending/descending) or reference order
- 🖼️ **Image Management**: View image details of a single gallery document
- ➕ **Add Images**: Upload images via file picker and auto-insert into the document
- 🗑️ **Delete References**: Delete image references (keep attachment files) with double confirmation
- 📋 **Image Sorting**: Sort images by block order or path (ascending/descending)

### Plugin Settings

- 🎲 **Image Order**: Random / sequential / reverse
- 💻 **Desktop Width**: Customize desktop waterfall image width (200–600px)
- 📱 **Mobile Width**: Customize mobile waterfall image width (200–600px)
- 🔧 **Cross-platform Adaptation**: Auto-detect platform and apply corresponding width settings

## 📦 Installation

### Method 1: Marketplace (Recommended)

1. Open SiYuan Note
2. Go to `Settings` → `Marketplace` → `Plugins`
3. Search for "瀑布流画廊" or "Image Waterfall Gallery"
4. Click `Download` and enable the plugin

### Method 2: Manual

1. Download the latest `package.zip`
2. Extract to SiYuan's `data/plugins/` directory
3. Restart SiYuan Note
4. Enable the plugin in `Settings` → `Plugins`

## 🚀 Usage

### Basic Usage

1. Create or open a document containing images
2. At the top of the editor, you will see: Add tags, Add icon, Add cover
   - Click `Add tags`
   - Type `gallery` in the input box
   - Create a new tag or select the existing `gallery` tag
3. When you switch to this document, the plugin will automatically enter gallery mode

### Exit Gallery Mode

- Press `ESC`
- Click the close button `✕` in the top right corner

### Using Gallery Management

1. Open plugin settings (`Settings` → `Plugins` → `Image Waterfall Gallery`)
2. Click `Manage gallery files`
3. In the gallery file list:
   - Use the sort selector to adjust file order
   - Click `Manage` to open a single gallery's detailed view
4. In the single gallery management view:
   - Use the sort selector to adjust image order
   - Click `+ Add Image` to upload a new image into the gallery
   - Click an image to view it in the lightbox
   - Click `Delete` to delete an image reference (double confirmation required)

### Configure Plugin Settings

1. Open plugin settings (`Settings` → `Plugins` → `Image Waterfall Gallery`)
2. Configure options:
   - **Image Order**: Select display order in the waterfall
   - **Desktop Image Width**: Default 350px
   - **Mobile Image Width**: Default 300px
3. Click Confirm to save settings

### Use Cases

- 📸 **Photography Portfolio**: Showcase your photography work
- 🎨 **Design Inspiration Library**: Collect and browse design inspiration
- 🖼️ **Art Gallery**: Appreciate artworks
- 📚 **Image Notes**: Browse image-heavy notes

## ⚙️ Technical Architecture

### Core Technologies

- **Event Listening**: Uses `eventBus.on("switch-protyle")` to listen for document switches
- **Data Querying**: Queries document tags and image blocks via SQL API
- **Layout Solution**: Pure CSS waterfall layout using CSS Multi-column
- **Theme Adaptation**: Uses SiYuan CSS variables (e.g., `var(--b3-theme-background)`)

### File Structure

```text
image-waterfall-gallery/
├── src/
│   ├── index.ts          # Core logic
│   └── index.scss        # Styles
├── plugin.json           # Plugin configuration
├── icon.png              # Plugin icon
└── README.md             # Documentation
```

## 🔧 Development

### Requirements

- Node.js >= 16
- pnpm or npm

### Development Steps

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production build
npm run build
```

### Build Output

- `dist/index.js` - Main program
- `dist/index.css` - Styles
- `package.zip` - Plugin package

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT License

## 🙏 Acknowledgments

Thanks to the SiYuan Note team for providing an excellent platform and comprehensive plugin API.

---

**Tip**: If you like this plugin, please give it a ⭐ Star!
