import type { WebviewPersistedState } from '../../shared/protocol';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';

/**
 * Persists webview UI state (active tab, split pane sizes — document §89) in
 * workspaceState so it survives editor switches and reloads.
 */
export class WebviewStateBridge {
    constructor(private readonly storage: ExtensionStorage) {}

    load(): WebviewPersistedState {
        return this.storage.getWebviewState<WebviewPersistedState>() ?? {};
    }

    async save(state: WebviewPersistedState): Promise<void> {
        const current = this.load();
        await this.storage.setWebviewState({ ...current, ...state });
    }
}
