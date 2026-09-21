import type { GitCli } from './GitCli';

let cachedVersion: { major: number; minor: number } | null | undefined;

/**
 * Detects the git version once per session (document §23) so commands can
 * prefer modern syntax (`git switch`) with fallbacks for old versions.
 */
export class GitVersionDetector {
    constructor(private readonly cli: GitCli) {}

    /** Returns {major, minor} or null when git cannot be probed. */
    async detect(repoRoot: string): Promise<{ major: number; minor: number } | null> {
        if (cachedVersion !== undefined) {
            return cachedVersion;
        }
        try {
            const out = await this.cli.out(repoRoot, ['--version'], { timeout: 5000 });
            const match = /git version (\d+)\.(\d+)/.exec(out);
            cachedVersion = match
                ? { major: Number(match[1]), minor: Number(match[2]) }
                : null;
        } catch {
            cachedVersion = null;
        }
        return cachedVersion;
    }

    async supportsSwitch(repoRoot: string): Promise<boolean> {
        const version = await this.detect(repoRoot);
        if (!version) {
            return false;
        }
        return version.major > 2 || (version.major === 2 && version.minor >= 23);
    }
}
