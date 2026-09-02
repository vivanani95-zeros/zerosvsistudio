# Reliable 3D, Song, and Code Generation

## Goal
Make all three long-form creation modes finish reliably and produce a usable preview/download instead of ending with partial code or an endless rendering state.

## Changes
- Replace fragile “one huge chat response” generation for 3D, songs, and websites with dedicated structured generation endpoints that can validate and repair the result before returning it.
- Keep Tripo as the primary 3D path, but make fallback geometry deterministic and immediately previewable rather than depending on thousands of generated JavaScript lines. Use instancing and dense procedural geometry for a visually detailed asset without freezing the browser.
- Move song audio rendering off the main UI path, validate/normalize song specifications, bound expensive synthesis work, and always expose progress, success, and actionable failure states.
- Represent generated websites as a multi-file project (`index.html`, `styles.css`, `script.js`, plus any extra generated files), preview the assembled project, and allow downloading every file together.
- Harden stream parsing so final buffered data is not lost, detect truncated structured output, and surface a retry/repair path instead of silently leaving an incomplete assistant message.

## Validation
- Exercise 3D fallback generation and confirm the model renders, orbits, and exports to GLB.
- Generate a song and confirm rendering terminates with a playable downloadable WAV.
- Generate a website and confirm all files appear and the assembled preview runs.
- Check browser console/runtime output for crashes and verify the three workflows at desktop and mobile widths.

## Technical details
- Avoid literal millions of separate meshes, which would exhaust browser memory; achieve high apparent density with high-resolution base geometry, instancing, and procedural detail while preserving a stable preview.
- Long AI calls remain streamed with no artificial generation deadline. Validation happens after stream completion.
