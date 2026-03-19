import { createHash } from "node:crypto";

export interface DlpPattern {
  name: string;
  category: string;
  regex: RegExp;
  validator?: (match: string) => boolean;
}

export interface DlpScanResult {
  blocked: boolean;
  matches: DlpMatch[];
}

export interface DlpMatch {
  category: string;
  pattern: string;
  redacted: string;
}

// ---- Pattern Library ----

const patterns: DlpPattern[] = [
  // --- API Keys ---
  {
    name: "aws_access_key",
    category: "api_key",
    regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  },
  {
    name: "aws_secret_key",
    category: "api_key",
    regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*[A-Za-z0-9/+=]{40}/g,
  },
  {
    name: "github_pat",
    category: "api_key",
    regex: /ghp_[A-Za-z0-9]{36}/g,
  },
  {
    name: "github_fine_grained",
    category: "api_key",
    regex: /github_pat_[A-Za-z0-9_]{82}/g,
  },
  {
    name: "github_oauth",
    category: "api_key",
    regex: /gho_[A-Za-z0-9]{36}/g,
  },
  {
    name: "github_app_token",
    category: "api_key",
    regex: /(?:ghu|ghs)_[A-Za-z0-9]{36}/g,
  },
  {
    name: "stripe_live_key",
    category: "api_key",
    regex: /sk_live_[A-Za-z0-9]{24,}/g,
  },
  {
    name: "stripe_test_key",
    category: "api_key",
    regex: /sk_test_[A-Za-z0-9]{24,}/g,
  },
  {
    name: "stripe_restricted_key",
    category: "api_key",
    regex: /rk_live_[A-Za-z0-9]{24,}/g,
  },
  {
    name: "openai_key",
    category: "api_key",
    regex: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g,
  },
  {
    name: "openai_key_v2",
    category: "api_key",
    regex: /sk-proj-[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "anthropic_key",
    category: "api_key",
    regex: /sk-ant-[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "slack_bot_token",
    category: "api_key",
    regex: /xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24}/g,
  },
  {
    name: "slack_user_token",
    category: "api_key",
    regex: /xoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}/g,
  },
  {
    name: "slack_webhook",
    category: "api_key",
    regex: /hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{24}/g,
  },
  {
    name: "google_api_key",
    category: "api_key",
    regex: /AIza[A-Za-z0-9_-]{35}/g,
  },
  {
    name: "twilio_api_key",
    category: "api_key",
    regex: /SK[a-f0-9]{32}/g,
  },
  {
    name: "sendgrid_key",
    category: "api_key",
    regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
  },
  {
    name: "mailgun_key",
    category: "api_key",
    regex: /key-[A-Za-z0-9]{32}/g,
  },
  {
    name: "azure_sas_token",
    category: "api_key",
    regex: /(?:sv|sig|se|sp|srt|ss)=[A-Za-z0-9%+/=]{20,}/g,
  },
  {
    name: "azure_connection_string",
    category: "api_key",
    regex: /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{44,}/g,
  },
  {
    name: "heroku_api_key",
    category: "api_key",
    regex: /[hH]eroku[^\S\r\n]*[=:][^\S\r\n]*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
  },
  {
    name: "datadog_api_key",
    category: "api_key",
    regex: /(?:dd_api_key|datadog_api_key)\s*[=:]\s*[a-f0-9]{32}/gi,
  },
  {
    name: "npm_token",
    category: "api_key",
    regex: /npm_[A-Za-z0-9]{36}/g,
  },
  {
    name: "pypi_token",
    category: "api_key",
    regex: /pypi-[A-Za-z0-9_-]{50,}/g,
  },

  // --- Private Keys ---
  {
    name: "pem_private_key",
    category: "private_key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "ssh_private_key",
    category: "private_key",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
  },
  {
    name: "pgp_private_key",
    category: "private_key",
    regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
  },

  // --- Credentials ---
  {
    name: "jwt_token",
    category: "credential",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: "postgresql_uri",
    category: "credential",
    regex: /postgres(?:ql)?:\/\/[^\s'"]{10,}/gi,
  },
  {
    name: "mysql_uri",
    category: "credential",
    regex: /mysql:\/\/[^\s'"]{10,}/gi,
  },
  {
    name: "mongodb_uri",
    category: "credential",
    regex: /mongodb(?:\+srv)?:\/\/[^\s'"]{10,}/gi,
  },
  {
    name: "redis_uri_with_password",
    category: "credential",
    regex: /redis:\/\/:[^\s@'"]+@[^\s'"]+/gi,
  },
  {
    name: "generic_password",
    category: "credential",
    regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/gi,
  },
  {
    name: "bearer_token",
    category: "credential",
    regex: /[Bb]earer\s+[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "basic_auth",
    category: "credential",
    regex: /[Bb]asic\s+[A-Za-z0-9+/=]{20,}/g,
  },

  // --- PII ---
  {
    name: "credit_card",
    category: "pii",
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    validator: luhnCheck,
  },
  {
    name: "ssn",
    category: "pii",
    regex: /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g,
  },
  {
    name: "email_address",
    category: "pii",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    name: "us_phone",
    category: "pii",
    regex: /\b(?:\+1[- ]?)?\(?[0-9]{3}\)?[- ]?[0-9]{3}[- ]?[0-9]{4}\b/g,
  },

  // --- Cloud / Infrastructure ---
  {
    name: "gcp_service_account",
    category: "credential",
    regex: /"type"\s*:\s*"service_account"/g,
  },
  {
    name: "aws_mfa_device",
    category: "credential",
    regex: /arn:aws:iam::\d{12}:mfa\/[^\s'"]+/g,
  },
  {
    name: "private_ip",
    category: "infrastructure",
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
  },
];

/**
 * Luhn algorithm for credit card number validation.
 */
function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Calculate Shannon entropy of a string.
 */
function shannonEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;

  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

// UUID pattern to exclude from entropy checks
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_HASH_REGEX = /^[0-9a-f]{32,128}$/i;

/**
 * Check for high-entropy strings that might be secrets.
 * Excludes UUIDs and known hash formats.
 */
function checkHighEntropy(text: string): DlpMatch | null {
  // Split text into word-like tokens
  const tokens = text.match(/[A-Za-z0-9+/=_-]{20,}/g);
  if (!tokens) return null;

  for (const token of tokens) {
    // Skip UUIDs and known hash formats
    if (UUID_REGEX.test(token) || HEX_HASH_REGEX.test(token)) continue;

    const entropy = shannonEntropy(token);
    if (entropy > 4.5 && token.length > 20) {
      return {
        category: "high_entropy",
        pattern: "entropy_check",
        redacted: `${token.slice(0, 4)}...${token.slice(-4)} (entropy: ${entropy.toFixed(2)})`,
      };
    }
  }
  return null;
}

/**
 * Scan text content for sensitive patterns.
 * Returns a result indicating whether content should be blocked.
 */
export function scanContent(text: string): DlpScanResult {
  const matches: DlpMatch[] = [];

  // Scan with regex patterns
  for (const pattern of patterns) {
    // Reset regex state for global patterns
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const matchedText = match[0];

      // Run additional validator if present
      if (pattern.validator && !pattern.validator(matchedText)) {
        continue;
      }

      matches.push({
        category: pattern.category,
        pattern: pattern.name,
        redacted: `${matchedText.slice(0, 6)}...${matchedText.slice(-4)}`,
      });

      // Only report first match per pattern to avoid noise
      break;
    }
  }

  // Check for high-entropy strings
  const entropyMatch = checkHighEntropy(text);
  if (entropyMatch) {
    matches.push(entropyMatch);
  }

  return {
    blocked: matches.length > 0,
    matches,
  };
}

/**
 * Hash content for logging (never log the actual blocked content).
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Scan a JSON payload recursively.
 * Serializes the entire payload to text and scans it.
 */
export function scanPayload(payload: unknown): DlpScanResult {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return scanContent(text);
}
