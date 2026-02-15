/**
 * Diagnostics Provider - Shows inline diagnostics for problematic licenses
 */

import * as vscode from 'vscode';
import { ORTResult, LicenseRisk } from '../types';
import { ORTParser } from '../ort-parser';
import * as fs from 'fs';

export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private parser: ORTParser;
  private packageLicenseMap: Map<string, { license: string; risk: LicenseRisk }> = new Map();

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ort-insight');
    this.parser = new ORTParser();
  }

  /**
   * Load ORT results and build package license map
   */
  async loadResults(resultFile: string): Promise<void> {
    try {
      if (!fs.existsSync(resultFile)) {
        this.packageLicenseMap.clear();
        this.clearAll();
        return;
      }

      const ortResult = this.parser.parseResultFile(resultFile);
      this.buildPackageLicenseMap(ortResult);

      // Update diagnostics for all open documents
      for (const document of vscode.workspace.textDocuments) {
        this.updateDiagnostics(document);
      }
    } catch (error) {
      console.error('Failed to load ORT results for diagnostics:', error);
    }
  }

  /**
   * Update diagnostics for a document
   */
  updateDiagnostics(document: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('ortInsight');
    const enableDiagnostics = config.get<boolean>('enableDiagnostics', true);

    if (!enableDiagnostics) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    // Only process source files
    if (!this.isSourceFile(document)) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const imports = this.extractImports(line);

      for (const importName of imports) {
        const packageInfo = this.packageLicenseMap.get(importName);

        if (packageInfo) {
          const diagnostic = this.createDiagnostic(line, i, importName, packageInfo);
          if (diagnostic) {
            diagnostics.push(diagnostic);
          }
        }
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Create diagnostic for a package
   */
  private createDiagnostic(
    line: string,
    lineNumber: number,
    packageName: string,
    packageInfo: { license: string; risk: LicenseRisk }
  ): vscode.Diagnostic | null {
    const { license, risk } = packageInfo;

    // Only create diagnostics for problematic licenses
    if (risk === 'permissive' || risk === 'unknown') {
      return null;
    }

    const start = line.indexOf(packageName);
    if (start === -1) {
      return null;
    }

    const range = new vscode.Range(
      new vscode.Position(lineNumber, start),
      new vscode.Position(lineNumber, start + packageName.length)
    );

    let message: string;
    let severity: vscode.DiagnosticSeverity;

    switch (risk) {
      case 'strong-copyleft':
        message = `Strong copyleft license detected: ${license}. This may require you to open-source your code.`;
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case 'weak-copyleft':
        message = `Weak copyleft license detected: ${license}. Review license compatibility.`;
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      case 'proprietary':
        message = `Proprietary license detected: ${license}. Verify usage rights.`;
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      default:
        return null;
    }

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = 'ORT Insight';
    diagnostic.code = 'license-compliance';

    return diagnostic;
  }

  /**
   * Extract import names from a line of code
   */
  private extractImports(line: string): string[] {
    const imports: string[] = [];

    // JavaScript/TypeScript: import ... from 'package'
    const esImportMatch = line.match(/from\s+['"]([^'"]+)['"]/);
    if (esImportMatch) {
      imports.push(this.normalizePackageName(esImportMatch[1]));
    }

    // JavaScript/TypeScript: require('package')
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      imports.push(this.normalizePackageName(requireMatch[1]));
    }

    // Python: import package or from package import
    const pythonImportMatch = line.match(/^import\s+([a-zA-Z0-9_-]+)/);
    if (pythonImportMatch) {
      imports.push(pythonImportMatch[1]);
    }

    const pythonFromMatch = line.match(/^from\s+([a-zA-Z0-9_-]+)\s+import/);
    if (pythonFromMatch) {
      imports.push(pythonFromMatch[1]);
    }

    // Java: import package.name
    const javaImportMatch = line.match(/^import\s+(?:static\s+)?([a-zA-Z0-9_.]+)/);
    if (javaImportMatch) {
      const parts = javaImportMatch[1].split('.');
      if (parts.length >= 3) {
        imports.push(`${parts[0]}.${parts[1]}`);
      }
    }

    return imports;
  }

  /**
   * Normalize package name (remove scope, subpath)
   */
  private normalizePackageName(packageName: string): string {
    // Remove relative paths
    if (packageName.startsWith('.')) {
      return '';
    }

    // Handle scoped packages (@org/package)
    if (packageName.startsWith('@')) {
      const parts = packageName.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : packageName;
    }

    // Handle subpath imports (package/subpath)
    const parts = packageName.split('/');
    return parts[0];
  }

  /**
   * Build package license map from ORT result
   */
  private buildPackageLicenseMap(ortResult: ORTResult): void {
    this.packageLicenseMap.clear();

    if (!ortResult.analyzer?.result?.packages) {
      return;
    }

    for (const pkg of ortResult.analyzer.result.packages) {
      const license = pkg.declared_licenses_processed?.spdx_expression ||
        pkg.declared_licenses?.join(' OR ') ||
        'Unknown';

      const risk = this.parser.classifyLicenseRisk(license);

      this.packageLicenseMap.set(pkg.id.name, { license, risk });

      // Also add with full identifier
      const fullName = `${pkg.id.namespace ? pkg.id.namespace + '/' : ''}${pkg.id.name}`;
      this.packageLicenseMap.set(fullName, { license, risk });
    }
  }

  /**
   * Check if document is a source file
   */
  private isSourceFile(document: vscode.TextDocument): boolean {
    const sourceExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
      '.py', '.java', '.kt', '.go', '.rs', '.rb',
      '.cpp', '.c', '.h', '.hpp', '.cs', '.php'
    ];

    return sourceExtensions.some(ext => document.fileName.endsWith(ext));
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
