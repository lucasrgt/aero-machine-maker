// Simple launcher: compile Electron + build Vite + launch
// Handles ELECTRON_RUN_AS_NODE issue in VS Code terminals
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

try {
  // 1. Compile Electron main/preload
  console.log('[1/3] Compiling Electron...')
  execSync('npx tsc --project tsconfig.electron.json', { cwd: root, stdio: 'inherit' })

  // 2. Build React app with Vite
  console.log('[2/3] Building React app...')
  execSync('npx vite build', { cwd: root, stdio: 'inherit' })

  // 3. Launch Electron
  console.log('[3/3] Launching Electron...')
  const electronBin = path.join(root, 'node_modules', 'electron', 'cli.js')
  const mainJs = path.join(root, 'dist-electron', 'main.js')

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn('node', [electronBin, mainJs], {
    stdio: 'inherit',
    cwd: root,
    env,
  })

  child.on('close', (code) => process.exit(code || 0))
} catch (err) {
  console.error('Error:', err)
  process.exit(1)
}
