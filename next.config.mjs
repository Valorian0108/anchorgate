/**
 * No transforms of our own. One note on CSS:
 *
 * Turbopack runs every stylesheet through Lightning CSS, whose default
 * browser targets (safari 16.4 among them) make it rewrite `backdrop-filter`
 * to ONLY `-webkit-backdrop-filter` — which silently removes the blur from
 * the two frost objects on the live surfaces (top bar, instrument band) in
 * Chrome. The fix lives in package.json: the browserslist there targets
 * safari 18, where unprefixed backdrop-filter is native, so the declarations
 * pass through exactly as written (probe-verified in dev). Do not add
 * hand-written `-webkit-backdrop-filter` twins next to them: the minifier
 * dedupes equal var() values down to the webkit line only, and the blur dies
 * in Chrome.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
