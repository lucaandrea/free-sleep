// A separate process for supervisor failures and deliberately malformed IPC. No HAP or hardware is loaded.
const mode = process.argv[2];
if (mode === 'stubborn') process.on('SIGTERM', () => {});
if (mode === 'silent' || mode === 'stubborn') setInterval(() => {}, 1000);
process.on('message', message => {
  if (message.type === 'start') {
    process.send({ type: 'status', status: { enabled: true, state: 'running', running: true,
      pairingCode: '321-54-876', setupURI: 'X-HM://TEST-ONLY', error: null } });
    if (mode === 'crash') setTimeout(() => { throw new Error('Deliberate test publisher crash'); }, 50);
  } else if (message.type === 'stop' && mode !== 'stubborn' && mode !== 'silent') process.exit(0);
  else if (message.type === 'exercise') for (const request of message.requests) process.send(request);
  else if (message.type === 'response') process.stdout.write(JSON.stringify(message) + '\n');
});
if (mode !== 'silent') process.send({ type: 'ready' });
