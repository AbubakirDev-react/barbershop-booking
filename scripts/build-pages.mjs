// Сборка трёх сайтов для GitHub Pages из одного кода:
//   /<repo>/         — клиентский сайт
//   /<repo>/owner/   — кабинет владельца
//   /<repo>/master/  — кабинет мастера
// Запуск: node scripts/build-pages.mjs  (REPO_BASE по умолчанию /barbershop-booking/)
import { build } from 'vite'
import { writeFileSync } from 'node:fs'

const repoBase = process.env.REPO_BASE ?? '/barbershop-booking/'
const apps = [
  { app: 'client', base: repoBase, outDir: 'dist' },
  { app: 'owner', base: `${repoBase}owner/`, outDir: 'dist/owner' },
  { app: 'master', base: `${repoBase}master/`, outDir: 'dist/master' },
]

for (const { app, base, outDir } of apps) {
  process.env.VITE_APP = app
  process.env.PAGES_BASE = base
  console.log(`\n→ ${app}: ${base}`)
  // Клиентский сайт собирается первым и очищает dist; остальные кладутся внутрь
  await build({ base, build: { outDir, emptyOutDir: app === 'client' }, logLevel: 'warn' })
}

// GitHub Pages отдаёт 404.html на любой неизвестный путь. Перенаправляем в нужное
// приложение, передав исходный путь в ?p= — main.tsx восстановит адрес.
const redirect = `<!doctype html><meta charset="utf-8"><title>Перенаправление…</title><script>
(function () {
  var base = ${JSON.stringify(repoBase)};
  var path = location.pathname;
  var app = '';
  if (path.indexOf(base + 'owner/') === 0) app = 'owner/';
  else if (path.indexOf(base + 'master/') === 0) app = 'master/';
  var root = base + app;
  var rest = path.slice(root.length - 1) || '/';
  location.replace(root + '?p=' + encodeURIComponent(rest + location.search) + location.hash);
})();
</script>`
writeFileSync('dist/404.html', redirect)
writeFileSync('dist/.nojekyll', '')
console.log('\n✓ dist готов: клиент, owner, master, 404.html')
