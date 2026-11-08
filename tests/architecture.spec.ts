import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Architecture fitness functions: the import rules of docs/007-architecture.md, enforced instead of only written.
 * They are deliberately coarse — the goal is to catch a boundary violation in review, not to re-implement a
 * module graph tool.
 */
const ROOT = resolve(import.meta.dirname, '..')
const posix = (path: string): string => path.split(sep).join('/')
const sources = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
  .map(entry => posix(relative(ROOT, join(entry.parentPath, entry.name))))
const imports = (file: string): string[] => {
  const text = readFileSync(join(ROOT, file), 'utf8')
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]!)
}
const resolveImport = (file: string, specifier: string): string => posix(resolve(dirname(join(ROOT, file)), specifier).slice(ROOT.length + 1))

describe('architecture', () => {
  it('resolves every relative import in src to a file that exists', () => {
    const missing = sources.flatMap(file => imports(file).filter(specifier => specifier.startsWith('.')).flatMap(specifier => {
      // Vite raw imports (`./client.css?raw`) name an existing file with a query suffix.
      const target = resolveImport(file, specifier.split('?')[0]!)
      const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]
      return candidates.some(candidate => existsSync(join(ROOT, candidate))) ? [] : [`${file} -> ${specifier}`]
    }))
    expect(missing).toEqual([])
  })

  it('keeps src/core free of imports outside itself apart from Node built-ins', () => {
    const violations = sources.filter(file => file.startsWith('src/core/')).flatMap(file => imports(file)
      .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('node:'))
      .map(specifier => `${file} -> ${specifier}`))
    expect(violations).toEqual([])
  })

  it('keeps src/sources from importing the application layer', () => {
    const violations = sources.filter(file => file.startsWith('src/sources/')).flatMap(file => imports(file)
      .filter(specifier => resolveImport(file, specifier).startsWith('src/app/'))
      .map(specifier => `${file} -> ${specifier}`))
    expect(violations).toEqual([])
  })

  it('lets the panel import only the plain values of src/app/api.ts from the host side', () => {
    const violations = sources.filter(file => file.startsWith('src/client/')).flatMap(file => imports(file)
      .filter(specifier => resolveImport(file, specifier).startsWith('src/app/') && resolveImport(file, specifier) !== 'src/app/api.ts')
      .map(specifier => `${file} -> ${specifier}`))
    expect(violations).toEqual([])
  })
})
