// Bundles the site's React islands into ../js/islands.js and ../css/islands.css.
// The site itself stays static; run this after editing anything in src/.
import { build, context } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const options = {
  entryPoints: { islands: join(here, 'src/main.tsx') },
  outdir: join(here, '..', 'js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  jsx: 'automatic',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
  // CSS imported by components lands beside the stylesheet, not the scripts.
  plugins: [
    {
      name: 'css-out',
      setup(b) {
        b.onEnd(async (result) => {
          if (result.errors.length) return;
          const { rename } = await import('node:fs/promises');
          await rename(join(here, '..', 'js', 'islands.css'), join(here, '..', 'css', 'islands.css')).catch(() => {});
        });
      }
    }
  ]
};

if (process.argv.includes('--watch')) await (await context(options)).watch();
else await build(options);
