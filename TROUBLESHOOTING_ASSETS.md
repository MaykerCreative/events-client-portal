# Troubleshooting Fonts and Logos Not Loading

## Step 1: Verify Files Are Actually in Public Folder

The files MUST be directly in `/client-portal/public/` folder. Check:

```bash
cd "/Users/meganproby/Desktop/Event App Proposal/client-portal/public"
ls -la
```

You should see:
- `Mayker Reserve - Black - 2.png`
- `mayker_icon-black.png`
- `NeueHaasUnica-Regular.woff2`
- `NeueHaasUnica-Light.woff2`
- `NeueHaasUnica-Medium.woff2`
- `NeueHaasUnica-Bold.woff2`
- `test-domaine-text-light.woff2`
- `test-domaine-text-medium.woff2`
- `test-domaine-text-bold.woff2`
- (and other font files)

## Step 2: Clear All Caches

```bash
cd "/Users/meganproby/Desktop/Event App Proposal/client-portal"

# Clear React cache
rm -rf node_modules/.cache
rm -rf .cache
rm -rf build

# Clear npm cache (optional)
npm cache clean --force
```

## Step 3: Restart Dev Server

1. Stop the current server (Ctrl+C)
2. Start fresh:
```bash
npm start
```

## Step 4: Clear Browser Cache

- **Chrome/Edge**: Cmd+Shift+Delete (Mac) or Ctrl+Shift+Delete (Windows)
- **Or Hard Refresh**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

## Step 5: Check Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. Look for errors like:
   - `Failed to load resource: /NeueHaasUnica-Regular.woff2`
   - `404 (Not Found)`

4. Go to Network tab
5. Filter by "Font" or "Img"
6. Refresh page
7. Check if files show status 200 (success) or 404 (not found)

## Step 6: Verify File Names Match Exactly

File names are CASE-SENSITIVE and SPACE-SENSITIVE:

✅ Correct:
- `Mayker Reserve - Black - 2.png` (with spaces and hyphens)
- `mayker_icon-black.png` (lowercase, underscore)

❌ Wrong:
- `mayker reserve - black - 2.png` (wrong case)
- `MaykerReserve-Black-2.png` (no spaces)
- `Mayker Reserve - Black – 2.png` (en dash instead of hyphen)

## Step 7: Test Direct Access

Try accessing files directly in your browser:
- `http://localhost:3000/Mayker Reserve - Black - 2.png`
- `http://localhost:3000/NeueHaasUnica-Regular.woff2`

If these return 404, the files aren't in the public folder correctly.

## Step 8: Check File Permissions

```bash
cd "/Users/meganproby/Desktop/Event App Proposal/client-portal/public"
ls -la *.png *.woff2
```

Files should be readable (not have restricted permissions).

## Common Issues:

1. **Files in wrong location**: They must be in `public/` not `src/` or `public/assets/`
2. **Wrong filenames**: Must match exactly (case, spaces, hyphens)
3. **Dev server not restarted**: Must restart after adding files
4. **Browser cache**: Clear cache or use incognito mode
5. **Build cache**: Clear node_modules/.cache







