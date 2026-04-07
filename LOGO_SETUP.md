# 🎨 PhotoFlow Logo Setup Guide

## Quick Start

Your website is now configured to display your custom logo! Just follow these simple steps:

### Step 1: Prepare Your Logo Files

You need 2 image files:

1. **Main Logo** (`logo.png`)
   - Size: 40x40 pixels (or larger with square aspect ratio)
   - Format: PNG with transparent background (recommended) or JPG
   - This appears in the sidebar on all pages

2. **Favicon** (`favicon.png`)
   - Size: 32x32 pixels or 16x16 pixels
   - Format: PNG or ICO
   - This appears in the browser tab

### Step 2: Add Files to Your Project

Copy your logo files to:
```
E:\photoai_aws - Copy\public\images\
```

Place these two files:
- `logo.png`
- `favicon.png`

### Step 3: Restart the Server

If your server is running, restart it:
```bash
npm start
```

### Step 4: View Your Logo

Open your browser and visit:
```
http://localhost:5000
```

Your logo should now appear in:
- ✅ Sidebar (all pages)
- ✅ Browser tab icon

---

## ✨ What's Been Configured

All pages have been updated with logo support:

| Page | Logo Location | Favicon |
|------|---------------|---------|
| Events Dashboard (`index1.html`) | ✅ Sidebar | ✅ Yes |
| Analytics (`analytics.html`) | ✅ Sidebar | ✅ Yes |
| Settings (`settings.html`) | ✅ Sidebar | ✅ Yes |
| Photo Gallery (`photo-gallery.html`) | - | ✅ Yes |

### Smart Fallback

If the logo files are not found, a camera emoji (📸) placeholder will be shown instead, so the site won't look broken.

---

## 🎯 Logo Specifications

### Main Logo Best Practices

**Recommended:**
- Square dimensions (40x40px, 80x80px, or 120x120px)
- PNG format with transparent background
- Simple, clear design that works in light AND dark themes
- File size: Under 100KB

**Avoid:**
- Very detailed logos (hard to see at small size)
- White logos on transparent background (won't show in light theme)
- Black logos on transparent background (won't show in dark theme)

**Tip:** Use a logo with a color or include a subtle border/background

### Favicon Best Practices

**Recommended:**
- 32x32px or 16x16px
- Simple, recognizable icon
- PNG format
- File size: Under 50KB

---

## 🔧 Advanced Options

### Option 1: Use Different Filenames

If you want to use custom filenames like `mylogo.png`:

1. Rename your files in the `public/images/` folder
2. Update these HTML files:
   - `index1.html`
   - `analytics.html`
   - `settings.html`

Find and replace:
```html
<!-- Change this: -->
<img src="/public/images/logo.png" alt="PhotoFlow Logo" ...>

<!-- To this: -->
<img src="/public/images/mylogo.png" alt="PhotoFlow Logo" ...>
```

### Option 2: Use Online Hosted Logo

If your logo is hosted online (e.g., on your website):

Update the same files with your URL:
```html
<img src="https://yourdomain.com/logo.png" alt="PhotoFlow Logo" ...>
```

### Option 3: Use SVG Logo

SVG logos scale perfectly! Just:
1. Name your file `logo.svg`
2. Update the image source to `logo.svg`

---

## 📁 File Structure

Your logo folder structure:
```
photoai_aws - Copy/
├── public/
│   └── images/
│       ├── logo.png        ← Add your main logo here
│       ├── favicon.png     ← Add your favicon here
│       └── README.md       ← Detailed instructions
├── index1.html             ← Updated with logo
├── analytics.html          ← Updated with logo
├── settings.html           ← Updated with logo
└── photo-gallery.html      ← Updated with favicon
```

---

## 🎨 Theme Compatibility

Your logo will be displayed on:
- ✅ Light theme
- ✅ Dark theme
- ✅ Auto theme (system preference)

**Important:** Make sure your logo is visible on both light and dark backgrounds!

**Tips:**
- Use a colored logo (works on any background)
- Add a subtle border or background to your logo
- Test in both themes before finalizing

---

## ❓ Troubleshooting

**Logo not showing?**
- ✅ Check file is named exactly `logo.png` (case-sensitive)
- ✅ Check file is in `public/images/` folder
- ✅ Restart the server
- ✅ Clear browser cache (Ctrl+F5)

**Logo too small/large?**
- Resize your image to 40x40px
- Or update CSS in the HTML files (`.logo img { width: 40px; height: 40px; }`)

**Logo looks pixelated?**
- Use a higher resolution (80x80px or 120x120px)
- Consider using SVG format for perfect scaling

**Favicon not showing?**
- Clear browser cache completely
- Some browsers cache favicons aggressively
- Try a different browser to test

---

## 📞 Need Help?

Check the detailed instructions in:
```
public/images/README.md
```

Or contact support through the Settings → Help & Support form in your PhotoFlow dashboard!

---

**Happy branding! 🚀📸**
