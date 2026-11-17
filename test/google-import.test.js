import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import handler from '../api/rpc.js';
import { googleToken } from '../lib/google-drive.js';

const env = {
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-secret',
  GOOGLE_REFRESH_TOKEN: 'synthetic-refresh',
  GOOGLE_DRIVE_FOLDER_ID: 'isolated-folder',
  GOOGLE_DIAGNOSTIC_SHEET_ID: 'synthetic-sheet',
  GOOGLE_DIAGNOSTIC_ADMIN_ID: 'admin-id',
  SUPABASE_URL: 'https://isolated.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key'
};

function setup(t) {
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  return t.mock.method(console, 'error', () => {});
}

async function request(action, payload) {
  const response = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ method: 'POST', body: { action, args: [payload] } }, response);
  return response;
}

test('classifica OAuth e rede sem registrar descrições, segredos ou payloads', async t => {
  const log = setup(t);
  const oauthErrors = [
    [400, 'invalid_grant'], [401, 'invalid_client'], [400, 'unauthorized_client'],
    [403, 'access_denied'], [400, 'http_400'], [401, 'http_401'], [403, 'http_403'],
    [429, 'http_429'], [503, 'http_5xx']
  ];
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const [status, code] of oauthErrors) {
    fetch.mock.mockImplementation(async () => Response.json({
      error: code.startsWith('http_') ? 'synthetic-secret' : code,
      error_description: 'synthetic-refresh'
    }, { status }));
    await assert.rejects(googleToken(), error => {
      assert.equal(error.details.code, code);
      assert.equal(error.details.httpStatus, status);
      assert.match(error.details.correlationId, /^[\da-f-]{36}$/);
      assert.equal(error.status, status >= 500 || status === 429 ? 503 : 502);
      assert.doesNotMatch(error.message, /synthetic-(?:secret|refresh)/);
      return true;
    });
  }
  fetch.mock.mockImplementation(async () => { throw new Error('synthetic-secret'); });
  await assert.rejects(googleToken(), error => error.details.code === 'network_error' && error.status === 503);
  fetch.mock.mockImplementation(async () => Response.json({ access_token: 'synthetic-access' }));
  assert.equal(await googleToken(), 'synthetic-access');
  delete process.env.GOOGLE_CLIENT_SECRET;
  const calls = fetch.mock.callCount();
  await assert.rejects(googleToken(), error => error.details.code === 'missing_configuration');
  assert.equal(fetch.mock.callCount(), calls);
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map(call => call.arguments)), /synthetic-(?:secret|refresh|access)/);
});

test('diagnóstico exige ADMIN ativo vinculado e consulta apenas metadados', async t => {
  setup(t);
  let id = 'other-id';
  let profile = 'PCP';
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id });
    if (url.includes('/usuarios_perfis?')) {
      assert.match(url, /auth_user_id=eq.admin-id/);
      assert.equal(options.method, 'GET');
      return Response.json([{ perfil: profile, ativo: true }]);
    }
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'synthetic-access' });
    assert.equal(options.method, undefined);
    if (url.includes('/drive/v3/files/')) return Response.json({
      mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true }
    });
    assert.match(url, /sheets.googleapis.com/);
    return Response.json({ spreadsheetId: 'synthetic-sheet' });
  });
  const payload = { auth: { accessToken: 'synthetic-session' } };
  assert.equal((await request('diagnosticarIntegracaoGoogle', payload)).code, 400);
  assert.equal(fetch.mock.callCount(), 1);
  id = 'admin-id';
  assert.equal((await request('diagnosticarIntegracaoGoogle', payload)).code, 400);
  assert.equal(fetch.mock.callCount(), 3);
  profile = 'ADMIN';
  const response = await request('diagnosticarIntegracaoGoogle', payload);
  assert.equal(response.code, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  const { oauth, drive, sheets, escritaSintetica } = response.body.result;
  assert.deepEqual([oauth.status, drive.status, sheets.status, escritaSintetica.status],
    ['ok', 'ok', 'ok', 'nao_executado']);
  assert.doesNotMatch(JSON.stringify(response.body), /synthetic-/);
});

test('análise de XLSX sintético recupera após falha OAuth e limpa células antes de exportar', async t => {
  const log = setup(t);
  const rows = [
    ['PEDIDO', '12345', '', 'DATA EMISSÃO', 45567],
    ['CLIENTE', 'Cliente Sintético'],
    ['PRAZO ENTREGA', '30 / 45 DIAS'],
    ['ITEM', 'MANGA', 'TECIDO', 'COR', 'P', 'M', 'G', 'VALOR R$'],
    ['Camiseta', 'CURTA', 'PIQUET', 'AZUL', 2, 3, 4, 'R$ 999,00']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'PEDIDO');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  let oauthAvailable = false;
  const stages = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: 'admin-id', email: 'synthetic@example.invalid' });
    if (path.includes('/usuarios_perfis?')) return Response.json([{ perfil: 'ADMIN', ativo: true }]);
    if (path.includes('oauth2.googleapis.com')) {
      if (!oauthAvailable) return Response.json({ error: 'invalid_grant', error_description: 'synthetic-secret' }, { status: 400 });
      return Response.json({ access_token: 'synthetic-access' });
    }
    if (path.includes('upload/drive') && path.endsWith('fields=id')) {
      stages.push('converter'); return Response.json({ id: 'synthetic-sheet' });
    }
    if (path.endsWith('/values:batchClear')) {
      assert.ok(JSON.parse(options.body).ranges.includes("'PEDIDO'!H5:H5"));
      stages.push('limpar'); return Response.json({});
    }
    if (path.includes('sheets.googleapis.com')) return Response.json({ sheets: [{ properties: { title: 'PEDIDO', sheetId: 0 } }] });
    if (path.includes('/export?')) {
      stages.push('exportar'); return new Response('%PDF-1.4 synthetic', { headers: { 'Content-Type': 'application/pdf' } });
    }
    if (path.includes('upload/drive')) {
      assert.match(options.body.toString(), /%PDF-1.4 synthetic/);
      assert.match(options.body.toString(), /isolated-folder/);
      stages.push('enviar'); return Response.json({ id: 'synthetic-pdf' });
    }
    if (options.method === 'DELETE' && path.endsWith('/synthetic-sheet')) {
      stages.push('limpar temporária'); return new Response(null, { status: 204 });
    }
    assert.fail(`Requisição inesperada: ${path}`);
  });
  const payload = { auth: { accessToken: 'synthetic-session' }, base64, nomeArquivo: '12345 SINTETICO.xlsx' };
  const failed = await request('analisarArquivoExcel', payload);
  assert.equal(failed.code, 502);
  assert.match(failed.body.error, /revisada pelo administrador/);
  assert.doesNotMatch(JSON.stringify(failed.body), /invalid_grant|synthetic-secret/);
  assert.equal(failed.body.correlationId, log.mock.calls[0].arguments[1].correlationId);
  assert.deepEqual(stages, []);
  oauthAvailable = true;
  const success = await request('analisarArquivoExcel', payload);
  assert.equal(success.code, 200);
  assert.equal(success.body.result.pdfSanitizado, true);
  assert.equal(success.body.result.tempPdfId, 'synthetic-pdf');
  assert.equal(success.body.result.qtdTotal, 9);
  assert.doesNotMatch(JSON.stringify(success.body), /999,00/);
  assert.deepEqual(stages, ['converter', 'limpar', 'exportar', 'enviar', 'limpar temporária']);
});
