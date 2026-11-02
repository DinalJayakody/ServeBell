/**
 * Bundles the compiled API (dist/serverless.js) into one ES module for Vercel.
 * Vercel's function loader rejects require() of ES modules (NestJS 12 is ESM-only,
 * some Nest plugins are CommonJS), so packages are resolved at build time instead.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/serverless.js'],
  outfile: 'dist/serverless.bundle.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // CommonJS code inside the bundle still needs these.
  banner: {
    js: [
      "import { createRequire as __sbCreateRequire } from 'node:module';",
      "import { fileURLToPath as __sbFileURLToPath } from 'node:url';",
      "import { dirname as __sbDirname } from 'node:path';",
      'const require = __sbCreateRequire(import.meta.url);',
      'const __filename = __sbFileURLToPath(import.meta.url);',
      'const __dirname = __sbDirname(__filename);',
    ].join('\n'),
  },
  // Native binaries, and optional packages Nest only loads inside try/catch when installed.
  external: [
    'sharp',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/platform-fastify',
    '@fastify/*',
    'class-transformer',
    'class-transformer/*',
    'class-validator',
    'bufferutil',
    'utf-8-validate',
    'pino-pretty',
  ],
  // Nest uses class names in logs and some injection tokens.
  keepNames: true,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('✔ Bundled dist/serverless.bundle.mjs');
