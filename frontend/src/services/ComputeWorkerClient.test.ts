import { describe, expect, it, vi } from 'vitest';
import { ComputeWorkerClient, type ComputeWorkerPort } from './ComputeWorkerClient';

class FakeWorker implements ComputeWorkerPort {
  onmessage: ComputeWorkerPort['onmessage'] = null;
  onerror: ComputeWorkerPort['onerror'] = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe('ComputeWorkerClient', () => {
  it('resolves the matching typed response', async () => {
    const worker = new FakeWorker();
    const client = new ComputeWorkerClient(() => worker);
    const resultPromise = client.run('getUlamTransitions', { index: 4 });
    const request = worker.postMessage.mock.calls[0][0];

    worker.onmessage!({ data: { ...request, ok: true, result: [{ index: 9, probability: 0.75 }] } } as MessageEvent);

    await expect(resultPromise).resolves.toEqual([{ index: 9, probability: 0.75 }]);
  });

  it('rejects a mismatched response kind', async () => {
    const worker = new FakeWorker();
    const client = new ComputeWorkerClient(() => worker);
    const resultPromise = client.run('getUlamTransitions', { index: 4 });
    const request = worker.postMessage.mock.calls[0][0];

    worker.onmessage!({
      data: { id: request.id, kind: 'computeUlam', ok: true, result: {} },
    } as MessageEvent);

    await expect(resultPromise).rejects.toThrow('kind mismatch');
  });

  it('rejects pending work and terminates cleanly', async () => {
    const worker = new FakeWorker();
    const client = new ComputeWorkerClient(() => worker);
    const resultPromise = client.run('getUlamTransitions', { index: 4 });

    client.terminate();

    await expect(resultPromise).rejects.toThrow('terminated');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
