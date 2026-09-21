/**
 * Logger with pluggable sink so it can be used both from the extension host
 * (OutputChannel sink) and from pure/test code (console sink). Never depends
 * on `vscode` at module level, keeping GitCli and parsers unit-testable.
 */
export interface LogSink {
    appendLine(line: string): void;
}

const CREDENTIAL_PATTERN = /(https?:\/\/)([^@/\s:]+):([^@/\s]+)@/g;

export class Logger {
    private sinks: LogSink[] = [];

    addSink(sink: LogSink): void {
        this.sinks.push(sink);
    }

    info(message: string): void {
        this.write('[INFO]', message);
    }

    warn(message: string): void {
        this.write('[WARN]', message);
    }

    error(message: string, detail?: string): void {
        this.write('[ERROR]', detail ? `${message} — ${detail}` : message);
    }

    command(cwd: string, args: string[], exitCode: number, durationMs: number): void {
        this.write('[GIT]', `${cwd}> git ${Logger.sanitize(args.join(' '))} (exit ${exitCode}, ${durationMs}ms)`);
    }

    private write(level: string, message: string): void {
        const line = `${level} ${message}`;
        for (const sink of this.sinks) {
            sink.appendLine(line);
        }
    }

    /** Redacts tokens/passwords/credentials from logged text (document §62). */
    static sanitize(text: string): string {
        return text
            .replace(CREDENTIAL_PATTERN, '$1***:***@')
            .replace(/(token|password|credential)=\S+/gi, '$1=***');
    }
}
