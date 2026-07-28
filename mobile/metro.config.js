// Metro config. The defaults are fine for native; both additions below exist
// solely so the app can also run in a browser via `npm run web`, which is how
// layout and copy get reviewed without an emulator.
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// expo-sqlite runs on wa-sqlite in the browser and imports a .wasm binary,
// which Metro treats as source unless it is registered as an asset.
config.resolver.assetExts.push('wasm')

// wa-sqlite needs SharedArrayBuffer, which browsers only expose to
// cross-origin-isolated documents.
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  return middleware(request, response, next)
}

module.exports = config
