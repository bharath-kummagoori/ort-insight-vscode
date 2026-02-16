/**
 * Type definitions for ORT (OSS Review Toolkit) data structures
 *
 * These TypeScript interfaces mirror the JSON structure of ORT's output files
 * (analyzer-result.json, advisor-result.json). They're used throughout the
 * extension to provide type safety when parsing and displaying ORT data.
 *
 * Key types:
 *   - ORTResult: Top-level structure of any ORT result file
 *   - Package: A single dependency with its license, version, and metadata
 *   - Vulnerability: A known security issue from the OSV database
 *   - LicenseRisk: Classification of license types (permissive, copyleft, etc.)
 */

export interface ORTResult {
  repository: Repository;
  analyzer: AnalyzerResult;
  advisor?: AdvisorResult;
  scanner?: ScannerResult;
}

export interface Repository {
  vcs: VcsInfo;
  config: RepositoryConfiguration;
}

export interface VcsInfo {
  type: string;
  url: string;
  revision: string;
  path: string;
}

export interface RepositoryConfiguration {
  excludes?: ExcludeRule[];
}

export interface ExcludeRule {
  pattern: string;
  reason: string;
  comment?: string;
}

export interface AnalyzerResult {
  start_time: string;
  end_time: string;
  environment: Environment;
  config: AnalyzerConfiguration;
  result: AnalyzerRun;
}

export interface Environment {
  os: string;
  processors: number;
  max_memory: number;
  variables: Record<string, string>;
  tool_versions: Record<string, string>;
}

export interface AnalyzerConfiguration {
  allow_dynamic_versions: boolean;
  enabled_package_managers?: string[];
}

export interface AnalyzerRun {
  projects: Project[];
  packages: Package[];
  issues: Issue[];
  dependency_graphs?: Record<string, DependencyGraph>;
}

export interface Project {
  id: Identifier;
  definition_file_path: string;
  declared_licenses: string[];
  declared_licenses_processed: ProcessedDeclaredLicense;
  vcs: VcsInfo;
  vcs_processed: VcsInfo;
  homepage_url: string;
  scope_dependencies?: ScopeDependencies[];
}

export interface Package {
  id: Identifier;
  purl: string;
  declared_licenses: string[];
  declared_licenses_processed: ProcessedDeclaredLicense;
  description: string;
  homepage_url: string;
  binary_artifact: RemoteArtifact;
  source_artifact: RemoteArtifact;
  vcs: VcsInfo;
  vcs_processed: VcsInfo;
}

export interface Identifier {
  type: string;
  namespace: string;
  name: string;
  version: string;
}

export interface ProcessedDeclaredLicense {
  spdx_expression?: string;
  mapped?: Record<string, string>;
  unmapped?: string[];
}

export interface RemoteArtifact {
  url: string;
  hash: Hash;
}

export interface Hash {
  value: string;
  algorithm: string;
}

export interface ScopeDependencies {
  name: string;
  dependencies: DependencyNode[];
}

export interface DependencyNode {
  id: Identifier;
  dependencies: DependencyReference[];
  issues: Issue[];
}

export interface DependencyReference {
  id: Identifier;
}

export interface Issue {
  timestamp: string;
  source: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'HINT';
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
}

export interface DependencyGraphNode {
  id: number;
  pkg: Identifier;
  fragment: number;
  linkage: 'DYNAMIC' | 'STATIC' | 'PROJECT_DYNAMIC' | 'PROJECT_STATIC';
}

export interface DependencyGraphEdge {
  from: number;
  to: number;
}

export interface AdvisorResult {
  start_time: string;
  end_time: string;
  advisories: Record<string, Advisories[]>;
}

export interface Advisories {
  advisor: string;
  capabilities: AdvisorCapability[];
  vulnerabilities: Vulnerability[];
  defects: unknown[];
}

export interface AdvisorCapability {
  name: string;
  enabled: boolean;
}

export interface Vulnerability {
  id: string;
  summary: string;
  description: string;
  references: Reference[];
  severity?: string;
  cvss?: number;
}

export interface Reference {
  url: string;
  scoring_system?: string;
  severity?: string;
  score?: number;
}

export interface ScannerResult {
  start_time: string;
  end_time: string;
  scan_results: ScanResult[];
}

export interface ScanResult {
  id: Identifier;
  results: ScanSummary[];
}

export interface ScanSummary {
  provenance: Provenance;
  scanner: ScannerDetails;
  summary: LicenseFindingSummary;
}

export interface Provenance {
  start_time: string;
  end_time: string;
}

export interface ScannerDetails {
  name: string;
  version: string;
  configuration: string;
}

export interface LicenseFindingSummary {
  start_time: string;
  end_time: string;
  file_count: number;
  package_verification_code: string;
  licenses: LicenseFinding[];
  copyrights: CopyrightFinding[];
  issues: Issue[];
}

export interface LicenseFinding {
  license: string;
  location: TextLocation;
  score?: number;
}

export interface CopyrightFinding {
  statement: string;
  location: TextLocation;
}

export interface TextLocation {
  path: string;
  start_line: number;
  end_line: number;
}

/**
 * License risk classification
 */
export type LicenseRisk = 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'unknown' | 'proprietary';

/**
 * UI-specific types
 */
export interface DependencyTreeItem {
  id: Identifier;
  label: string;
  license: string | undefined;
  risk: LicenseRisk;
  children: DependencyTreeItem[];
  vulnerabilities: Vulnerability[];
  issues: Issue[];
}

export interface LicenseStats {
  total: number;
  permissive: number;
  weakCopyleft: number;
  strongCopyleft: number;
  unknown: number;
  byLicense: Record<string, number>;
}

export interface ComplianceStatus {
  status: 'compliant' | 'issues' | 'critical' | 'unknown';
  message: string;
  details: {
    totalPackages: number;
    issuesCount: number;
    vulnerabilitiesCount: number;
    licenseStats: LicenseStats;
  };
}
