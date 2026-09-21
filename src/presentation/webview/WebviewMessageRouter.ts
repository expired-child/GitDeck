import type { GitErrorDto } from '../../shared/GitError';
import { GitError } from '../../shared/GitError';
import type { WebviewPersistedState, WebviewRequest, WebviewResponse } from '../../shared/protocol';

type Payload = unknown;
type Handler = (payload: Payload) => Promise<unknown>;

/**
 * Routes typed webview requests to service handlers (document §41).
 * Every request gets a response; errors are converted to the unified DTO.
 */
export class WebviewMessageRouter {
    private readonly handlers = new Map<string, Handler>();
    private stateSaver?: (state: WebviewPersistedState) => Promise<void>;

    register(type: string, handler: Handler): this {
        this.handlers.set(type, handler);
        return this;
    }

    onStateSave(saver: (state: WebviewPersistedState) => Promise<void>): this {
        this.stateSaver = saver;
        return this;
    }

    async handle(message: WebviewRequest, post: (response: WebviewResponse) => void): Promise<void> {
        if (message.type === 'webview.state.save') {
            await this.stateSaver?.(message.payload);
            return;
        }
        const handler = this.handlers.get(message.type);
        if (!handler) {
            post({
                requestId: message.requestId,
                success: false,
                error: { code: 'UNKNOWN', message: `Unknown message type: ${message.type}` } as GitErrorDto
            });
            return;
        }
        try {
            const data = await handler((message as { payload?: unknown }).payload);
            post({ requestId: message.requestId, success: true, data });
        } catch (e) {
            const error = GitError.from(e);
            post({ requestId: message.requestId, success: false, error: error.toDto() });
        }
    }
}
