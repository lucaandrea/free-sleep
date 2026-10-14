import { fork, type ChildProcess } from 'node:child_process';
import { createDispatchGuard, type DispatchGuard } from '../../control/dispatchGuard.js';
import { DeviceStatusSchema, type DeviceStatus } from '../../routes/deviceStatus/deviceStatusSchema.js';
import { bridgeConfigurationSchema, childMessageSchema, HOMEKIT_BUSY, HOMEKIT_FAILURE, REQUEST_TIMEOUT_MS,
  type BridgeConfiguration, type ChildMessage, type HomeKitBridgeStatus, type HomeKitCommand, type ParentMessage } from './ipc.js';

interface SupervisorOptions {
  enabled: boolean;
  configuration: BridgeConfiguration;
  dispatch: (command: HomeKitCommand, assertCurrent: DispatchGuard) => Promise<DeviceStatus | null>;
  spawn?: () => ChildProcess;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
}
interface Request { abort: AbortController; timer: ReturnType<typeof setTimeout> }
interface Session {
  child: ChildProcess;
  active: boolean;
  initialized: boolean;
  lastRequestId: number;
  abort: AbortController;
  pending: Map<number, Request>;
  started: Promise<void>;
  resolveStarted: () => void;
  exited: Promise<void>;
  resolveExited: () => void;
  stopping?: Promise<void>;
  requestedStop: boolean;
  startupTimer?: ReturnType<typeof setTimeout>;
  stopTimers: ReturnType<typeof setTimeout>[];
}

// Explicit environment and exec arguments keep API keys and the parent's debugger/instrumentation out of HAP.
export function spawnHomeKitPublisher(): ChildProcess {
  const source = import.meta.url.endsWith('.ts');
  const environment = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_ENV']
    .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
  return fork(new URL(source ? './worker.ts' : './worker.js', import.meta.url), [], {
    env: environment, execArgv: source ? ['--import', import.meta.resolve('tsx')] : [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json',
  });
}

function emptyStatus(enabled: boolean, state: HomeKitBridgeStatus['state'], error: string | null = null): HomeKitBridgeStatus {
  return { enabled, state, running: false, pairingCode: null, setupURI: null, error };
}

export class HomeKitSupervisor {
  private current?: Session;
  private snapshot: HomeKitBridgeStatus;
  constructor(private readonly options: SupervisorOptions) {
    this.snapshot = emptyStatus(options.enabled, options.enabled ? 'stopped' : 'disabled');
  }

  status() { return { ...this.snapshot }; }

  private send(session: Session, message: ParentMessage) {
    if (!session.child.connected) return;
    try {
      session.child.send(message, error => {
        if (error && session.active) this.fail(session, 'HomeKit publisher connection was lost. Restart the server to retry');
      });
    } catch {
      if (session.active) this.fail(session, 'HomeKit publisher connection was lost. Restart the server to retry');
    }
  }

  private deactivate(session: Session) {
    session.active = false;
    session.abort.abort();
    clearTimeout(session.startupTimer);
    for (const request of session.pending.values()) clearTimeout(request.timer);
    session.resolveStarted();
  }

  private fail(session: Session, message: string) {
    if (this.current !== session || !session.active) return;
    this.snapshot = emptyStatus(true, 'error', message);
    this.deactivate(session);
    void this.terminate(session);
  }

  // Escalate only the child we created, and retain its handle if termination cannot be confirmed.
  private terminate(session: Session): Promise<void> {
    if (session.stopping) return session.stopping;
    const timeout = this.options.stopTimeoutMs ?? 5000;
    this.send(session, { type: 'stop' });
    session.stopping = new Promise(resolve => {
      const finish = () => { for (const timer of session.stopTimers) clearTimeout(timer); resolve(); };
      session.stopTimers.push(setTimeout(() => session.child.kill('SIGTERM'), Math.floor(timeout / 2)));
      session.stopTimers.push(setTimeout(() => session.child.kill('SIGKILL'), Math.floor(timeout * 0.8)));
      session.stopTimers.push(setTimeout(() => {
        if (this.current === session) this.snapshot = emptyStatus(true, 'error', 'HomeKit publisher has not exited; restart is blocked');
        finish();
      }, timeout));
      void session.exited.then(finish);
    });
    return session.stopping;
  }

  // Bound and expire work before dispatch; the same guard follows it into the hardware queues.
  private request(session: Session, message: Extract<ChildMessage, { type: 'request' }>) {
    const { requestId, command, deadline } = message;
    const respond = (result: Extract<ParentMessage, { type: 'response' }>['result']) => {
      if (session.active) this.send(session, { type: 'response', requestId, result });
    };
    if (requestId <= session.lastRequestId) {
      respond({ ok: false, code: HOMEKIT_FAILURE });
      return;
    }
    session.lastRequestId = requestId;
    if (this.snapshot.state !== 'running' || deadline <= Date.now() || deadline > Date.now() + REQUEST_TIMEOUT_MS + 1000) {
      respond({ ok: false, code: HOMEKIT_FAILURE });
      return;
    }
    if (session.pending.size >= (command.action === 'stop' ? 33 : 32)) {
      respond({ ok: false, code: HOMEKIT_BUSY });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.max(0, deadline - Date.now()));
    timer.unref();
    session.pending.set(requestId, { abort, timer });
    const signal = AbortSignal.any([abort.signal, session.abort.signal]);
    const assertCurrent = createDispatchGuard(signal, deadline);
    void (async () => {
      try {
        assertCurrent();
        const value = await this.options.dispatch(command, assertCurrent);
        assertCurrent();
        respond({ ok: true, value: command.action === 'read' ? DeviceStatusSchema.parse(value) : null });
      } catch {
        respond({ ok: false, code: HOMEKIT_FAILURE });
      } finally {
        clearTimeout(timer);
        session.pending.delete(requestId);
      }
    })();
  }

  // Retire an invalid publisher instead of interpreting unknown messages as control requests.
  private receive(session: Session, input: unknown) {
    if (this.current !== session || !session.active) return;
    const parsed = childMessageSchema.safeParse(input);
    if (!parsed.success) return this.fail(session, 'HomeKit publisher sent an invalid message. Restart the server to retry');
    const message = parsed.data;
    if (message.type === 'ready') {
      if (session.initialized) return this.fail(session, 'HomeKit publisher initialized more than once');
      session.initialized = true;
      this.send(session, { type: 'start', configuration: this.options.configuration });
    } else if (message.type === 'status') {
      if (!session.initialized || !message.status.enabled) return this.fail(session, 'HomeKit publisher state is invalid');
      if (message.status.state === 'error') return this.fail(session, message.status.error ?? 'HomeKit publisher could not start');
      if (message.status.state !== 'starting' && message.status.state !== 'running') {
        return this.fail(session, 'HomeKit publisher stopped unexpectedly. Restart the server to retry');
      }
      this.snapshot = message.status;
      if (message.status.running) {
        clearTimeout(session.startupTimer);
        session.resolveStarted();
      }
    } else if (message.type === 'request') {
      this.request(session, message);
    } else if (message.type === 'cancel') {
      session.pending.get(message.requestId)?.abort.abort();
    } else {
      const detail = message.code === 'EADDRINUSE' ? 'The HomeKit port is already in use'
        : message.code === 'EACCES' ? 'The HomeKit port cannot be opened'
          : message.code === 'EAFNOSUPPORT' ? 'The HomeKit network address is unavailable' : 'HomeKit publisher failed';
      this.fail(session, `${detail}. Pod controls remain available. Restart the server after correcting its configuration`);
    }
  }

  // A replacement may start only after the owned process has exited; failed requests are never replayed.
  start(): Promise<void> {
    if (!this.options.enabled) return Promise.resolve();
    if (this.current) {
      const session = this.current;
      if (session.active) return session.started;
      return this.terminate(session).then(() => this.current === session ? undefined : this.start());
    }
    const configuration = bridgeConfigurationSchema.safeParse(this.options.configuration);
    if (!configuration.success) {
      this.snapshot = emptyStatus(true, 'error', 'Check HOMEKIT_PORT (1–65535), HOMEKIT_BIND (IP address) and HomeKit storage');
      return Promise.resolve();
    }
    this.snapshot = emptyStatus(true, 'starting');
    let child: ChildProcess;
    try { child = (this.options.spawn ?? spawnHomeKitPublisher)(); }
    catch {
      this.snapshot = emptyStatus(true, 'error', 'HomeKit publisher could not launch. Pod controls remain available');
      return Promise.resolve();
    }
    let resolveStarted!: () => void;
    let resolveExited!: () => void;
    const session: Session = { child, active: true, initialized: false, lastRequestId: 0, abort: new AbortController(),
      pending: new Map(), started: new Promise(resolve => { resolveStarted = resolve; }), resolveStarted: () => resolveStarted(),
      exited: new Promise(resolve => { resolveExited = resolve; }), resolveExited: () => resolveExited(),
      requestedStop: false, stopTimers: [] };
    this.current = session;
    child.on('message', message => this.receive(session, message));
    child.on('error', () => this.fail(session, 'HomeKit publisher could not run. Pod controls remain available'));
    child.on('disconnect', () => this.fail(session, 'HomeKit publisher disconnected. Pod controls remain available'));
    let exited = false;
    const finish = () => {
      if (exited) return;
      exited = true;
      if (session.active) this.snapshot = emptyStatus(true, 'error', 'HomeKit publisher exited. Pod controls remain available');
      this.deactivate(session);
      for (const timer of session.stopTimers) clearTimeout(timer);
      if (this.current === session) {
        this.current = undefined;
        if (session.requestedStop) this.snapshot = emptyStatus(true, 'stopped');
      }
      session.resolveExited();
    };
    // Process exit proves the publisher is gone even if an IPC disconnect delays the close event.
    child.once('exit', finish);
    child.once('close', finish);
    session.startupTimer = setTimeout(() => this.fail(session, 'HomeKit publisher startup timed out. Pod controls remain available'),
      this.options.startupTimeoutMs ?? 45000);
    session.startupTimer.unref();
    return session.started;
  }

  async stop() {
    const session = this.current;
    if (!session) {
      this.snapshot = emptyStatus(this.options.enabled, this.options.enabled ? 'stopped' : 'disabled');
      return;
    }
    session.requestedStop = true;
    this.snapshot = emptyStatus(true, 'stopping');
    this.deactivate(session);
    await this.terminate(session);
  }
}
