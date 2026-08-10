import { useCallback, useEffect, useRef } from 'react';
import { ComputeWorkerClient } from '../services/ComputeWorkerClient';
import type {
  ComputeTaskKind,
  ComputeTaskPayload,
  ComputeTaskResult,
} from '../protocol/computeProtocol';

const createClient = () => new ComputeWorkerClient(() => new Worker(
  new URL('../compute.worker.ts', import.meta.url),
  { type: 'module' },
));

export type RunComputeTask = <TKind extends ComputeTaskKind>(
  kind: TKind,
  payload: ComputeTaskPayload<TKind>,
) => Promise<ComputeTaskResult<TKind>>;

export const useComputeWorker = (): RunComputeTask => {
  const clientRef = useRef<ComputeWorkerClient | null>(null);

  const runComputeTask: RunComputeTask = useCallback((kind, payload) => {
    if (!clientRef.current) {
      clientRef.current = createClient();
    }
    return clientRef.current.run(kind, payload);
  }, []);

  useEffect(() => () => {
    clientRef.current?.terminate();
    clientRef.current = null;
  }, []);

  return runComputeTask;
};
