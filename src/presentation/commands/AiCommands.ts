import * as vscode from 'vscode';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';
import { runCommand } from './errors';

export const AI_API_KEY_COMMAND = 'ideaGit.setAiApiKey';
export const AI_API_KEY_CLEAR_COMMAND = 'ideaGit.clearAiApiKey';

/**
 * 让用户输入 AI API Key 并存入系统凭据库。
 * 取消输入时保持原值不变。
 *
 * @param storage 带 SecretStorage 的持久化入口
 * @return 操作结束后是否已有可用的 API Key
 */
export async function promptForAiApiKey(storage: ExtensionStorage): Promise<boolean> {
    const existing = await storage.getAiApiKey();
    const value = await vscode.window.showInputBox({
        title: 'IDEA Git: AI API Key',
        prompt: existing
            ? '已配置 API Key。输入新值可覆盖，输入空值可清除。'
            : 'API Key 保存在 VS Code 密钥库，不写入 settings.json。',
        password: true,
        ignoreFocusOut: true
    });
    if (value !== undefined) {
        await storage.setAiApiKey(value);
    }
    return Boolean((await storage.getAiApiKey()).trim());
}

export function registerAiCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    storage: ExtensionStorage
): void {
    commands[AI_API_KEY_COMMAND] = runCommand(async () => {
        const configured = await promptForAiApiKey(storage);
        await vscode.window.showInformationMessage(
            configured ? 'IDEA Git: AI API Key 已保存到密钥库。' : 'IDEA Git: 未配置 AI API Key。'
        );
    });
    commands[AI_API_KEY_CLEAR_COMMAND] = runCommand(async () => {
        await storage.setAiApiKey('');
        await vscode.window.showInformationMessage('IDEA Git: 已清除 AI API Key。');
    });
}
