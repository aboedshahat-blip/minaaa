import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/]react(?:-dom)?[\\/]/,
              priority: 20,
            },
            {
              name: 'supabase-vendor',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'offline-assets-manifest',
      generateBundle(_options, bundle) {
        const files = Object.keys(bundle)
          .filter((file) => /\.(?:js|css|mjs|wasm|png|jpe?g|svg|woff2?)$/i.test(file))
          .map((file) => `/${file}`);
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify(files),
        });
      },
    },
  ],
  server: {
    host: true, // Listen on all network interfaces (allows mobile access on same Wi-Fi)
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
