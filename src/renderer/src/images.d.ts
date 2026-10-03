// Vite resolves imported images to a URL string.
declare module '*.png' {
  const src: string;
  export default src;
}
