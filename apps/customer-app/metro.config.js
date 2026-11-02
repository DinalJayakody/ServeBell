// Expo's default config (auto-configured for this monorepo) plus one override:
// resolve `three` to its ES-module build. The CJS entry used by
// some dependants call Node-only APIs that crash in React Native.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const threeModule = path.join(path.dirname(require.resolve('three')), 'three.module.js');

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
