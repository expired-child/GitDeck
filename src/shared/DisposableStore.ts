import * as vscode from 'vscode';

/**
 * Collects disposables and disposes all of them at once (document §12 style helpers).
 */
export class DisposableStore implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private disposed = false;

    add<T extends vscode.Disposable>(d: T): T {
        if (this.disposed) {
            d.dispose();
        } else {
            this.disposables.push(d);
        }
        return d;
    }

    dispose(): void {
        this.disposed = true;
        for (const d of this.disposables.splice(0)) {
            d.dispose();
        }
    }
}

export function toDisposable(fn: () => void): vscode.Disposable {
    return { dispose: fn };
}
