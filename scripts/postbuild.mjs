// GitHub Pages deep-link fallback for a client-side router.
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
await copyFile(join(dist, 'index.html'), join(dist, '404.html'));
console.log('postbuild: dist/404.html written');
