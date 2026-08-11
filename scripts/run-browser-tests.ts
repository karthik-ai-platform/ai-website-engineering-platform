import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const port = 3000
const baseUrl = process.env.WEB_BASE_URL ?? `http://127.0.0.1:${port}`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const isWindows = process.platform === 'win32'

function createChildEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  if (!isWindows) {
    return { ...process.env, ...overrides }
  }

  const env: NodeJS.ProcessEnv = {}
  const seen = new Set<string>()

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.toLowerCase()
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    env[key] = value
  }

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value
  }

  return env
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Server is still starting.
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function stopProcessTree(pid: number): Promise<void> {
  if (isWindows) {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      env: createChildEnv(),
      stdio: 'ignore',
      windowsHide: true,
    })
    await Promise.race([once(killer, 'exit'), delay(5_000)])
    return
  }

  process.kill(-pid, 'SIGTERM')
}

async function run(): Promise<void> {
  if (process.env.WEB_BASE_URL) {
    await waitForHealth(new URL('/api/health', baseUrl).toString(), 60_000)
    const playwright = spawn(
      isWindows ? 'npx.cmd playwright test' : npxCommand,
      isWindows ? [] : ['playwright', 'test'],
      {
        cwd: root,
        env: createChildEnv({ WEB_BASE_URL: baseUrl }),
        shell: isWindows,
        stdio: 'inherit',
        windowsHide: true,
      },
    )
    const [code] = (await once(playwright, 'exit')) as [number | null]
    process.exit(code ?? 1)
  }

  const server = spawn(
    isWindows ? 'npm.cmd run start --workspace @platform/web' : npmCommand,
    isWindows ? [] : ['run', 'start', '--workspace', '@platform/web'],
    {
      cwd: root,
      detached: !isWindows,
      env: createChildEnv({
        NODE_ENV: 'production',
      }),
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)

  try {
    await waitForHealth(new URL('/api/health', baseUrl).toString(), 60_000)

    const playwright = spawn(
      isWindows ? 'npx.cmd playwright test' : npxCommand,
      isWindows ? [] : ['playwright', 'test'],
      {
        cwd: root,
        env: createChildEnv({ WEB_BASE_URL: baseUrl }),
        shell: isWindows,
        stdio: 'inherit',
        windowsHide: true,
      },
    )
    const [code] = (await once(playwright, 'exit')) as [number | null]

    if (code !== 0) {
      process.exit(code ?? 1)
    }
  } finally {
    if (server.pid) {
      await stopProcessTree(server.pid)
    }
    server.stdout.destroy()
    server.stderr.destroy()
  }

  process.exit(0)
}

await run()
