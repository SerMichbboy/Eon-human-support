const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.cacheVersion = '2';

// Web-only module redirects — native (iOS/Android) resolution is untouched
// in all cases below. See each shim file's own comment for why it exists.
const WEB_MODULE_REDIRECTS = {
  'react-native-reanimated': 'src/shared/reanimated-web-shim.tsx',
  'use-sync-external-store/shim': 'src/shared/use-sync-external-store-shim-web.ts',
  'use-sync-external-store/shim/with-selector': 'src/shared/use-sync-external-store-with-selector-shim-web.ts',
  // zustand's package.json "exports" map's "import"/"module" conditions point
  // at esm/index.mjs, which uses `import.meta.env` — a Vite-ism that's only
  // legal syntax inside a real ES module. Metro bundles everything into one
  // classic (non-module) script, so that raw `import.meta` text is a hard
  // SyntaxError that kills the *entire* bundle before anything can run — the
  // actual explanation for "blank screen, zero console output" seen while
  // debugging this (a parse-time error, not a runtime one; see
  // memory/project-web-target-blocked.md). Force resolution to the CJS
  // build (`index.js`, confirmed no `import.meta`) instead.
  zustand: 'node_modules/zustand/index.js',
  // expo-secure-store's web implementation is a bare `export default {}` —
  // every method throws "is not a function". Backed by localStorage instead
  // (see src/shared/expo-secure-store-web.ts).
  'expo-secure-store': 'src/shared/expo-secure-store-web.ts',
};

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  if (platform === 'web' && WEB_MODULE_REDIRECTS[moduleName]) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, WEB_MODULE_REDIRECTS[moduleName]),
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform, ...rest);
  }
  return context.resolveRequest(context, moduleName, platform, ...rest);
};

module.exports = config;
