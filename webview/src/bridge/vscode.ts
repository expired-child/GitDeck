import type { GitEvent, WebviewRequest, WebviewResponse } from './protocol';

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): unknown;
};

const vscodeApi = acquireVsCodeApi();

type EventListener = (event: GitEvent) => void;
const listeners = new Set<EventListener>();
const pending = new Map<string, (response: WebviewResponse) => void>();
let seq = 0;

window.addEventListener('message', event => {
    const message = event.data as WebviewResponse | GitEvent;
    if (!message || typeof message !== 'object') {
        return;
    }
    if ('requestId' in message && typeof (message as WebviewResponse).requestId === 'string') {
        const resolver = pending.get((message as WebviewResponse).requestId);
        if (resolver) {
            pending.delete((message as WebviewResponse).requestId);
            resolver(message as WebviewResponse);
            return;
        }
    }
    if ('type' in message) {
        listeners.forEach(listener => listener(message as GitEvent));
    }
});

/** Sends a typed request and resolves with the response data. */
export function request<T>(type: WebviewRequest['type'], payload?: unknown): Promise<T> {
    const requestId = `req-${Date.now()}-${seq++}`;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            if (pending.delete(requestId)) { reject(new Error(`Request timed out: ${type}`)); }
        }, type.startsWith('git.remote.') ? 180_000 : 60_000);
        pending.set(requestId, response => {
            clearTimeout(timer);
            if (response.success) {
                resolve(response.data as T);
            } else {
                reject(new Error(response.error?.message ?? 'Unknown error'));
            }
        });
        vscodeApi.postMessage({ type, requestId, payload });
    });
}

export function onEvent(listener: EventListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function postState(state: unknown): void {
    vscodeApi.postMessage({ type: 'webview.state.save', requestId: `state-${Date.now()}`, payload: state });
}

export function copyToClipboard(text: string): void {
    void navigator.clipboard?.writeText(text);
}
