import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['development', 'browser', 'module'] },
  server: { port: 5173, strictPort: true },
});
