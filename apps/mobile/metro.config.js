const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.resolve(projectRoot, "../../node_modules")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(projectRoot, "../../node_modules"),
];
config.resolver.disableHierarchicalLookup = false;
module.exports = config;
