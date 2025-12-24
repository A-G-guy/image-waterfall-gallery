# SiYuan Note - Image Waterfall Gallery Plugin

English | [简体中文](README_zh_CN.md)

## 📖 Introduction

The Image Waterfall Gallery plugin provides an immersive image viewing experience for SiYuan Note. When you open a document with the `#gallery` tag, the plugin automatically extracts all images from the document and displays them in a beautiful waterfall layout in fullscreen mode, allowing you to focus on enjoying the images without text distractions.

## ✨ Features

### Gallery Viewing

- 🎯 **Auto Trigger**: Automatically enters gallery mode when opening documents with `#gallery` tag
- 🖼️ **Waterfall Layout**: Uses equal-width, variable-height waterfall layout to maximize screen space
- 🔍 **Lightbox View**: Click images to view in lightbox with navigation support
- 🎨 **Theme Adaptation**: Automatically adapts to SiYuan's dark/light themes
- 📱 **Responsive Design**: Supports desktop and mobile with automatic column adjustment
- ⚡ **Performance Optimization**: Lazy loading for improved loading speed
- 🎭 **Elegant Animations**: Fade-in animation effects for smooth visual experience
- ⌨️ **Quick Actions**: Press ESC to quickly exit gallery mode

### Gallery Management

- 📂 **File Management**: View and manage all documents with `#gallery` tag
- 🔄 **File Sorting**: Sort by creation date (ascending/descending) or reference order
- 🖼️ **Image Management**: View all image details in a single gallery file
- ➕ **Add Images**: Upload images to attachments via file selector and auto-insert into document
- 🗑️ **Delete References**: Delete image references (keep attachment files) with double confirmation protection
- 📊 **Image Sorting**: Sort images by block order, path ascending/descending

### Plugin Settings

- 🎲 **Image Order**: Set display order of images in waterfall (random/sequential/reverse)
- 💻 **Desktop Width**: Customize waterfall image width for desktop (200-600px)
- 📱 **Mobile Width**: Customize waterfall image width for mobile (200-600px)
- 🌐 **Cross-platform Adaptation**: Auto-detect platform and apply corresponding width settings

## 📦 Installation

### Method 1: Marketplace Installation (Recommended)

1. Open SiYuan Note
2. Go to `Settings` → `Marketplace` → `Plugins`
3. Search for "瀑布流画廊" or "Image Waterfall Gallery"
4. Click `Download` and enable the plugin

### Method 2: Manual Installation

1. Download the latest `package.zip`
2. Extract to SiYuan's `data/plugins/` directory
3. Restart SiYuan Note
4. Enable the plugin in `Settings` → `Plugins`

## 🚀 Usage

### Basic Usage

1. Create or open a document containing images
2. Add `#gallery` tag to the document
   - Click the `...` menu on the right side of the document title
   - Select `Properties` → `Tags`
   - Enter `gallery` and save
3. When switching to this document, the plugin will automatically enter gallery mode

### Exit Gallery Mode

- Press `ESC` key
- Click the close button `✕` in the top right corner

### Using Gallery Management

1. Open plugin settings (Settings → Plugins → Image Waterfall Gallery)
2. Click `Manage Gallery Files` button
3. In the gallery file list:
   - Use sort selector to adjust file display order
   - Click `Manage` button to enter detailed management of a single gallery
4. In single gallery management interface:
   - Use sort selector to adjust image display order
   - Click `+ Add Image` to upload new images to gallery
   - Click images to view in lightbox
   - Click `Delete` button to delete image references (requires double confirmation)

### Configure Plugin Settings

1. Open plugin settings (Settings → Plugins → Image Waterfall Gallery)
2. Configure the following options:
   - **Image Order**: Select display order of images in waterfall
   - **Desktop Image Width**: Set desktop image width (default 350px)
   - **Mobile Image Width**: Set mobile image width (default 300px)
3. Click confirm to save settings

### Use Cases

- 📸 **Photography Portfolio**: Showcase your photography work
- 🎨 **Design Inspiration Library**: Collect and browse design inspiration
- 🖼️ **Art Gallery**: Appreciate artworks
- 📚 **Image Notes**: Browse image-intensive notes

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
├── icon.png             # Plugin icon
└── README.md            # Documentation
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

## 📝 Changelog

### v1.0.1 (2025-12-24)

- 🐛 Fixed platform detection logic, support independent image width settings for desktop and mobile
- 🐛 Fixed add image button, changed to file selector and upload to attachments
- 🐛 Added strong warning for delete function, including two-step confirmation and detailed explanation
- 🐛 Fixed image sorting logic, added image sorting function for single gallery management page

### v1.0.0 (2025-12-23)

- 🎉 Initial release
- ✨ Implemented automatic waterfall gallery functionality
- 🎨 Theme adaptation support
- 📱 Responsive layout support
- ⚡ Image lazy loading optimization

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT License

## 🙏 Acknowledgments

Thanks to the SiYuan Note team for providing an excellent platform and comprehensive plugin API.

---

**Tip**: If you like this plugin, please give it a ⭐ Star!
