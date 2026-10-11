import { defineConfig } from 'vite';

export default defineConfig({
  // Vite 8 no longer treats .glb as an asset by default.
  assetsInclude: ['**/*.glb'],
});
