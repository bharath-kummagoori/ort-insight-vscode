/**
 * Unit tests for ORTParser
 *
 * These tests verify the ORT result parsing, license classification,
 * dependency tree building, and compliance status logic.
 */

import * as assert from 'assert';
import { ORTParser } from '../ort-parser';
import { ORTResult, LicenseRisk } from '../types';

/**
 * Helper: create a minimal valid ORTResult object for testing
 */
function createMinimalORTResult(overrides?: Partial<ORTResult>): ORTResult {
  return {
    repository: {
      vcs: { type: 'Git', url: 'https://example.com/repo.git', revision: 'abc123', path: '' },
      config: {}
    },
    analyzer: {
      start_time: '2024-01-01T00:00:00Z',
      end_time: '2024-01-01T00:01:00Z',
      environment: {
        os: 'Linux',
        processors: 4,
        max_memory: 8192,
        variables: {},
        tool_versions: {}
      },
      config: { allow_dynamic_versions: false },
      result: {
        projects: [],
        packages: [],
        issues: []
      }
    },
    ...overrides
  };
}

suite('ORT Parser Tests', () => {
  let parser: ORTParser;

  suiteSetup(() => {
    // ORTParser constructor reads vscode workspace configuration.
    // In the VS Code test host, vscode API is available.
    parser = new ORTParser();
  });

  // ---------------------------------------------------------------
  // License classification
  // ---------------------------------------------------------------

  test('should classify MIT as permissive', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('MIT');
    assert.strictEqual(risk, 'permissive');
  });

  test('should classify Apache-2.0 as permissive', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('Apache-2.0');
    assert.strictEqual(risk, 'permissive');
  });

  test('should classify BSD-3-Clause as permissive', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('BSD-3-Clause');
    assert.strictEqual(risk, 'permissive');
  });

  test('should classify ISC as permissive', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('ISC');
    assert.strictEqual(risk, 'permissive');
  });

  test('should classify GPL-3.0 as strong copyleft', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('GPL-3.0-only');
    assert.strictEqual(risk, 'strong-copyleft');
  });

  test('should classify GPL-2.0 as strong copyleft', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('GPL-2.0-or-later');
    assert.strictEqual(risk, 'strong-copyleft');
  });

  test('should classify AGPL-3.0 as strong copyleft', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('AGPL-3.0-only');
    assert.strictEqual(risk, 'strong-copyleft');
  });

  test('should classify LGPL-2.1 as weak copyleft', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('LGPL-2.1-only');
    assert.strictEqual(risk, 'weak-copyleft');
  });

  test('should classify MPL-2.0 as weak copyleft', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('MPL-2.0');
    assert.strictEqual(risk, 'weak-copyleft');
  });

  test('should classify undefined license as unknown', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk(undefined);
    assert.strictEqual(risk, 'unknown');
  });

  test('should classify empty string license as unknown', () => {
    // An unrecognised string should fall through to unknown
    const risk: LicenseRisk = parser.classifyLicenseRisk('');
    assert.strictEqual(risk, 'unknown');
  });

  test('should classify proprietary license as proprietary', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('Proprietary');
    assert.strictEqual(risk, 'proprietary');
  });

  test('should classify unknown license string as unknown', () => {
    const risk: LicenseRisk = parser.classifyLicenseRisk('SomeCustomLicense-1.0');
    assert.strictEqual(risk, 'unknown');
  });

  // ---------------------------------------------------------------
  // Parsing empty / minimal results
  // ---------------------------------------------------------------

  test('should handle empty analyzer result for dependency tree', () => {
    const ortResult = createMinimalORTResult();
    const tree = parser.buildDependencyTree(ortResult);
    assert.ok(Array.isArray(tree));
    assert.strictEqual(tree.length, 0);
  });

  test('should handle missing analyzer result gracefully', () => {
    const ortResult = createMinimalORTResult();
    // Simulate a result with no projects at all
    ortResult.analyzer.result.projects = [];
    ortResult.analyzer.result.packages = [];

    const tree = parser.buildDependencyTree(ortResult);
    assert.strictEqual(tree.length, 0);
  });

  test('should handle null-ish analyzer in dependency tree', () => {
    const ortResult = createMinimalORTResult();
    // Force analyzer.result.projects to undefined to test the guard
    (ortResult.analyzer.result as any).projects = undefined;

    const tree = parser.buildDependencyTree(ortResult);
    assert.ok(Array.isArray(tree));
    assert.strictEqual(tree.length, 0);
  });

  // ---------------------------------------------------------------
  // License statistics
  // ---------------------------------------------------------------

  test('should return zero stats for empty result', () => {
    const ortResult = createMinimalORTResult();
    const stats = parser.calculateLicenseStats(ortResult);
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.permissive, 0);
    assert.strictEqual(stats.weakCopyleft, 0);
    assert.strictEqual(stats.strongCopyleft, 0);
    assert.strictEqual(stats.unknown, 0);
    assert.deepStrictEqual(stats.byLicense, {});
  });

  test('should count packages by license category', () => {
    const ortResult = createMinimalORTResult();
    ortResult.analyzer.result.packages = [
      {
        id: { type: 'NPM', namespace: '', name: 'pkg-a', version: '1.0.0' },
        purl: 'pkg:npm/pkg-a@1.0.0',
        declared_licenses: ['MIT'],
        declared_licenses_processed: { spdx_expression: 'MIT' },
        description: '',
        homepage_url: '',
        binary_artifact: { url: '', hash: { value: '', algorithm: '' } },
        source_artifact: { url: '', hash: { value: '', algorithm: '' } },
        vcs: { type: '', url: '', revision: '', path: '' },
        vcs_processed: { type: '', url: '', revision: '', path: '' }
      },
      {
        id: { type: 'NPM', namespace: '', name: 'pkg-b', version: '2.0.0' },
        purl: 'pkg:npm/pkg-b@2.0.0',
        declared_licenses: ['GPL-3.0-only'],
        declared_licenses_processed: { spdx_expression: 'GPL-3.0-only' },
        description: '',
        homepage_url: '',
        binary_artifact: { url: '', hash: { value: '', algorithm: '' } },
        source_artifact: { url: '', hash: { value: '', algorithm: '' } },
        vcs: { type: '', url: '', revision: '', path: '' },
        vcs_processed: { type: '', url: '', revision: '', path: '' }
      }
    ];

    const stats = parser.calculateLicenseStats(ortResult);
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.permissive, 1);
    assert.strictEqual(stats.strongCopyleft, 1);
  });

  // ---------------------------------------------------------------
  // Compliance status
  // ---------------------------------------------------------------

  test('should return compliant status for empty result', () => {
    const ortResult = createMinimalORTResult();
    const status = parser.getComplianceStatus(ortResult);
    assert.strictEqual(status.status, 'compliant');
  });

  test('should return critical status when strong copyleft detected', () => {
    const ortResult = createMinimalORTResult();
    ortResult.analyzer.result.packages = [
      {
        id: { type: 'NPM', namespace: '', name: 'gpl-pkg', version: '1.0.0' },
        purl: 'pkg:npm/gpl-pkg@1.0.0',
        declared_licenses: ['GPL-3.0-only'],
        declared_licenses_processed: { spdx_expression: 'GPL-3.0-only' },
        description: '',
        homepage_url: '',
        binary_artifact: { url: '', hash: { value: '', algorithm: '' } },
        source_artifact: { url: '', hash: { value: '', algorithm: '' } },
        vcs: { type: '', url: '', revision: '', path: '' },
        vcs_processed: { type: '', url: '', revision: '', path: '' }
      }
    ];

    const status = parser.getComplianceStatus(ortResult);
    assert.strictEqual(status.status, 'critical');
    assert.ok(status.message.includes('strong copyleft'));
  });

  test('should return issues status when there are analyzer issues', () => {
    const ortResult = createMinimalORTResult();
    ortResult.analyzer.result.issues = [
      {
        timestamp: '2024-01-01T00:00:00Z',
        source: 'NPM',
        message: 'Something went wrong',
        severity: 'WARNING' as const
      }
    ];

    const status = parser.getComplianceStatus(ortResult);
    assert.strictEqual(status.status, 'issues');
  });

  // ---------------------------------------------------------------
  // Dependency tree building with valid data
  // ---------------------------------------------------------------

  test('should parse valid analyzer result with a project', () => {
    const ortResult = createMinimalORTResult();
    ortResult.analyzer.result.projects = [
      {
        id: { type: 'NPM', namespace: '', name: 'my-app', version: '1.0.0' },
        definition_file_path: 'package.json',
        declared_licenses: ['MIT'],
        declared_licenses_processed: { spdx_expression: 'MIT' },
        vcs: { type: 'Git', url: '', revision: '', path: '' },
        vcs_processed: { type: 'Git', url: '', revision: '', path: '' },
        homepage_url: '',
        scope_dependencies: [
          {
            name: 'dependencies',
            dependencies: [
              {
                id: { type: 'NPM', namespace: '', name: 'lodash', version: '4.17.21' },
                dependencies: [],
                issues: []
              }
            ]
          }
        ]
      }
    ];

    ortResult.analyzer.result.packages = [
      {
        id: { type: 'NPM', namespace: '', name: 'lodash', version: '4.17.21' },
        purl: 'pkg:npm/lodash@4.17.21',
        declared_licenses: ['MIT'],
        declared_licenses_processed: { spdx_expression: 'MIT' },
        description: 'Lodash library',
        homepage_url: 'https://lodash.com',
        binary_artifact: { url: '', hash: { value: '', algorithm: '' } },
        source_artifact: { url: '', hash: { value: '', algorithm: '' } },
        vcs: { type: '', url: '', revision: '', path: '' },
        vcs_processed: { type: '', url: '', revision: '', path: '' }
      }
    ];

    const tree = parser.buildDependencyTree(ortResult);
    assert.strictEqual(tree.length, 1);
    assert.ok(tree[0].label.includes('my-app'));
    assert.strictEqual(tree[0].risk, 'permissive');

    // Should have one scope child
    assert.strictEqual(tree[0].children.length, 1);
    assert.ok(tree[0].children[0].label.includes('dependencies'));

    // The scope child should have one dependency
    assert.strictEqual(tree[0].children[0].children.length, 1);
    assert.ok(tree[0].children[0].children[0].label.includes('lodash'));
  });

  // ---------------------------------------------------------------
  // parseResultFile error handling
  // ---------------------------------------------------------------

  test('should throw on non-existent file', () => {
    assert.throws(
      () => parser.parseResultFile('/nonexistent/path/to/result.json'),
      /Failed to parse ORT result/
    );
  });

  test('should handle empty result file gracefully', () => {
    // Parsing an empty string should fail with a JSON parse error
    // wrapped in "Failed to parse ORT result"
    assert.throws(
      () => parser.parseResultFile('/dev/null'),
      /Failed to parse ORT result/
    );
  });
});
