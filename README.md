# Shan Font WordPress Plugin

![Shan Font WordPress Plugin](https://shanfont.com/wp-content/uploads/2025/07/shan-font-in-wordpress-1248x702.jpg)


The Shan Font plugin enables seamless integration of authentic Shan typography into your WordPress website. Designed specifically for Shan-speaking communities and cultural organizations, this plugin offers three distinct font modes to match your specific needs.

### Key Features

- **Three Font Modes:**
  - **Theme Defaults**: Preserves your theme's fonts with Shan fallback support
  - **Quick Setup**: Applies Shan fonts globally with one click
  - **Custom Selection**: Granular control over specific font weights

- **Performance Optimized:**
  - Uses modern WOFF2 format for faster loading
  - Implements `font-display: swap` for better user experience
  - Loads only selected font weights to minimize bandwidth

- **User Experience:**
  - Live preview functionality
  - Intuitive admin interface
  - Mobile-responsive design
  - Accessibility compliant

- **Complete Font Family:**
  - **Light**: Thin + Thin Italic
  - **Regular**: Regular + Italic
  - **Bold**: Bold + Bold Italic  
  - **Black**: Black + Black Italic

## Installation

### Automatic Installation (Recommended)
The easiest way to install Shan Font is directly from the official WordPress Plugin Repository:

1. Log in to your WordPress admin dashboard
2. Navigate to **Plugins > Add New**
3. Search for "Shan Font" or visit: https://wordpress.org/plugins/shan-font/
4. Click **Install Now** and then **Activate**
5. Configure settings under **Appearance > Shan Font**

### Alternative Installation Methods

#### From WordPress.org
1. Visit https://wordpress.org/plugins/shan-font/
2. Click **Download** to get the latest version
3. In your WordPress admin, go to **Plugins > Add New > Upload Plugin**
4. Choose the downloaded ZIP file and click **Install Now**
5. Activate the plugin and configure settings

#### Manual Installation
1. Download the plugin from https://wordpress.org/plugins/shan-font/
2. Extract and upload to `/wp-content/plugins/shan-font/` directory
3. Activate through **Plugins** menu in WordPress
4. Configure settings under **Appearance > Shan Font**

## Configuration

1. Go to **Appearance > Shan Font** in your admin menu
2. Choose from three font modes:
   - **Theme Defaults**: Keeps existing fonts, adds Shan support
   - **Quick Setup**: Applies Shan fonts site-wide instantly
   - **Custom Selection**: Choose specific weights and styles
3. Use the live preview to test different combinations
4. Save your settings and view your website

## Technical Specifications

- **Font Format**: WOFF2 (with WOFF fallback)
- **Browser Support**: All modern browsers (IE11+)
- **PHP Compatibility**: 7.4 - 8.3
- **WordPress Compatibility**: 5.0 - 6.6+
- **Multisite Compatible**: Yes
- **Translation Ready**: Yes

## Frequently Asked Questions

**Q: Will this plugin slow down my website?**  
A: No! The plugin is performance-optimized and only loads selected font weights. It uses modern loading techniques and font-display: swap for optimal performance.

**Q: Can I use this with any WordPress theme?**  
A: Absolutely! The plugin is designed to work with any properly coded WordPress theme. The "Theme Defaults" mode ensures compatibility.

**Q: Do I need to upload font files manually?**  
A: No, all necessary Shan font files are included with the plugin installation.

**Q: Is the plugin translation-ready?**  
A: Yes, the plugin includes translation files and follows WordPress internationalization standards.

**Q: Can I customize which elements use Shan fonts?**  
A: Yes, the "Custom Selection" mode allows granular control over font weights and application.

## Development

### Requirements
- Node.js 16+
- WordPress development environment
- PHP 7.4+

### Building
```bash
npm install
npm run build
