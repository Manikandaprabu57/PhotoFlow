# Logo Setup Instructions

## 📸 Add Your PhotoFlow Logo

### Quick Steps:

1. **Place your logo files in this folder:**
   - `logo.png` - Main logo (40x40px or larger, transparent background recommended)
   - `favicon.png` - Browser tab icon (16x16px or 32x32px)

2. **File Location:**
   ```
   E:\photoai_aws - Copy\public\images\
   ├── logo.png      (Main sidebar logo)
   └── favicon.png   (Browser tab icon)
   ```

3. **Restart the server** (if running) to see changes

---

## 🎨 Logo Requirements

### Main Logo (`logo.png`)
- **Recommended size:** 40x40 pixels (or any square size)
- **Format:** PNG (with transparent background), JPG, or SVG
- **Usage:** Displayed in sidebar on all pages
- **Works with:** Light and dark themes

### Favicon (`favicon.png`)
- **Recommended size:** 32x32px or 16x16px
- **Format:** PNG or ICO
- **Usage:** Browser tab icon

---

## ✅ What's Already Configured

All HTML files have been updated to use your logo:
- ✅ `index1.html` - Events Dashboard
- ✅ `analytics.html` - Analytics Dashboard  
- ✅ `settings.html` - Settings Page
- ✅ `photo-gallery.html` - Photo Gallery

**Fallback:** If `logo.png` is not found, a placeholder emoji (📸) will be shown.

---

## 🔧 Advanced: Using Different Filenames

If you want to use different filenames, update these files:

### For Logo (in sidebar):
Update in: `index1.html`, `analytics.html`, `settings.html`

Change line with:
```html
<img src="/public/images/logo.png" alt="PhotoFlow Logo" ...>
```

To:
```html
<img src="/public/images/your-custom-name.png" alt="PhotoFlow Logo" ...>
```

### For Favicon:
Update in: `index1.html`, `analytics.html`, `settings.html`, `photo-gallery.html`

Change line with:
```html
<link rel="icon" type="image/png" href="/public/images/favicon.png">
```

---

## 🌐 Alternative: Use External URL

If your logo is hosted online, you can use the URL directly:

```html
<!-- Logo -->
<img src="https://your-domain.com/logo.png" alt="PhotoFlow Logo">

<!-- Favicon -->
<link rel="icon" type="image/png" href="https://your-domain.com/favicon.png">
```

---

## 🎯 Current Status

**Status:** ✅ Logo system configured
**Action needed:** Add your `logo.png` and `favicon.png` files to this folder

**Test it:**
1. Add your logo files
2. Restart server: `npm start`
3. Open http://localhost:5000
4. Check sidebar and browser tab

