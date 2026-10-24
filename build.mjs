// 构建脚本：esbuild 打包 + 压缩，把 CSS 与 JS 内联进单个 HTML
// 用法：node build.mjs [--dev]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');

const js = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  minify: !dev,
  sourcemap: false,
  write: false,
  legalComments: 'none',
  charset: 'utf8',
});
const css = await build({
  entryPoints: [join(root, 'src/style.css')],
  bundle: true,
  minify: !dev,
  write: false,
  loader: { '.css': 'css' },
  charset: 'utf8',
});

let code = js.outputFiles[0].text;
// 防止脚本中出现的 </script 截断 HTML
code = code.replace(/<\/script/gi, '<\\/script');
const style = css.outputFiles[0].text;
const tpl = readFileSync(join(root, 'src/index.html'), 'utf8');
const html = tpl
  .replace('/*{{STYLE}}*/', () => style)
  .replace('/*{{SCRIPT}}*/', () => code);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', '无限庭院.html');
writeFileSync(out, html);
writeFileSync(join(root, 'dist', 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ dist/无限庭院.html  ${kb} KB${dev ? '  (dev)' : ''}`);
