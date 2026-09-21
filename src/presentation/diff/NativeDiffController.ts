import type { DiffTargetDto } from '../../shared/protocol';
import type { DiffService } from '../../application/diff/DiffService';

/**
 * Thin presentation controller for diffs (document §12): delegates URI
 * preparation to DiffService and keeps the webview decoupled from it.
 */
export class NativeDiffController {
    constructor(private readonly diffService: DiffService) {}

    show(target: DiffTargetDto): Promise<void> {
        return this.diffService.show(target);
    }
}
