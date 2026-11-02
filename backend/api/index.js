// Vercel function: every request is rewritten here (vercel.json) and served by the compiled Nest app.
export { default } from '../dist/serverless.bundle.mjs';
