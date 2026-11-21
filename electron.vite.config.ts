import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite builds three separate pieces of the app:
//   main     -> src/main      (the "backend": runs on your PC, can touch files)
//   preload  -> src/preload   (a small safe bridge between backend and UI)
//   renderer -> src/renderer  (the user interface, built with React)
export default defineConfig({
  main: { build: { rollupOptions: { external: ['node-unrar-js'] } } },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
