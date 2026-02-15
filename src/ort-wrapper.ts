/**
 * ORT CLI Wrapper - Executes ORT commands and captures output
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { SetupDetector } from './setup-detector';

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
    const timeout = config.get<number>('timeout', 600000);

    const outputDir = path.join(workspaceFolder.uri.fsPath, '.ort');
    const resultFile = path.join(outputDir, 'analyzer-result.json');

    // Clean old results and create output directory
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

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

      // If the result file was written before timeout/error, treat as success
      if (fs.existsSync(resultFile)) {
        const stats = fs.statSync(resultFile);
        if (stats.size > 100) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('ORT Analyzer completed (result file found despite process error).');
          return resultFile;
        }
      }

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
    const timeout = config.get<number>('timeout', 600000);

    const outputDir = path.join(path.dirname(analyzerResultFile), 'advisor');

    // Clean old advisor output to avoid "output files must not exist" error
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    const resultFile = path.join(outputDir, 'advisor-result.json');

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('Starting ORT Advisor (using OSV vulnerability database)...');
    this.outputChannel.appendLine('');

    // ORT advise requires --advisors flag: OSV (free), OSSIndex, VulnerableCode, BlackDuck
    const args = [
      'advise',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-a', 'OSV',
      '-f', 'JSON'
    ];

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('ORT Advisor completed successfully!');

      // Find the generated advisor result file
      if (fs.existsSync(resultFile)) {
        return resultFile;
      }

      // ORT may name it differently — look for any JSON result
      const files = fs.readdirSync(outputDir);
      const jsonFile = files.find(f => f.endsWith('.json'));
      if (jsonFile) {
        const foundFile = path.join(outputDir, jsonFile);
        this.outputChannel.appendLine(`Advisor result: ${foundFile}`);
        return foundFile;
      }

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`WARNING: ORT Advisor failed: ${message}`);
      this.outputChannel.appendLine('Note: The Advisor requires internet access to query the OSV vulnerability database.');
      this.outputChannel.appendLine('If you are behind a proxy or firewall, vulnerability checking may not work.');
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
    const timeout = config.get<number>('timeout', 600000);

    const outputDir = path.join(path.dirname(analyzerResultFile), 'reports');

    // Clean old reports directory to avoid "output files must not exist" error
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine(`Generating ${format} SBOM...`);
    this.outputChannel.appendLine('');

    // ORT report command: -f is --report-formats (the reporter plugin name)
    // Valid formats: CycloneDX, SpdxDocument, StaticHTML, WebApp, etc.
    const reporterFormat = format === 'CycloneDX' ? 'CycloneDX' : 'SpdxDocument';

    const args = [
      'report',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-f', reporterFormat
    ];

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');

      // Find the generated SBOM file in the output directory
      const files = fs.readdirSync(outputDir);
      const sbomFile = files.find(f =>
        (format === 'CycloneDX' && (f.includes('cyclonedx') || f.includes('CycloneDX') || f.endsWith('.cdx.json') || f.endsWith('.cdx.xml'))) ||
        (format === 'SPDX' && (f.includes('spdx') || f.includes('Spdx') || f.endsWith('.spdx.json') || f.endsWith('.spdx.yml')))
      ) || files[0]; // Fallback to first file if naming doesn't match

      const resultFile = path.join(outputDir, sbomFile || 'sbom');
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
   * Generate ORT native HTML report (StaticHTML or WebApp)
   */
  async generateReport(
    analyzerResultFile: string,
    format: 'StaticHTML' | 'WebApp'
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');
    const timeout = config.get<number>('timeout', 600000);

    const outputDir = path.join(path.dirname(analyzerResultFile), 'html-report');

    // Clean old report directory to avoid "output files must not exist" error
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine(`Generating ORT ${format} report...`);
    this.outputChannel.appendLine('');

    const args = [
      'report',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-f', format
    ];

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');

      // Find the generated HTML file
      const files = fs.readdirSync(outputDir);
      const htmlFile = files.find(f => f.endsWith('.html')) || files[0];

      const resultFile = path.join(outputDir, htmlFile || 'report.html');
      this.outputChannel.appendLine(`Report generated: ${resultFile}`);

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`ERROR: Report generation failed: ${message}`);
      throw new Error(`Report generation failed: ${message}`);
    }
  }

  /**
   * Run ORT Evaluator to check policy compliance
   */
  async runEvaluator(
    analyzerResultFile: string,
    rulesFile?: string,
    licenseClassificationsFile?: string
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');
    const timeout = config.get<number>('timeout', 600000);

    const outputDir = path.join(path.dirname(analyzerResultFile), 'evaluator');

    // Clean old evaluator output to avoid "output files must not exist" error
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    const resultFile = path.join(outputDir, 'evaluation-result.json');

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('Starting ORT Evaluator (Policy Rules Engine)...');
    if (rulesFile) {
      this.outputChannel.appendLine(`Rules file: ${rulesFile}`);
    }
    if (licenseClassificationsFile) {
      this.outputChannel.appendLine(`License classifications: ${licenseClassificationsFile}`);
    }
    this.outputChannel.appendLine('');

    const args = [
      'evaluate',
      '-i', analyzerResultFile,
      '-o', outputDir,
      '-f', 'JSON'
    ];

    // Add rules file if provided
    if (rulesFile) {
      args.push('--rules-file', rulesFile);
    }

    // Add license classifications file if provided
    if (licenseClassificationsFile) {
      args.push('--license-classifications-file', licenseClassificationsFile);
    }

    try {
      await this.executeCommand(ortPath, args, outputDir, timeout);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('ORT Evaluator completed successfully!');

      // Find the generated result file
      if (fs.existsSync(resultFile)) {
        return resultFile;
      }

      // ORT may name it differently — look for any JSON result
      const files = fs.readdirSync(outputDir);
      const jsonFile = files.find(f => f.endsWith('.json'));
      if (jsonFile) {
        const foundFile = path.join(outputDir, jsonFile);
        this.outputChannel.appendLine(`Evaluator result: ${foundFile}`);
        return foundFile;
      }

      return resultFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // If the result file was written before error, treat as success
      // (evaluator may exit non-zero when violations are found)
      if (fs.existsSync(resultFile)) {
        const stats = fs.statSync(resultFile);
        if (stats.size > 100) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('ORT Evaluator completed with policy violations found.');
          return resultFile;
        }
      }

      // Also check for any JSON file in output dir
      if (fs.existsSync(outputDir)) {
        const files = fs.readdirSync(outputDir);
        const jsonFile = files.find(f => f.endsWith('.json'));
        if (jsonFile) {
          const foundFile = path.join(outputDir, jsonFile);
          const stats = fs.statSync(foundFile);
          if (stats.size > 100) {
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('ORT Evaluator completed with policy violations found.');
            return foundFile;
          }
        }
      }

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`ERROR: ORT Evaluator failed: ${message}`);
      throw new Error(`ORT Evaluator failed: ${message}`);
    }
  }

  /**
   * Check if ORT is installed and available
   */
  async checkOrtInstallation(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const ortPath = config.get<string>('ortPath', 'ort');

    this.outputChannel.appendLine(`Checking ORT installation at: ${ortPath}`);

    // Check if the configured ORT path exists as a file
    if (ortPath !== 'ort' && fs.existsSync(ortPath)) {
      this.outputChannel.appendLine('ORT executable found at configured path.');
      return true;
    }

    // Check if 'ort' is available in PATH by trying to resolve it
    try {
      const whereCmd = process.platform === 'win32' ? 'where' : 'which';
      const result = child_process.execSync(`${whereCmd} ${ortPath}`, { timeout: 5000 }).toString().trim();
      if (result) {
        this.outputChannel.appendLine(`ORT found in PATH: ${result}`);
        return true;
      }
    } catch {
      // Not in PATH
    }

    this.outputChannel.appendLine('ORT not found. Please configure the ORT path in settings.');
    return false;
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

      // Ensure JAVA_HOME is set for ORT using cross-platform auto-detection
      const env = { ...process.env };
      if (!env.JAVA_HOME) {
        const javaStatus = SetupDetector.detectJava();
        if (javaStatus.installed && javaStatus.javaHome) {
          env.JAVA_HOME = javaStatus.javaHome;
          const pathSep = process.platform === 'win32' ? ';' : ':';
          const binDir = path.join(javaStatus.javaHome, 'bin');
          env.PATH = `${binDir}${pathSep}${env.PATH || ''}`;
          this.outputChannel.appendLine(`Auto-detected JAVA_HOME: ${javaStatus.javaHome}`);
        }
      }

      const childProcess = child_process.spawn(command, args, {
        cwd,
        shell: true,
        env
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
        const minutes = Math.round(timeout / 60000);
        reject(new Error(`Command timed out after ${minutes} minute(s). For large projects, increase the timeout in Settings > ORT Insight > Timeout.`));
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
