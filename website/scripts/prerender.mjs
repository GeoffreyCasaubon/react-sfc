import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const routes = [
  { location: '/react-sfc/', out: 'dist/index.html' },
  { location: '/react-sfc/docs', out: 'dist/docs/index.html' },
]

const template = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf-8')
const { render } = await import(path.join(root, 'dist-ssr/entry-server.js'))

for (const { location, out } of routes) {
  const appHtml = render(location)
  const html = template.replace('<!--app-html-->', appHtml)
  const outPath = path.join(root, out)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
  console.log('pre-rendered:', out)
}
