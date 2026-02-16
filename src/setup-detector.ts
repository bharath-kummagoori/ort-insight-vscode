/**
 * Setup Detector - Detects Java and ORT installations across all platforms
 *
 * Scans the user's system to find Java 21+ and ORT CLI installations.
 * Checks these locations in order:
 *   1. JAVA_HOME / PATH environment variables
 *   2. Common install directories (Program Files, /usr/lib/jvm, homebrew, etc.)
 *   3. User-configured paths in VS Code settings
 *
 * Works on Windows, macOS, and Linux. Uses execFileSync (not execSync)
 * for all subprocess calls to prevent command injection.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SetupStatus {
  java: {
    installed: boolean;
    version: string | undefined;
    path: string | undefined;
    javaHome: string | undefined;
  };
  ort: {
    installed: boolean;
    version: string | undefined;
    path: string | undefined;
  };
  ready: boolean;
}

export class SetupDetector {

  /**
   * Run full environment detection
   */
  static detect(): SetupStatus {
    const java = SetupDetector.detectJava();
    const ort = SetupDetector.detectOrt();

    return {
      java,
      ort,
      ready: java.installed && ort.installed
    };
  }

  /**
   * Detect Java installation
   */
  static detectJava(): SetupStatus['java'] {
    // 1. Check JAVA_HOME environment variable
    if (process.env.JAVA_HOME) {
      const javaBin = SetupDetector.getJavaBinary(process.env.JAVA_HOME);
      if (javaBin) {
        const version = SetupDetector.getJavaVersion(javaBin);
        return {
          installed: true,
          version,
          path: javaBin,
          javaHome: process.env.JAVA_HOME
        };
      }
    }

    // 2. Check if java is in PATH
    const javaInPath = SetupDetector.findInPath('java');
    if (javaInPath) {
      const version = SetupDetector.getJavaVersion(javaInPath);
      // Try to derive JAVA_HOME from the java binary path
      const derivedHome = SetupDetector.deriveJavaHome(javaInPath);
      return {
        installed: true,
        version,
        path: javaInPath,
        javaHome: derivedHome
      };
    }

    // 3. Check common installation paths by platform
    const commonPaths = SetupDetector.getCommonJavaPaths();
    for (const javaHome of commonPaths) {
      if (fs.existsSync(javaHome)) {
        const javaBin = SetupDetector.getJavaBinary(javaHome);
        if (javaBin) {
          const version = SetupDetector.getJavaVersion(javaBin);
          return {
            installed: true,
            version,
            path: javaBin,
            javaHome
          };
        }
      }
    }

    return {
      installed: false,
      version: undefined,
      path: undefined,
      javaHome: undefined
    };
  }

  /**
   * Try to get ORT version from the executable
   */
  static getOrtVersion(ortPath: string): string | undefined {
    try {
      // Set up JAVA_HOME for the version check
      const env = { ...process.env };
      if (!env.JAVA_HOME) {
        const java = SetupDetector.detectJava();
        if (java.javaHome) {
          env.JAVA_HOME = java.javaHome;
          const pathSep = process.platform === 'win32' ? ';' : ':';
          env.PATH = `${java.javaHome}${pathSep}bin${pathSep}${env.PATH || ''}`;
        }
      }

      const output = child_process.execFileSync(ortPath, ['--version'], {
        timeout: 30000,
        encoding: 'utf-8',
        env
      });
      const match = output.match(/version\s+(\d+\.\d+\.\d+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Detect ORT installation
   */
  static detectOrt(): SetupStatus['ort'] {
    // 1. Check if ort is in PATH
    const ortInPath = SetupDetector.findInPath('ort');
    if (ortInPath) {
      return {
        installed: true,
        version: SetupDetector.getOrtVersion(ortInPath),
        path: ortInPath
      };
    }

    // 2. Check common ORT installation locations
    const commonPaths = SetupDetector.getCommonOrtPaths();
    for (const ortPath of commonPaths) {
      if (fs.existsSync(ortPath)) {
        return {
          installed: true,
          version: SetupDetector.getOrtVersion(ortPath),
          path: ortPath
        };
      }
    }

    return {
      installed: false,
      version: undefined,
      path: undefined
    };
  }

  /**
   * Get java binary path from JAVA_HOME
   */
  private static getJavaBinary(javaHome: string): string | undefined {
    const isWin = process.platform === 'win32';
    const javaBin = path.join(javaHome, 'bin', isWin ? 'java.exe' : 'java');
    if (fs.existsSync(javaBin)) {
      return javaBin;
    }
    return undefined;
  }

  /**
   * Get Java version string
   */
  private static getJavaVersion(javaBin: string): string | undefined {
    try {
      const output = child_process.execFileSync(javaBin, ['-version'], {
        timeout: 10000,
        encoding: 'utf-8'
      });
      // Java version output looks like: openjdk version "21.0.10" or java version "21.0.10"
      const match = output.match(/version\s+"([^"]+)"/);
      return match ? match[1] : output.trim().split('\n')[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Derive JAVA_HOME from java binary path
   */
  private static deriveJavaHome(javaBin: string): string | undefined {
    try {
      // java binary is typically at JAVA_HOME/bin/java
      const binDir = path.dirname(javaBin);
      const javaHome = path.dirname(binDir);
      if (fs.existsSync(path.join(javaHome, 'bin'))) {
        return javaHome;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * Find executable in PATH
   */
  private static findInPath(name: string): string | undefined {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const result = child_process.execFileSync(cmd, [name], {
        timeout: 5000,
        encoding: 'utf-8'
      }).trim();
      // 'where' on Windows can return multiple lines
      const firstLine = result.split('\n')[0].trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    } catch {
      // not found
    }
    return undefined;
  }

  /**
   * Common Java installation paths across platforms
   */
  private static getCommonJavaPaths(): string[] {
    const home = os.homedir();
    const platform = process.platform;

    if (platform === 'win32') {
      return [
        // Eclipse Adoptium (Temurin)
        'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.10.7-hotspot',
        'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot',
        'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
        // Oracle JDK
        'C:\\Program Files\\Java\\jdk-21',
        'C:\\Program Files\\Java\\jdk-21.0.10',
        'C:\\Program Files\\Java\\jdk-17',
        // Amazon Corretto
        'C:\\Program Files\\Amazon Corretto\\jdk21',
        'C:\\Program Files\\Amazon Corretto\\jdk17',
        // Microsoft OpenJDK
        'C:\\Program Files\\Microsoft\\jdk-21',
        'C:\\Program Files\\Microsoft\\jdk-17',
        // Azul Zulu
        'C:\\Program Files\\Zulu\\zulu-21',
        'C:\\Program Files\\Zulu\\zulu-17',
        // Scoop
        `${home}\\scoop\\apps\\temurin21-jdk\\current`,
        `${home}\\scoop\\apps\\openjdk21\\current`,
        // Chocolatey
        'C:\\ProgramData\\chocolatey\\lib\\temurin21\\tools',
        // Wildcard search for any JDK 21 in Program Files
        ...SetupDetector.globJavaDirs('C:\\Program Files\\Eclipse Adoptium', 'jdk-21'),
        ...SetupDetector.globJavaDirs('C:\\Program Files\\Java', 'jdk-21'),
      ];
    }

    if (platform === 'darwin') {
      return [
        // Homebrew (Apple Silicon)
        '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
        '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
        '/opt/homebrew/Cellar/openjdk@21',
        // Homebrew (Intel)
        '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
        '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
        // Eclipse Adoptium
        '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home',
        '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
        // Oracle
        '/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home',
        // Amazon Corretto
        '/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home',
        // Azul Zulu
        '/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home',
        // SDKMAN
        `${home}/.sdkman/candidates/java/current`,
        // jabba
        `${home}/.jabba/jdk/default`,
        // Any JDK in standard macOS location
        ...SetupDetector.globJavaDirs('/Library/Java/JavaVirtualMachines', ''),
      ];
    }

    // Linux
    return [
      // Package manager installs
      '/usr/lib/jvm/java-21-openjdk',
      '/usr/lib/jvm/java-21-openjdk-amd64',
      '/usr/lib/jvm/java-21-openjdk-arm64',
      '/usr/lib/jvm/temurin-21-jdk',
      '/usr/lib/jvm/temurin-21-jdk-amd64',
      '/usr/lib/jvm/java-21-amazon-corretto',
      '/usr/lib/jvm/zulu-21',
      '/usr/lib/jvm/java-17-openjdk',
      '/usr/lib/jvm/java-17-openjdk-amd64',
      // Snap
      '/snap/openjdk/current/jdk',
      // SDKMAN
      `${home}/.sdkman/candidates/java/current`,
      // jabba
      `${home}/.jabba/jdk/default`,
      // Manual installs
      '/opt/java/jdk-21',
      '/opt/jdk-21',
      // Any JDK in standard Linux location
      ...SetupDetector.globJavaDirs('/usr/lib/jvm', 'java-21'),
      ...SetupDetector.globJavaDirs('/usr/lib/jvm', 'temurin-21'),
    ];
  }

  /**
   * Common ORT installation paths across platforms
   */
  private static getCommonOrtPaths(): string[] {
    const home = os.homedir();
    const desktop = path.join(home, 'Desktop');
    const platform = process.platform;
    const isWin = platform === 'win32';
    const ortBin = isWin ? 'ort.bat' : 'ort';

    const paths: string[] = [];

    // Search Desktop, Downloads, home, and opt for ORT directories
    const searchDirs = [
      desktop,
      path.join(home, 'Downloads'),
      home,
      isWin ? 'C:\\tools' : '/opt',
      isWin ? 'C:\\ort' : '/usr/local',
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) { continue; }
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          // Look for directories that look like ORT installations
          if (entry.toLowerCase().startsWith('ort')) {
            const ortDir = path.join(dir, entry);
            // Check direct bin/ort.bat
            const binPath = path.join(ortDir, 'bin', ortBin);
            if (fs.existsSync(binPath)) {
              paths.push(binPath);
            }
            // Check nested version directory (e.g., ort/ort-79.0.0/bin/ort.bat)
            try {
              const subEntries = fs.readdirSync(ortDir);
              for (const sub of subEntries) {
                if (sub.toLowerCase().startsWith('ort')) {
                  const nestedBin = path.join(ortDir, sub, 'bin', ortBin);
                  if (fs.existsSync(nestedBin)) {
                    paths.push(nestedBin);
                  }
                }
              }
            } catch {
              // ignore permission errors
            }
          }
        }
      } catch {
        // ignore permission errors
      }
    }

    // Also check standard install locations
    if (isWin) {
      paths.push(
        `${home}\\.ort\\bin\\ort.bat`,
        'C:\\ort\\bin\\ort.bat',
      );
    } else {
      paths.push(
        `${home}/.ort/bin/ort`,
        '/opt/ort/bin/ort',
        '/usr/local/bin/ort',
        `${home}/ort/bin/ort`,
      );
    }

    return paths;
  }

  /**
   * Glob for Java directories matching a prefix
   */
  private static globJavaDirs(parentDir: string, prefix: string): string[] {
    const results: string[] = [];
    try {
      if (!fs.existsSync(parentDir)) { return results; }
      const entries = fs.readdirSync(parentDir);
      for (const entry of entries) {
        if (prefix && !entry.toLowerCase().includes(prefix.toLowerCase())) {
          continue;
        }
        const fullPath = path.join(parentDir, entry);
        // On macOS, JDKs are in Contents/Home
        const macHome = path.join(fullPath, 'Contents', 'Home');
        if (fs.existsSync(macHome)) {
          results.push(macHome);
        } else if (fs.existsSync(path.join(fullPath, 'bin'))) {
          results.push(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  /**
   * Get download URLs
   */
  static getDownloadUrls() {
    return {
      java: {
        adoptium: 'https://adoptium.net/temurin/releases/?version=21',
        oracle: 'https://www.oracle.com/java/technologies/downloads/#java21',
      },
      ort: {
        github: 'https://github.com/oss-review-toolkit/ort/releases',
        docs: 'https://oss-review-toolkit.org/ort/docs/getting-started/installation',
      }
    };
  }
}
