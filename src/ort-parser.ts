/**
 * ORT Result Parser - Parses ORT JSON output into structured data
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  ORTResult,
  DependencyTreeItem,
  LicenseStats,
  ComplianceStatus,
  LicenseRisk,
  Identifier,
  DependencyNode,
  Package,
  Project,
  Vulnerability
} from './types';

export class ORTParser {
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.config = vscode.workspace.getConfiguration('ortInsight');
  }

  /**
   * Parse ORT result file
   */
  parseResultFile(filePath: string): ORTResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = JSON.parse(content) as ORTResult;
      return result;
    } catch (error) {
      throw new Error(`Failed to parse ORT result: ${error}`);
    }
  }

  /**
   * Build dependency tree from ORT result
   */
  buildDependencyTree(ortResult: ORTResult): DependencyTreeItem[] {
    const items: DependencyTreeItem[] = [];

    if (!ortResult.analyzer?.result?.projects) {
      return items;
    }

    const packages = this.buildPackageMap(ortResult.analyzer.result.packages || []);
    const vulnerabilities = this.buildVulnerabilityMap(ortResult.advisor);

    for (const project of ortResult.analyzer.result.projects) {
      const projectItem = this.buildProjectItem(project, packages, vulnerabilities);
      items.push(projectItem);
    }

    return items;
  }

  /**
   * Calculate license statistics
   */
  calculateLicenseStats(ortResult: ORTResult): LicenseStats {
    const stats: LicenseStats = {
      total: 0,
      permissive: 0,
      weakCopyleft: 0,
      strongCopyleft: 0,
      unknown: 0,
      byLicense: {}
    };

    if (!ortResult.analyzer?.result) {
      return stats;
    }

    const allPackages = [
      ...(ortResult.analyzer.result.projects || []),
      ...(ortResult.analyzer.result.packages || [])
    ];

    for (const pkg of allPackages) {
      stats.total++;

      const license = this.extractLicense(pkg);
      const risk = this.classifyLicenseRisk(license);

      switch (risk) {
        case 'permissive':
          stats.permissive++;
          break;
        case 'weak-copyleft':
          stats.weakCopyleft++;
          break;
        case 'strong-copyleft':
          stats.strongCopyleft++;
          break;
        default:
          stats.unknown++;
      }

      if (license) {
        stats.byLicense[license] = (stats.byLicense[license] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Get compliance status
   */
  getComplianceStatus(ortResult: ORTResult): ComplianceStatus {
    const licenseStats = this.calculateLicenseStats(ortResult);
    const issues = ortResult.analyzer?.result?.issues || [];
    const vulnerabilities = this.getAllVulnerabilities(ortResult.advisor);

    let status: 'compliant' | 'issues' | 'critical' | 'unknown' = 'compliant';
    let message = 'All dependencies are compliant';

    if (licenseStats.strongCopyleft > 0) {
      status = 'critical';
      message = `${licenseStats.strongCopyleft} strong copyleft license(s) detected`;
    } else if (issues.length > 0 || vulnerabilities.length > 0) {
      status = 'issues';
      message = `${issues.length} issue(s), ${vulnerabilities.length} vulnerability(ies) found`;
    } else if (licenseStats.unknown > 0) {
      status = 'issues';
      message = `${licenseStats.unknown} package(s) with unknown licenses`;
    }

    return {
      status,
      message,
      details: {
        totalPackages: licenseStats.total,
        issuesCount: issues.length,
        vulnerabilitiesCount: vulnerabilities.length,
        licenseStats
      }
    };
  }

  /**
   * Classify license risk level
   */
  classifyLicenseRisk(license: string | undefined): LicenseRisk {
    if (!license) {
      return 'unknown';
    }

    const permissive = this.config.get<string[]>('permissiveLicenses', []);
    const weakCopyleft = this.config.get<string[]>('weakCopyleftLicenses', []);
    const strongCopyleft = this.config.get<string[]>('strongCopyleftLicenses', []);

    if (permissive.some(l => license.includes(l))) {
      return 'permissive';
    }
    if (weakCopyleft.some(l => license.includes(l))) {
      return 'weak-copyleft';
    }
    if (strongCopyleft.some(l => license.includes(l))) {
      return 'strong-copyleft';
    }

    if (license.toLowerCase().includes('proprietary')) {
      return 'proprietary';
    }

    return 'unknown';
  }

  /**
   * Build project tree item
   */
  private buildProjectItem(
    project: Project,
    packages: Map<string, Package>,
    vulnerabilities: Map<string, Vulnerability[]>
  ): DependencyTreeItem {
    const license = this.extractLicense(project);
    const risk = this.classifyLicenseRisk(license);
    const pkgKey = this.getIdentifierKey(project.id);

    const children: DependencyTreeItem[] = [];

    if (project.scope_dependencies) {
      for (const scope of project.scope_dependencies) {
        const scopeChildren: DependencyTreeItem[] = [];

        for (const dep of scope.dependencies) {
          // Each top-level dependency gets its own visited set for per-branch tracking
          const child = this.buildDependencyItem(dep, packages, vulnerabilities, new Set());
          if (child) {
            scopeChildren.push(child);
          }
        }

        // Create a scope grouping item
        const scopeItem: DependencyTreeItem = {
          id: { type: '', namespace: '', name: scope.name, version: '' },
          label: `${scope.name} (${scopeChildren.length})`,
          license: undefined,
          risk: 'unknown',
          children: scopeChildren,
          vulnerabilities: [],
          issues: []
        };
        children.push(scopeItem);
      }
    }

    return {
      id: project.id,
      label: `${project.id.name}@${project.id.version} (Project)`,
      license,
      risk,
      children,
      vulnerabilities: vulnerabilities.get(pkgKey) || [],
      issues: []
    };
  }

  /**
   * Build dependency item recursively
   */
  private buildDependencyItem(
    node: DependencyNode,
    packages: Map<string, Package>,
    vulnerabilities: Map<string, Vulnerability[]>,
    visited: Set<string>
  ): DependencyTreeItem | null {
    const key = this.getIdentifierKey(node.id);

    if (visited.has(key)) {
      return null; // Prevent circular dependencies on this branch
    }

    // Create a new visited set for this branch to allow the same package
    // to appear in different branches of the tree
    const branchVisited = new Set(visited);
    branchVisited.add(key);

    const pkg = packages.get(key);
    const id = pkg?.id ?? node.id;
    const license = pkg ? this.extractLicense(pkg) : undefined;
    const risk = this.classifyLicenseRisk(license);

    // Recurse into child dependencies
    const children: DependencyTreeItem[] = [];
    if (node.dependencies) {
      for (const depRef of node.dependencies) {
        // Create a DependencyNode-like object from the reference for recursion
        const childNode: DependencyNode = {
          id: depRef.id,
          dependencies: [],
          issues: []
        };
        const child = this.buildDependencyItem(childNode, packages, vulnerabilities, branchVisited);
        if (child) {
          children.push(child);
        }
      }
    }

    return {
      id,
      label: `${id.name}@${id.version}`,
      license,
      risk,
      children,
      vulnerabilities: vulnerabilities.get(key) || [],
      issues: node.issues || []
    };
  }

  /**
   * Build package map for quick lookup
   */
  private buildPackageMap(packages: Package[]): Map<string, Package> {
    const map = new Map<string, Package>();

    for (const pkg of packages) {
      const key = this.getIdentifierKey(pkg.id);
      map.set(key, pkg);
    }

    return map;
  }

  /**
   * Build vulnerability map
   */
  private buildVulnerabilityMap(advisorResult: any): Map<string, Vulnerability[]> {
    const map = new Map<string, Vulnerability[]>();

    if (!advisorResult?.advisories) {
      return map;
    }

    for (const [pkgId, advisories] of Object.entries(advisorResult.advisories)) {
      const allVulns: Vulnerability[] = [];

      for (const advisory of advisories as any[]) {
        if (advisory.vulnerabilities) {
          allVulns.push(...advisory.vulnerabilities);
        }
      }

      if (allVulns.length > 0) {
        map.set(pkgId, allVulns);
      }
    }

    return map;
  }

  /**
   * Get all vulnerabilities
   */
  private getAllVulnerabilities(advisorResult: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (!advisorResult?.advisories) {
      return vulnerabilities;
    }

    for (const advisories of Object.values(advisorResult.advisories) as any[]) {
      for (const advisory of advisories) {
        if (advisory.vulnerabilities) {
          vulnerabilities.push(...advisory.vulnerabilities);
        }
      }
    }

    return vulnerabilities;
  }

  /**
   * Extract license from package or project
   */
  private extractLicense(pkg: Package | Project): string | undefined {
    if (pkg.declared_licenses_processed?.spdx_expression) {
      return pkg.declared_licenses_processed.spdx_expression;
    }

    if (pkg.declared_licenses && pkg.declared_licenses.length > 0) {
      return pkg.declared_licenses.join(' OR ');
    }

    return undefined;
  }

  /**
   * Get identifier key for lookups
   */
  private getIdentifierKey(id: Identifier): string {
    return `${id.type}:${id.namespace}:${id.name}:${id.version}`;
  }
}
