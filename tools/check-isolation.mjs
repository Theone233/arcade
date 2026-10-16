#!/usr/bin/env node
/**
 * 模块独立性检查（CI 必跑）：platform/、games/<id>/、packages/<name>/ 都必须能单独拆成一个仓库。
 *
 * 违规的情况：
 *   1. 代码或配置里的相对路径（import、require、new URL、tsconfig extends/paths、vite/wrangler 里的路径）指到本模块目录之外，
 *      唯一例外是指向 packages/ 下的共用包；
 *   2. package.json 的 file:/link: 依赖指到 packages/ 以外；
 *   3. 代码或配置里写死了本机绝对路径（/root/、/home/、/tmp/）；
 *   4. 模块缺少独立运行所需的文件（package.json、package-lock.json、.nvmrc、README.md、AGENTS.md）。
 *
 * 用法：node tools/check-isolation.mjs        （在仓库根目录执行，有违规时退出码 1）
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-cf', 'shots', '.wrangler', '.vite', '.git', 'coverage']);
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|html|css|yml|yaml)$/;
const REQUIRED = ['package.json', 'package-lock.json', '.nvmrc', 'README.md', 'AGENTS.md'];

function modules() {
  const out = [];
  if (existsSync(join(ROOT, 'platform'))) out.push(join(ROOT, 'platform'));
  for (const group of ['games', 'packages']) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(p);
    }
  }
  return out;
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* files(p);
    else if (CODE_EXT.test(name) && st.size < 2_000_000) yield p;
  }
}

const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
const PACKAGES = join(ROOT, 'packages');
const SPEC_RE = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  /['"](\.\.\/[^'"\s]*)['"]/g, // 配置里任何以 ../ 开头的字符串路径
];
const ABS_RE = /['"`](\/(?:root|home|tmp)\/[^'"`\s]*)['"`]/g;

const problems = [];
for (const mod of modules()) {
  const modRel = relative(ROOT, mod);
  for (const req of REQUIRED) {
    if (!existsSync(join(mod, req))) problems.push(`${modRel}: 缺少 ${req}`);
  }
  for (const file of files(mod)) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    const seen = new Set();
    for (const re of SPEC_RE) {
      for (const m of text.matchAll(re)) {
        const spec = m[1];
        if (!spec.startsWith('.') || seen.has(spec)) continue;
        seen.add(spec);
        const target = resolve(dirname(file), spec);
        if (!inside(target, mod) && !inside(target, PACKAGES)) {
          problems.push(`${rel}: 路径 "${spec}" 指到模块 ${modRel} 之外`);
        }
      }
    }
    for (const m of text.matchAll(ABS_RE)) {
      problems.push(`${rel}: 写死了本机绝对路径 "${m[1]}"`);
    }
    if (file.endsWith('package.json')) {
      let pkg;
      try { pkg = JSON.parse(text); } catch { continue; }
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, ver] of Object.entries(pkg[field] ?? {})) {
          const m = /^(?:file|link):(.+)$/.exec(String(ver));
          if (!m) continue;
          const target = resolve(dirname(file), m[1]);
          if (!inside(target, PACKAGES)) problems.push(`${rel}: 依赖 ${name} 指到 packages/ 以外（${ver}）`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error(`模块独立性检查失败（${problems.length} 处）：`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`模块独立性检查通过：${modules().map((m) => relative(ROOT, m)).join('、')}`);
