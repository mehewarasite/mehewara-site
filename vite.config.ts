import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function turnstileDevPlugin(env: Record<string, string>) {
  return {
    name: 'turnstile-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use('/api/verify-turnstile', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let raw = '';
        req.on('data', (chunk: any) => { raw += chunk; });
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw || '{}');
            const { token } = body;
            const secret = env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET;

            if (!secret) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                devNotice: 'TURNSTILE_SECRET not set in local .env; dev bypass granted'
              }));
              return;
            }

            const formData = new URLSearchParams({ secret, response: token });
            const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: formData
            });

            const data = await cfRes.json();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = data.success ? 200 : 403;
            res.end(JSON.stringify(data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/',
    plugins: [react(), tailwindcss(), turnstileDevPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/v1': {
          target: env.VITE_PROXY_TARGET || 'https://mehewara-v2-api-production.mehewara-site.workers.dev',
          changeOrigin: true,
          secure: true,
          headers: {
            Origin: 'http://localhost:5173',
          },
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1000
    }
  };
});