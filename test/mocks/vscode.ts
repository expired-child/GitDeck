export class EventEmitter<T> {
    private listeners = new Set<(value: T) => void>();
    event = (listener: (value: T) => void) => {
        this.listeners.add(listener);
        return { dispose: () => { this.listeners.delete(listener); } };
    };
    fire(value: T): void { for (const listener of this.listeners) { listener(value); } }
    dispose(): void { this.listeners.clear(); }
}
export const windowState = new EventEmitter<{ focused: boolean }>();
export const configuration = new EventEmitter<{ affectsConfiguration(key: string): boolean }>();
export const window = { state: { focused: true }, onDidChangeWindowState: windowState.event };
export const workspace = {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    onDidChangeConfiguration: configuration.event
};
export const extensions = { all: [], getExtension: (_id: string): unknown => undefined };
