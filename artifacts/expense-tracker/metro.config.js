const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'wasm');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName.includes('wa-sqlite') ||
      moduleName.includes('.wasm') ||
      moduleName === 'react-native-get-sms-android'
    ) {
      return { type: 'empty' };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
