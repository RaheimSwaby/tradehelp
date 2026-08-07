import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = 8080
const DOCS_DIR = path.resolve(__dirname, '../docs')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'text/xml; charset=utf-8',
  '.xsl': 'text/xml; charset=utf-8'
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  if (reqPath === '/') reqPath = '/index.html'
  const filePath = path.join(DOCS_DIR, reqPath)

  if (!filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      return res.end('<h1>404 Not Found</h1>')
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    })
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🌐 Landing page live demo running at http://localhost:${PORT}/`)
})
