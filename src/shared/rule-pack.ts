import type { FindingCategory, FindingSeverity } from './types';

export type MatcherKind =
  | 'regex-content'
  | 'file-exists'
  | 'file-missing'
  | 'package-version'
  | 'env-var-name'
  | 'json-path-equals';

export type FileScope =
  | 'all'
  | 'source'
  | 'config'
  | 'env-secret'
  | 'env-example'
  | 'lock'
  | 'doc';

export interface RegexContentMatcher {
  kind: 'regex-content';
  pattern: string;
  flags?: string;
  scope?: FileScope;
  pathInclude?: string;
  pathExclude?: string;
  maxBytesPerFile?: number;
}

export interface FileExistsMatcher {
  kind: 'file-exists';
  path: string;
}

export interface FileMissingMatcher {
  kind: 'file-missing';
  path: string;
  requireSibling?: string;
}

export interface PackageVersionMatcher {
  kind: 'package-version';
  ecosystem: 'npm' | 'pypi';
  packageName: string;
  vulnerableRange: string;
}

export interface EnvVarNameMatcher {
  kind: 'env-var-name';
  pattern: string;
  flags?: string;
}

export interface JsonPathEqualsMatcher {
  kind: 'json-path-equals';
  filePath: string;
  jsonPath: string;
  expected: string | number | boolean | null;
  invert?: boolean;
}

export type Matcher =
  | RegexContentMatcher
  | FileExistsMatcher
  | FileMissingMatcher
  | PackageVersionMatcher
  | EnvVarNameMatcher
  | JsonPathEqualsMatcher;

export interface RulePackRule {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  recommendation: string;
  references?: string[];
  cwe?: string[];
  cve?: string[];
  matcher: Matcher;
  appliesTo?: {
    frameworks?: string[];
    primaryStack?: string[];
  };
  enabled?: boolean;
}

export interface RulePackManifest {
  schemaVersion: 1;
  packId: string;
  packVersion: string;
  publishedAt: string;
  description?: string;
  source: 'builtin' | 'remote';
  signatureAlgorithm?: 'ed25519';
  signature?: string;
  ruleCount: number;
}

export interface RulePack {
  manifest: RulePackManifest;
  rules: RulePackRule[];
}

export interface RulePackUpdateInfo {
  packId: string;
  packVersion: string;
  publishedAt: string;
  url: string;
  signature: string;
  sha256: string;
  ruleCount: number;
  description?: string;
}

export type RulePackUpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'downloading'
  | 'verifying'
  | 'updated'
  | 'error'
  | 'disabled';

export interface RulePackUpdateResult {
  status: RulePackUpdateStatus;
  currentVersion: string | null;
  latestVersion: string | null;
  message: string | null;
  errorCode?: 'no-pubkey' | 'fetch-failed' | 'manifest-invalid' | 'sha-mismatch' | 'sig-invalid' | 'parse-failed' | 'write-failed';
}

export interface RulePackUpdateState {
  manifest: RulePackManifest | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}
