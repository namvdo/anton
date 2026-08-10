import {
  createComputeRequest,
  parseComputeResponse,
  type ComputeTaskKind,
  type ComputeTaskPayload,
  type ComputeTaskResult,
} from '../protocol/computeProtocol';

interface PendingRequest {
  kind: ComputeTaskKind;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export interface ComputeWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export class ComputeWorkerClient {
  #nextRequestId = 0;
  #pending = new Map<number, PendingRequest>();
  #worker: ComputeWorkerPort | null = null;
  readonly #workerFactory: () => ComputeWorkerPort;

  constructor(workerFactory: () => ComputeWorkerPort) {
    this.#workerFactory = workerFactory;
  }

  #ensureWorker(): ComputeWorkerPort {
    if (this.#worker) return this.#worker;

    const worker = this.#workerFactory();
    worker.onmessage = (event: MessageEvent<unknown>) => this.#handleMessage(event.data);
    worker.onerror = (event: ErrorEvent) => {
      this.#rejectAll(new Error(event.message || 'Compute worker error.'));
    };
    this.#worker = worker;
    return worker;
  }

  #handleMessage(rawResponse: unknown): void {
    let response;
    try {
      response = parseComputeResponse(rawResponse);
    } catch (error) {
      this.#rejectAll(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);

    if (response.kind !== pending.kind) {
      pending.reject(new Error(
        `Compute response kind mismatch: expected ${pending.kind}, received ${response.kind}.`,
      ));
      return;
    }

    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error));
  }

  #rejectAll(error: Error): void {
    this.#pending.forEach(({ reject }) => reject(error));
    this.#pending.clear();
  }

  run<TKind extends ComputeTaskKind>(
    kind: TKind,
    payload: ComputeTaskPayload<TKind>,
  ): Promise<ComputeTaskResult<TKind>> {
    const request = createComputeRequest(++this.#nextRequestId, kind, payload);
    const worker = this.#ensureWorker();

    return new Promise<ComputeTaskResult<TKind>>((resolve, reject) => {
      this.#pending.set(request.id, {
        kind: request.kind,
        resolve: (value) => resolve(value as ComputeTaskResult<TKind>),
        reject,
      });
      worker.postMessage(request);
    });
  }

  terminate(): void {
    this.#rejectAll(new Error('Compute worker terminated.'));
    this.#worker?.terminate();
    this.#worker = null;
  }
}
