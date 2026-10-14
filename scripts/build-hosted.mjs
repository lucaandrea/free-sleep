import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const npmExecutable = process.env.npm_execpath ? process.execPath : 'npm';
const npmArguments = process.env.npm_execpath ? [process.env.npm_execpath] : [];

// The browser imports server schemas, so their dependencies are needed for typechecking.
// Skip server install hooks: this build never starts the Pod runtime or generates its database.
const steps = [
  ['Shared schema dependencies', ['--prefix', 'server', 'ci', '--include=dev', '--ignore-scripts']],
  ['Web build dependencies', ['--prefix', 'app', 'ci', '--include=dev']],
  ['Hosted web bundle', ['--prefix', 'app', 'run', 'build:hosted']],
  ['Gateway runtime dependencies', ['--prefix', 'gateway', 'ci', '--omit=dev']],
  ['Gateway transport tests', ['--prefix', 'gateway', 'test']],
];

for (const [label, argumentsForStep] of steps) {
  console.info(`\n${label}`);
  const result = spawnSync(npmExecutable, [...npmArguments, ...argumentsForStep], {
    cwd: repository, stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

console.info('\nHosted bundle and gateway are ready for deployment.');
