import { GitError, GitErrorCode } from '../../shared/GitError';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatCompletionRequest {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    messages: ChatMessage[];
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;
/** 出错时回显的响应体上限，避免把整页 HTML 塞进错误提示。 */
const ERROR_BODY_LIMIT = 300;

/**
 * OpenAI 兼容的 `/chat/completions` 客户端（document 无对应章节，AI 提交信息功能新增）。
 * 同一份实现可用于 OpenAI、DeepSeek、Ollama、LM Studio 等遵循该协议的服务，
 * 差异只体现在 baseUrl / model 配置上。
 */
export class ChatCompletionsClient {
    async complete(request: ChatCompletionRequest): Promise<string> {
        const baseUrl = request.baseUrl.trim().replace(/\/+$/, '');
        if (!baseUrl) {
            throw new GitError(GitErrorCode.INVALID_INPUT, '尚未配置 AI 接口地址（ideaGit.ai.baseUrl）。');
        }
        if (!request.model.trim()) {
            throw new GitError(GitErrorCode.INVALID_INPUT, '尚未配置 AI 模型（ideaGit.ai.model）。');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        let status: number;
        let body: string;
        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${request.apiKey}`
                },
                body: JSON.stringify({
                    model: request.model,
                    temperature: request.temperature,
                    stream: false,
                    messages: request.messages
                }),
                signal: controller.signal
            });
            status = response.status;
            body = await response.text();
        } catch (error) {
            if (controller.signal.aborted) {
                throw new GitError(GitErrorCode.UNKNOWN, 'AI 请求超时，请检查网络或接口地址。');
            }
            const detail = error instanceof Error ? error.message : String(error);
            throw new GitError(GitErrorCode.UNKNOWN, `无法连接 AI 服务：${detail}`);
        } finally {
            clearTimeout(timer);
        }

        if (status < 200 || status >= 300) {
            const detail = body.trim().slice(0, ERROR_BODY_LIMIT);
            if (status === 401 || status === 403) {
                throw new GitError(GitErrorCode.AUTHENTICATION_FAILED, 'AI 服务拒绝了这次请求，请检查 API Key。', detail);
            }
            throw new GitError(GitErrorCode.UNKNOWN, `AI 请求失败（HTTP ${status}）。`, detail);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new GitError(GitErrorCode.UNKNOWN, 'AI 返回的内容不是合法 JSON。', body.trim().slice(0, ERROR_BODY_LIMIT));
        }
        const content = (parsed as { choices?: { message?: { content?: unknown } }[] })
            ?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new GitError(GitErrorCode.UNKNOWN, 'AI 没有返回提交信息内容。');
        }
        return content;
    }
}
