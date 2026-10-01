import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {artPlugin} from './scripts/ui/art-plugin.mjs';

const client=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(client);
const api=process.env.FRONTLINE_API??'http://127.0.0.1:8080';

// Product client. The Go host serves /api (HTTP + match WebSockets); the dev
// server proxies it so typed runtime adapters behave identically in dev.
export default defineConfig({
 root:client,
 publicDir:path.join(client,'public'),
 plugins:[react(),artPlugin({assets:path.join(root,'assets')})],
 server:{
  host:'127.0.0.1',port:5173,strictPort:false,
  fs:{allow:[root]},
  proxy:{'/api':{target:api,ws:true,changeOrigin:false},'/ws':{target:api,ws:true}},
 },
 preview:{host:'127.0.0.1',proxy:{'/api':{target:api,ws:true}}},
 build:{outDir:path.join(client,'dist'),emptyOutDir:true,target:'es2022',sourcemap:true,manifest:'build-assets.json',assetsInlineLimit:0,chunkSizeWarningLimit:2048},
});
