/**
 * ORT CLI Wrapper - Executes ORT commands and captures output
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class ORTWrapper {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Run ORT analyzer on the workspace
   */
  async runAnalyzer(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');
    const timeout = config.get<number>('timeout', 300000);

    const outputDir = path.join(workspaceFolder.uri.fsPath, '.ort');
    const resultFile = path.join(outputDir, 'analyzer-result.json');

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.outputChannel.clear();
    this.outputChannel.show(true);
    this.outputChannel.appendLine('Starting ORT Analyzer...');
    this.outputChannel.appendLine(`Workspace: ${workspaceFolder.uri.fsPath}`);
    this.outputChannel.appendLine(`Output: ${resultFile}`);
    this.outputChannel.appendLine('');

    const args = [
      'analyze',
      '-i', workspaceFolder.uri.fsPath,
      '-o', outputDir,
      '-f', 'JSON'
    ];

    try {
      await this.executeCommand(ortPath, args, workspaceFolder.uri.fsPath, timeout);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('ORT Analyzer completed successfully!');

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`ERROR: ${message}`);
      throw new Error(`ORT Analyzer failed: ${message}`);
    }
  }

  /**
   * Run ORT advisor to check for vulnerabilities
   */
  async runAdvisor(analyzerResultFile: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');
    const timeout = config.get<number>('timeout', 300000);

    const outputDir = path.dirname(analyzerResultFile);
    const resultFile = path.join(outputDir, 'advisor-result.json');

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('Starting ORT Advisor...');
    this.outputChannel.appendLine('');

    const args = [
      'advise',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-f', 'JSON'
    ];

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('ORT Advisor completed successfully!');

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`WARNING: ORT Advisor failed: ${message}`);
      // Don't throw - advisor is optional
      return '';
    }
  }

  /**
   * Generate SBOM in specified format
   */
  async generateSBOM(
    analyzerResultFile: string,
    format: 'CycloneDX' | 'SPDX'
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');
    const timeout = config.get<number>('timeout', 300000);

    const outputDir = path.dirname(analyzerResultFile);
    const extension = format === 'CycloneDX' ? 'cyclonedx.json' : 'spdx.json';
    const resultFile = path.join(outputDir, `sbom.${extension}`);

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine(`Generating ${format} SBOM...`);
    this.outputChannel.appendLine('');

    const reporterFormat = format === 'CycloneDX' ? 'CycloneDx' : 'SpdxDocument';

    const args = [
      'report',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-f', reporterFormat,
      '-O', `output.file.name=${path.basename(resultFile)}`
    ];

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`SBOM generated: ${resultFile}`);

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`ERROR: SBOM generation failed: ${message}`);
      throw new Error(`SBOM generation failed: ${message}`);
    }
  }

  /**
   * Check if ORT is installed and available
   */
  async checkOrtInstallation(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');

    try {
      await this.executeCommand(ortPath, ['--version'], process.cwd(), 5000);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute an ORT command
   */
  private executeCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullCommand = `${command} ${args.join(' ')}`;
      this.outputChannel.appendLine(`$ ${fullCommand}`);
      this.outputChannel.appendLine('');

      const childProcess = child_process.spawn(command, args, {
        cwd,
        shell: true,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.outputChannel.append(text);
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        this.outputChannel.append(text);
      });

      const timeoutHandle = setTimeout(() => {
        childProcess.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      childProcess.on('close', (code: number | null) => {
        clearTimeout(timeoutHandle);

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}\n${stderr}`));
        }
      });

      childProcess.on('error', (error: Error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Find the latest ORT result file in workspace
   */
  static findLatestResult(workspaceFolder: vscode.WorkspaceFolder): string | undefined {
    const ortDir = path.join(workspaceFolder.uri.fsPath, '.ort');
    const analyzerResult = path.join(ortDir, 'analyzer-result.json');

    if (fs.existsSync(analyzerResult)) {
      return analyzerResult;
    }

    return undefined;
  }

  /**
   * Clear ORT cache and results
   */
  static clearCache(workspaceFolder: vscode.WorkspaceFolder): void {
    const ortDir = path.join(workspaceFolder.uri.fsPath, '.ort');

    if (fs.existsSync(ortDir)) {
      fs.rmSync(ortDir, { recursive: true, force: true });
    }
  }
}
