import {defineConfig} from 'vite';
import legacy from '@vitejs/plugin-legacy';
export default defineConfig({base:'./',plugins:[legacy({targets:['Chrome >= 49'],modernTargets:['Chrome >= 64'],modernPolyfills:true,additionalLegacyPolyfills:['whatwg-fetch']})],server:{port:4173}});
