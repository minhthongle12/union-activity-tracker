import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'local-api-send-push',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/send-push')) {
              try {
                Object.assign(process.env, env)
                const handler = (await import('./api/send-push.ts')).default

                let body = {}
                if (req.method === 'POST') {
                  const buffers: any[] = []
                  for await (const chunk of req) {
                    buffers.push(chunk)
                  }
                  const data = Buffer.concat(buffers).toString()
                  if (data) {
                    try {
                      body = JSON.parse(data)
                    } catch {}
                  }
                }

                const mockReq = Object.assign(req, { body })
                const mockRes = Object.assign(res, {
                  status(code: number) {
                    res.statusCode = code
                    return this
                  },
                  json(data: any) {
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(data))
                    return this
                  },
                })

                await handler(mockReq, mockRes)
              } catch (e: any) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: e.message }))
              }
              return
            }
            next()
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
