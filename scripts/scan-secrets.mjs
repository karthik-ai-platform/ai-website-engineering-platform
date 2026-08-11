import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])

const findings = []
const patterns = [
  { name: 'private key', expression: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/g },
  { name: 'AWS access key', expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    name: 'GitHub token',
    expression: /\b(?:gh[oprsu]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  },
  { name: 'OpenAI-style key', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    name: 'assigned credential',
    expression:
      /(?:api[_-]?key|client[_-]?secret|password|private[_-]?key|secret|token)\s*[:=]\s*["']?([^\s,"']{12,})/gi,
  },
]

const placeholder = /(?:example|placeholder|replace|changeme|not-a-secret|invalid|\$\{|<[^>]+>)/i
const listedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split(/\r?\n/u)
  .filter(Boolean)

let scanned = 0

for (const file of listedFiles) {
  if (file.endsWith('.pdf') || !textExtensions.has(extname(file).toLowerCase())) continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  if (content.includes('\u0000')) continue
  scanned += 1

  for (const { name, expression } of patterns) {
    expression.lastIndex = 0
    for (const match of content.matchAll(expression)) {
      const candidate = match[1] ?? match[0]
      if (placeholder.test(candidate)) continue
      const line = content.slice(0, match.index).split(/\r?\n/u).length
      findings.push(`${file}:${line} (${name})`)
    }
  }
}

if (findings.length > 0) {
  console.error('Potential credentials detected:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`Secret scan passed (${scanned} text files scanned).`)
}
