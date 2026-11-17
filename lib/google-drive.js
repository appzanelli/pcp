import { randomUUID } from 'node:crypto';

const oauthEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
const knownCodes = new Set([
  'invalid_grant', 'invalid_client', 'unauthorized_client', 'access_denied',
  'invalid_request', 'invalid_scope', 'deleted_client', 'admin_policy_enforced',
  'SERVICE_DISABLED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'insufficientFilePermissions',
  'rateLimitExceeded', 'userRateLimitExceeded'
]);
const configured = name => Boolean(process.env[name]?.trim());

export class GoogleIntegrationError extends Error {
  constructor(stage, code, httpStatus = null) {
    const temporary = code === 'network_error' || code === 'timeout' || httpStatus === 429 ||
      httpStatus >= 500 || code === 'rateLimitExceeded' || code === 'userRateLimitExceeded';
    const message = temporary
      ? 'A integração com Google Drive está temporariamente indisponível. Tente novamente em instantes.'
      : stage === 'oauth'
        ? 'Falha na integração com Google Drive. A autenticação precisa ser revisada pelo administrador.'
        : 'Falha na integração com Google Drive ao processar o documento. Informe a referência ao administrador.';
    const correlationId = randomUUID();
    super(`${message} Referência: ${correlationId}.`);
    this.details = { stage, code, httpStatus, correlationId };
    this.status = temporary ? 503 : 502;
    console.error('google_integration_failure', this.details);
  }
}

export async function googleRequest(stage, url, options, { allowNotFound = false } = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new GoogleIntegrationError(stage, error?.name === 'TimeoutError' ? 'timeout' : 'network_error');
  }
  if (response.ok || (allowNotFound && response.status === 404)) return response;

  const body = await response.json().catch(() => null);
  const error = body?.error;
  const candidates = typeof error === 'string'
    ? [error]
    : [...(Array.isArray(error?.details) ? error.details.map(entry => entry?.reason) : []),
        error?.errors?.[0]?.reason, error?.status];
  const code = candidates.find(value => knownCodes.has(value)) ||
    (response.status >= 500 ? 'http_5xx' : `http_${response.status}`);
  throw new GoogleIntegrationError(stage, code, response.status);
}

export async function googleJson(stage, url, options) {
  const response = await googleRequest(stage, url, options);
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GoogleIntegrationError(stage, 'invalid_response', response.status);
  }
  return value;
}

export async function googleToken() {
  if (!oauthEnv.every(configured)) throw new GoogleIntegrationError('oauth', 'missing_configuration');
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const data = await googleJson('oauth', 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new GoogleIntegrationError('oauth', 'invalid_response', 200);
  }
  return data.access_token;
}

async function check(run) {
  try {
    return { status: 'ok', ...await run() };
  } catch (error) {
    if (!(error instanceof GoogleIntegrationError)) throw error;
    return { status: 'erro', ...error.details };
  }
}

export async function diagnoseGoogle() {
  const keys = [...oauthEnv, 'GOOGLE_DRIVE_FOLDER_ID', 'GOOGLE_DIAGNOSTIC_SHEET_ID'];
  const variaveis = Object.fromEntries(keys.map(key => [key, configured(key)]));
  const result = {
    variaveis,
    oauth: { status: 'nao_executado' },
    drive: { status: 'nao_executado' },
    sheets: { status: 'nao_executado' },
    escritaSintetica: { status: 'nao_executado', code: 'requer_ambiente_isolado' }
  };
  let token;
  result.oauth = await check(async () => { token = await googleToken(); });
  if (!token) return result;

  const headers = { Authorization: `Bearer ${token}` };
  const folderId = encodeURIComponent(process.env.GOOGLE_DRIVE_FOLDER_ID || '');
  const sheetId = encodeURIComponent(process.env.GOOGLE_DIAGNOSTIC_SHEET_ID || '');
  [result.drive, result.sheets] = await Promise.all([
    variaveis.GOOGLE_DRIVE_FOLDER_ID ? check(async () => {
      const folder = await googleJson('drive_folder',
        `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=mimeType,trashed,capabilities(canAddChildren)`, { headers });
      if (folder.mimeType !== 'application/vnd.google-apps.folder' || folder.trashed) {
        throw new GoogleIntegrationError('drive_folder', 'invalid_folder');
      }
      if (folder.capabilities?.canAddChildren !== true) {
        throw new GoogleIntegrationError('drive_folder', 'cannot_add_children');
      }
      return { podeAdicionarArquivos: true };
    }) : { status: 'nao_executado', code: 'missing_configuration' },
    variaveis.GOOGLE_DIAGNOSTIC_SHEET_ID ? check(async () => {
      await googleJson('sheets_probe',
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId`, { headers });
    }) : { status: 'nao_executado', code: 'missing_fixture' }
  ]);
  return result;
}
