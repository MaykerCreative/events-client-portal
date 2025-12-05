# Font and Asset Setup Guide

## Problem
Fonts and logos are not loading because the files are not in the `public` folder.

## Solution

### Step 1: Add Font Files to Public Folder
Copy these font files to `/client-portal/public/`:

**NeueHaasUnica Fonts:**
- `NeueHaasUnica-Regular.woff2`
- `NeueHaasUnica-Light.woff2`
- `NeueHaasUnica-Medium.woff2`
- `NeueHaasUnica-Bold.woff2`
- `NeueHaasUnica-BoldItalic.woff2`
- `NeueHaasUnica-Italic.woff2`

**Domaine Text Fonts:**
- `test-domaine-text-light.woff2`
- `test-domaine-text-medium.woff2`
- `test-domaine-text-bold.woff2`
- `test-domaine-text-light-italic.woff2`
- `test-domaine-text-medium-italic.woff2`
- `test-domaine-text-bold-italic.woff2`
- `test-domaine-text-black.woff2`
- `test-domaine-text-black-italic.woff2`

### Step 2: Add Logo Files to Public Folder
Copy these image files to `/client-portal/public/`:

- `Mayker Reserve - Black - 2.png`
- `mayker_icon-black.png`
- `login-background.jpg` (if needed)

### Step 3: Verify File Structure
After adding files, your `public` folder should look like:
```
client-portal/public/
├── index.html
├── NeueHaasUnica-Regular.woff2
├── NeueHaasUnica-Light.woff2
├── NeueHaasUnica-Medium.woff2
├── NeueHaasUnica-Bold.woff2
├── test-domaine-text-light.woff2
├── test-domaine-text-medium.woff2
├── test-domaine-text-bold.woff2
├── test-domaine-text-light-italic.woff2
├── test-domaine-text-medium-italic.woff2
├── test-domaine-text-bold-italic.woff2
├── Mayker Reserve - Black - 2.png
├── mayker_icon-black.png
└── login-background.jpg
```

### Step 4: Restart Development Server
After adding files:
```bash
cd client-portal
npm start
```

### Step 5: Verify in Browser
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by "Font" or "Img"
4. Refresh page
5. Check that font files load with status 200

## Alternative: If Files Are Elsewhere

If your font/image files are in a different location, you can:

1. **Copy them manually:**
   ```bash
   # Example (adjust paths as needed)
   cp /path/to/fonts/*.woff2 /Users/meganproby/Desktop/Event\ App\ Proposal/client-portal/public/
   cp /path/to/images/*.png /Users/meganproby/Desktop/Event\ App\ Proposal/client-portal/public/
   ```

2. **Or use a symlink** (if files are in another location):
   ```bash
   cd client-portal/public
   ln -s /path/to/fonts/*.woff2 .
   ln -s /path/to/images/*.png .
   ```

## Troubleshooting

If fonts still don't load after adding files:

1. **Check file permissions:**
   ```bash
   ls -la client-portal/public/*.woff2
   ```

2. **Clear browser cache:**
   - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

3. **Check browser console:**
   - Look for 404 errors on font files
   - Verify paths match exactly (case-sensitive)

4. **Verify dev server is running:**
   - Make sure `npm start` is running
   - Check that files are accessible at `http://localhost:3000/NeueHaasUnica-Regular.woff2`









