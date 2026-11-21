// Tells TypeScript that importing a stylesheet (import './styles.css') is fine.
declare module '*.css'

// Vite: importing "something?url" gives the web address of that file.
declare module '*?url' {
  const url: string
  export default url
}
declare module '*.png' {
  const url: string
  export default url
}
