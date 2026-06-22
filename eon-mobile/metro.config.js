const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.cacheVersion = '2';

module.exports = config;
