const fs = require('fs'); 
const files = fs.readdirSync('scripts').filter(f => f.startsWith('test-') && f.endsWith('.mjs')); 
for (const file of files) { 
  const path = 'scripts/' + file; 
  let content = fs.readFileSync(path, 'utf8'); 
  if (!content.includes('TEST_PASSWORD')) { 
    content = content.replace(/import \{.*\} from 'node:crypto'/, "$&\nimport { TEST_PASSWORD } from './test-fixtures/credentials.mjs'"); 
  } 
  content = content.replace(/return `Omnia[^`]+?\$\{randomBytes\(\d+\)\.toString\('[^']+'\)\}`/, 'return TEST_PASSWORD'); 
  content = content.replace(/const secret = password \?\? `Omnia[^`]+?\$\{randomBytes\(\d+\)\.toString\('[^']+'\)\}`/, 'const secret = password ?? TEST_PASSWORD'); 
  content = content.replace(/const password = `Omnia[^`]+?\$\{randomBytes\(\d+\)\.toString\('[^']+'\)\}`/, 'const password = TEST_PASSWORD'); 
  fs.writeFileSync(path, content); 
}
