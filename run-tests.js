import { spawn } from 'child_process';

const args = process.argv.slice(2);
const jestTest = spawn('npx', ['jest', ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TERM: 'dumb'
  }
});

jestTest.on('exit', (code) => {
  process.exit(code);
}); 