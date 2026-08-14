/**
 * 开发服务器启动脚本
 * 从 5173 开始逐个检测端口可用性（跳过被占用、或被 Windows 保留区间的端口），
 * 找到可用端口后再启动 Vite 开发服务器，避免 EACCES 报错。
 */
import { createServer as createNetServer } from 'node:net'
import { createServer as createViteServer } from 'vite'

const BASE_PORT = 5173
const MAX_ATTEMPTS = 200
const HOST = '0.0.0.0'

/** 尝试监听某个端口；成功则返回 true，占用或被系统保留则返回 false */
function canListen(port) {
  return new Promise((resolve) => {
    const server = createNetServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, HOST)
  })
}

async function findFreePort(start) {
  for (let port = start; port < start + MAX_ATTEMPTS; port++) {
    if (await canListen(port)) return port
  }
  throw new Error(`在 ${start}~${start + MAX_ATTEMPTS - 1} 区间内未找到可用端口`)
}

const port = await findFreePort(BASE_PORT)
console.log(`检测到可用端口：${port}`)

const server = await createViteServer({
  server: {
    host: HOST,
    port,
    strictPort: true,
  },
})

await server.listen()
server.printUrls()
