export type DispatchGuard = () => void;

// Check at the actual write boundary: queued work can outlive the process that requested it.
export function createDispatchGuard(signal: AbortSignal, deadline: number, now = Date.now): DispatchGuard {
  return () => {
    if (signal.aborted || now() > deadline) throw new Error('Control request expired or was cancelled');
  };
}
