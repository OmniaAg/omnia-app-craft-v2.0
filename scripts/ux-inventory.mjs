import ts from 'typescript'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, relative, resolve } from 'node:path'

const root = process.cwd()
const out = 'artifacts/ux-refactor'
mkdirSync(out, { recursive: true })
const read = path => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const walk = (node, visit) => { visit(node); node.forEachChild(child => walk(child, visit)) }
const attr = (node, key) => node.attributes?.properties.find(property => property.name?.getText() === key)?.initializer
const value = node => node && ts.isStringLiteral(node) ? node.text : node?.getText() ?? ''
const files = new Map()
function scan(path) {
  path = relative(root, resolve(path)).replaceAll('\\', '/')
  if (files.has(path)) return files.get(path)
  const source = read(path)
  const entry = { path, components: [], controls: [], states: [], conditions: [], searchKeys: [], imports: [] }
  files.set(path, entry)
  let component = 'module'
  function visit(node) {
    const previous = component
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && /^[A-Z]/.test(node.name?.getText() ?? '')) {
      component = node.name.getText()
      if (!entry.components.includes(component)) entry.components.push(component)
    }
    const moduleName = ts.isImportDeclaration(node) ? node.moduleSpecifier.text : ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null
    if (moduleName?.startsWith('.')) {
      const imported = resolve(dirname(path), moduleName)
      const target = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'].map(suffix => imported + suffix).find(candidate => existsSync(candidate) && /\.[jt]sx?$/.test(candidate))
      if (target) entry.imports.push(relative(root, target).replaceAll('\\', '/'))
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText()
      const role = value(attr(node, 'role'))
      if (['button', 'a', 'NavLink', 'Link', 'input', 'textarea', 'select', 'form', 'details', 'summary', 'dialog'].includes(tag) || ['tab', 'tabpanel', 'dialog'].includes(role)) {
        const position = source.getLineAndCharacterOfPosition(node.getStart())
        const line = position.line + 1
        const column = position.character + 1
        const text = (ts.isJsxOpeningElement(node) ? node.parent.getText(source) : node.getText(source)).replace(/\s+/g, ' ').slice(0, 280)
        entry.controls.push({ id: `${path}:${line}:${column}`, component, tag, role, name: value(attr(node, 'aria-label')) || value(attr(node, 'name')) || value(attr(node, 'id')), line, column, text })
      }
    }
    if (ts.isPropertyAccessExpression(node) && /^(isPending|isError|isLoading)$/.test(node.name.text)) entry.states.push(node.getText(source))
    if (ts.isConditionalExpression(node) && /</.test(node.getText(source))) entry.conditions.push(node.condition.getText(source).slice(0,160))
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text==='get' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) entry.searchKeys.push(node.arguments[0].text)
    node.forEachChild(visit)
    component = previous
  }
  visit(source)
  entry.states = [...new Set(entry.states)]
  entry.conditions = [...new Set(entry.conditions)]
  entry.searchKeys = [...new Set(entry.searchKeys)]
  for (const imported of entry.imports) if (imported.startsWith('src/')) scan(imported)
  return entry
}
const source = read('src/app/router/routes.tsx')
const routes = []
function routeObjects(node, parent = '') {
  if (!ts.isObjectLiteralExpression(node)) return
  const properties = new Map(node.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(), property.initializer]))
  const segment = value(properties.get('path'))
  const path = segment.startsWith('/') ? segment : posix.join(parent || '/', segment)
  const children = properties.get('children')
  let module
  walk(properties.get('lazy') ?? node, child => {
    if (ts.isCallExpression(child) && child.expression.kind === ts.SyntaxKind.ImportKeyword && child.arguments[0] && ts.isStringLiteral(child.arguments[0])) module = relative(root, resolve('src/app/router', child.arguments[0].text + '.tsx')).replaceAll('\\', '/')
  })
  if (properties.has('lazy') || properties.has('index') || segment === '*') routes.push({ path, index: properties.has('index'), shell: Boolean(children), source: module ?? null, audited: false, final: 'FAIL' })
  if (module && existsSync(module)) scan(module)
  if (children && ts.isArrayLiteralExpression(children)) for (const child of children.elements) routeObjects(child, path)
}
walk(source, node => {
  if (ts.isVariableDeclaration(node) && node.name.getText() === 'appRoutes' && ts.isArrayLiteralExpression(node.initializer)) for (const route of node.initializer.elements) routeObjects(route)
})
scan('src/app/router/routes.tsx')
function graph(path, visited=new Set()) {
  if(!path||visited.has(path)||!files.has(path))return [...visited]
  visited.add(path)
  for(const imported of files.get(path).imports)graph(imported,visited)
  return [...visited]
}
for(const route of routes)route.graph=graph(route.source)
const result = { generatedAt: new Date().toISOString(), routes, files: [...files.values()], totals: { routes: routes.length, files: files.size, controls: [...files.values()].reduce((count, file) => count + file.controls.length, 0) } }
writeFileSync(`${out}/inventory.json`, JSON.stringify(result, null, 2))
writeFileSync(`${out}/COVERAGE_MATRIX.md`, '# Matriz de cobertura UX\n\nInventario AST del router y del grafo local de componentes. SÍ requiere evidencia funcional y visual específica; la inspección estática por sí sola no acredita PASS.\n\n| Ruta | Fuente | Auditado | Problemas UX | Cambio o conservación | Pruebas | Estado |\n|---|---|---|---|---|---|---|\n' + routes.map(route => `| ${route.path} | ${route.source ?? 'Resolución de contexto'} | NO | Pendiente | Pendiente | Pendiente | FAIL |`).join('\n') + '\n')
console.log(JSON.stringify(result.totals))
