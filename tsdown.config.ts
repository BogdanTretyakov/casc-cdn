import { defineConfig } from 'tsdown';

// Reference: https://tsdown.dev/reference/config-options
export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  hash: false,
  copy: ['README.md', 'LICENSE', 'package.json'],
});
