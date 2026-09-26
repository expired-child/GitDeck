import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitError, GitErrorCode } from '../../shared/GitError';
import type { CommitService } from '../commit/CommitService';
import type { RepositoryManager } from '../repository/RepositoryService';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';
import { ChatCompletionsClient } from '../../infrastructure/ai/ChatCompletionsClient';
import type { ChatMessage } from '../../infrastructure/ai/ChatCompletionsClient';

export interface AiCommitConfig {
    baseUrl: string;
    model: string;
    temperature: number;
    maxDiffChars: number;
    prompt: string;
    instructions: string;
}

/**
 * 默认提示词，遵循阿里 Git 提交规约（约定式提交）：首行为 `type(scope): subject`，
 * body 与 footer 可选；type 取 feat / fix / docs / style / refactor / test / chore。
 * 可在设置 `ideaGit.ai.prompt` 中整体替换。
 */
export const DEFAULT_AI_COMMIT_PROMPT = `你是 Git 提交信息生成助手。根据用户提供的 git diff 生成一条提交信息，格式遵循阿里 Git 提交规约。

提交信息结构（首行必需，body 与 footer 可选）：
<type>(<scope>): <subject>

<body>

<footer>

要求：
1. type 只能取下列值，且必须小写：
   feat：新增功能（面向用户的功能，不是构建脚本）
   fix：修复缺陷（面向用户的缺陷，不是构建脚本）
   docs：文档变更
   style：代码格式改动（不影响代码运行，如缺少分号、缩进）
   refactor：重构（既不是新增功能，也不是修复缺陷）
   test：新增或修改测试用例
   chore：构建过程或辅助工具的变动（不涉及生产代码）
2. scope 说明影响范围（模块、组件或目录），可以为空；type 与 scope 一律小写。
3. subject 用简体中文概括这次提交，使用一般现在时与祈使句，不加主语，句尾不加标点；首行总长度不超过 70 个字符。
4. body 可选：一次改动包含多个方面时，用一行说明具体改了什么。
5. footer 可选：只有关联 issue 时才按 "Closes #123" 的格式补充。
6. 只输出提交信息本身，不要输出 diff、解释、前后缀或 Markdown 代码块。`;

export const AI_COMMIT_DEFAULTS: AiCommitConfig = {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxDiffChars: 12_000,
    prompt: DEFAULT_AI_COMMIT_PROMPT,
    instructions: ''
};

/** 单个新文件的读取上限，避免把大文件整段塞进请求。 */
const UNTRACKED_FILE_LIMIT_BYTES = 20_000;

/** 从 VS Code 设置读取 AI 提交信息配置（ideaGit.ai.*）。 */
export function readAiCommitConfig(): AiCommitConfig {
    const config = vscode.workspace.getConfiguration('ideaGit');
    return {
        baseUrl: config.get<string>('ai.baseUrl', AI_COMMIT_DEFAULTS.baseUrl),
        model: config.get<string>('ai.model', AI_COMMIT_DEFAULTS.model),
        temperature: config.get<number>('ai.temperature', AI_COMMIT_DEFAULTS.temperature),
        maxDiffChars: config.get<number>('ai.maxDiffChars', AI_COMMIT_DEFAULTS.maxDiffChars),
        prompt: config.get<string>('ai.prompt', AI_COMMIT_DEFAULTS.prompt),
        instructions: config.get<string>('ai.instructions', AI_COMMIT_DEFAULTS.instructions)
    };
}

/**
 * 用 AI 生成提交信息。
 *
 * 语言固定为简体中文；接口固定为 OpenAI 兼容的 /chat/completions，
 * 换服务只需改 baseUrl / model。API Key 走 SecretStorage，不写进设置文件。
 */
export class CommitMessageService {
    constructor(
        private readonly repositories: RepositoryManager,
        private readonly commits: CommitService,
        private readonly storage: ExtensionStorage,
        private readonly client: ChatCompletionsClient = new ChatCompletionsClient(),
        private readonly config: () => AiCommitConfig = readAiCommitConfig
    ) {}

    async hasApiKey(): Promise<boolean> {
        return Boolean((await this.storage.getAiApiKey()).trim());
    }

    async generate(repositoryId: string, paths: string[]): Promise<string> {
        const apiKey = (await this.storage.getAiApiKey()).trim();
        if (!apiKey) {
            throw new GitError(GitErrorCode.INVALID_INPUT, '尚未配置 AI API Key。请运行命令 “IDEA Git: 设置 AI API Key”。');
        }
        const config = this.config();
        const changes = await this.collectChanges(repositoryId, paths, config.maxDiffChars);
        if (!changes.trim()) {
            throw new GitError(GitErrorCode.INVALID_INPUT, '没有可用于生成提交信息的改动。');
        }
        const content = await this.client.complete({
            baseUrl: config.baseUrl,
            apiKey,
            model: config.model,
            temperature: config.temperature,
            messages: buildCommitMessages(changes, paths, config)
        });
        return normalizeCommitMessage(content);
    }

    /** 已跟踪文件的 diff + 未跟踪新文件的内容，整体不超过 maxChars。 */
    private async collectChanges(repositoryId: string, paths: string[], maxChars: number): Promise<string> {
        const diff = (await this.commits.getPatch(repositoryId, paths, { binary: false })).trim();
        let text = truncate(diff, maxChars);
        let remaining = maxChars - text.length;
        if (remaining <= 0) {
            return text;
        }

        const repo = this.repositories.getRequired(repositoryId);
        for (const file of await this.commits.listUntrackedFiles(repositoryId, paths)) {
            const content = await this.readUntracked(repo.rootPath, file);
            if (content === undefined) {
                continue;
            }
            const section = `新文件：${file}\n${content}`;
            if (section.length > remaining) {
                break;
            }
            text += `\n\n${section}`;
            remaining -= section.length;
        }
        return text.trim();
    }

    private async readUntracked(rootPath: string, relPath: string): Promise<string | undefined> {
        try {
            const absolute = path.join(rootPath, ...relPath.split('/'));
            const stat = await fs.stat(absolute);
            if (!stat.isFile() || stat.size > UNTRACKED_FILE_LIMIT_BYTES) {
                return undefined;
            }
            return await fs.readFile(absolute, 'utf8');
        } catch {
            // 读不到的新文件直接跳过，不影响整体生成。
            return undefined;
        }
    }
}

/** 构造发送给模型的 messages；单独导出便于测试。 */
export function buildCommitMessages(changes: string, paths: string[], config: AiCommitConfig): ChatMessage[] {
    // 提示词被清空时退回内置默认值，避免发出一个没有约束的空提示。
    const system = config.prompt.trim() || DEFAULT_AI_COMMIT_PROMPT;
    const extra = config.instructions.trim();
    const fileList = paths.length > 0 ? paths.join(', ') : '工作区全部改动';
    return [
        { role: 'system', content: extra ? `${system}\n\n额外要求：${extra}` : system },
        { role: 'user', content: `改动文件：${fileList}\n\n${changes}` }
    ];
}

/** 去掉模型习惯性加上的代码块围栏和整段外层引号。 */
export function normalizeCommitMessage(raw: string): string {
    let text = raw.trim();
    const fenced = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text);
    if (fenced) {
        text = fenced[1].trim();
    }
    if (text.length > 1 && text.startsWith('"') && text.endsWith('"') && !text.includes('\n')) {
        text = text.slice(1, -1).trim();
    }
    return text;
}

function truncate(text: string, maxChars: number): string {
    if (maxChars <= 0 || text.length <= maxChars) {
        return text;
    }
    return `${text.slice(0, maxChars)}\n\n（diff 过长，已截断）`;
}
