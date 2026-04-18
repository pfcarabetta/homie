// Metro config for Expo inside an npm workspaces monorepo.
//
// Default Metro only watches the package directory and resolves modules
// from its own node_modules. In a workspace setup, @homie/shared is
// symlinked at the repo root — Metro needs to be told (a) to watch the
// full workspace tree so it picks up changes, and (b) where to look for
// hoisted dependencies.
//
// Without this config, `import from '@homie/shared'` will fail with
// "Unable to resolve module" at bundle time.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so changes in @homie/shared trigger a refresh
config.watchFolders = [workspaceRoot];

// Resolve modules from both the local node_modules AND the hoisted root
// node_modules — npm workspaces hoist most deps to the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force Metro to use one copy of React (avoids "Invalid Hook Call" from
// duplicate React instances when the workspace has multiple).
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
