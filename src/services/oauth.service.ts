import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const REDIRECT_URI = 'http://localhost:8085/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

interface OAuthCredentials {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  projectId: string;
  email: string;
}

interface AuthFile {
  'google-gemini-cli': OAuthCredentials;
}

interface PkceSession {
  codeVerifier: string;
  state: string;
  expiresAt: number;
}

export class OAuthService {
  private credentials: OAuthCredentials | null = null;
  private pkceSession: PkceSession | null = null;

  constructor(private readonly authFilePath: string) {}

  async init(): Promise<void> {
    try {
      const data = await readFile(this.authFilePath, 'utf-8');
      const parsed = JSON.parse(data) as AuthFile;
      this.credentials = parsed['google-gemini-cli'];
    } catch {
      this.credentials = null;
    }
  }

  isAuthenticated(): boolean {
    return this.credentials !== null;
  }

  getTokenStatus(): { authenticated: boolean; email?: string; expiresAt?: number; expired?: boolean } {
    if (!this.credentials) return { authenticated: false };
    return {
      authenticated: true,
      email: this.credentials.email,
      expiresAt: this.credentials.expires,
      expired: Date.now() >= this.credentials.expires,
    };
  }

  getProjectId(): string {
    return this.credentials?.projectId ?? '';
  }

  async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Not authenticated. Please login via the admin panel.');
    }
    if (Date.now() >= this.credentials.expires - 60_000) {
      await this.refresh();
    }
    return this.credentials.access;
  }

  // Step 1: Generate auth URL. User opens this in browser, logs in.
  startOAuthFlow(): string {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(20).toString('base64url');

    this.pkceSession = { codeVerifier, state, expiresAt: Date.now() + 3 * 60_000 };

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Step 2: User pastes the full callback URL (or just code+state) from the browser.
  async handleCallbackUrl(callbackUrl: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new Error('Invalid URL. Please paste the full callback URL from your browser.');
    }

    const error = url.searchParams.get('error');
    if (error) throw new Error(`OAuth error: ${error}`);

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) throw new Error('Missing code or state in callback URL.');

    await this.exchangeCode(code, state);
  }

  private async exchangeCode(code: string, state: string): Promise<void> {
    if (!this.pkceSession) {
      throw new Error('No active OAuth session. Please click Login again.');
    }
    if (Date.now() > this.pkceSession.expiresAt) {
      this.pkceSession = null;
      throw new Error('OAuth session expired (3 minute timeout). Please click Login again.');
    }
    if (this.pkceSession.state !== state) {
      throw new Error('Invalid OAuth state. Please click Login again.');
    }

    const { codeVerifier } = this.pkceSession;
    this.pkceSession = null;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Token exchange failed: ${resp.status} ${body}`);
    }

    const json = (await resp.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      id_token?: string;
    };

    let email = 'unknown';
    if (json.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(json.id_token.split('.')[1] ?? '', 'base64url').toString());
        email = payload.email ?? 'unknown';
      } catch { /* ignore */ }
    }

    const projectId = await this.discoverProjectId(json.access_token);
    process.stdout.write(`[oauth] login success: email=${email} projectId=${projectId || '(empty)'} tokenExchange=${JSON.stringify({ access_token: json.access_token?.slice(0, 20) + '...', expires_in: json.expires_in, has_refresh: !!json.refresh_token })}\n`);

    this.credentials = {
      type: 'oauth',
      refresh: json.refresh_token,
      access: json.access_token,
      expires: Date.now() + json.expires_in * 1000,
      projectId,
      email,
    };

    await this.persist();
  }

  private async discoverProjectId(accessToken: string): Promise<string> {
    const resp = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'google-api-nodejs-client/9.15.1',
        'X-Goog-Api-Client': 'gl-node/22.17.0',
      },
      body: JSON.stringify({
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      process.stdout.write(`[oauth] discoverProjectId failed: ${resp.status} ${errBody}\n`);
      return '';
    }

    const data = (await resp.json()) as { cloudaicompanionProject?: string | { id?: string } };
    process.stdout.write(`[oauth] discoverProjectId response: ${JSON.stringify(data)}\n`);
    const p = data.cloudaicompanionProject;
    const projectId = (typeof p === 'string' ? p : p?.id) ?? '';
    return projectId;
  }

  private async refresh(): Promise<void> {
    if (!this.credentials) throw new Error('Not authenticated');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: this.credentials.refresh,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      this.credentials = null;
      throw new Error(`OAuth refresh failed (${resp.status}): ${body}. Please re-login via admin panel.`);
    }

    const json = (await resp.json()) as { access_token: string; expires_in: number };
    this.credentials.access = json.access_token;
    this.credentials.expires = Date.now() + json.expires_in * 1000;

    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.credentials) return;
    const updated: AuthFile = { 'google-gemini-cli': this.credentials };
    await writeFile(this.authFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  }
}
