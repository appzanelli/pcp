const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const label = value => normalized(value).replace(/[.:;º°ª]/g, '').trim();
const digits = value => String(value ?? '').replace(/\D/g, '');

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = clean(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function dateValue(raw, shown = raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  if (typeof raw === 'number' && raw >= 30000 && raw <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const text = clean(shown || raw);
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let year; let month; let day;
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!match) return null;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) [day, month] = [month, day];
  }
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

const formatDate = date => date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '';

function findLabel(matrix, labels) {
  const wanted = labels.map(label);
  for (let r = 0; r < matrix.length; r++) for (let c = 0; c < (matrix[r] || []).length; c++) {
    if (wanted.includes(label(matrix[r][c]))) return { row: r, col: c };
  }
  return null;
}

function findAfter(rawRows, shownRows, position, limit, validator) {
  if (!position) return null;
  const max = Math.min(Math.max(rawRows[position.row]?.length || 0, shownRows[position.row]?.length || 0), position.col + limit + 1);
  for (let c = position.col + 1; c < max; c++) {
    const raw = rawRows[position.row]?.[c] ?? '';
    const shown = shownRows[position.row]?.[c] ?? '';
    if (validator(raw, shown)) return { raw, shown };
  }
  return null;
}

function findColumn(row, names) {
  const wanted = names.map(normalized);
  return row.findIndex(value => wanted.includes(value));
}

function multiLineColumn(rows, headerRow, terms) {
  const wanted = terms.map(normalized);
  for (let r = headerRow; r >= Math.max(0, headerRow - 3); r--) {
    for (let c = 0; c < (rows[r] || []).length; c++) if (wanted.some(term => normalized(rows[r][c]).includes(term))) return c;
  }
  return -1;
}

function findItemHeader(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = (rows[r] || []).map(normalized);
    const item = row.findIndex(value => ['MODELO', 'ITEM', 'PRODUTO'].includes(value) || value.includes('DESCRICAO'));
    const qtd = row.findIndex(value => ['QTD', 'QUANT', 'QUANT.'].includes(value) || value.includes('QUANTIDADE'));
    const grades = [];
    row.forEach((value, index) => { if (/^(PP|P|M|G|GG|XG|XGG|EXG|G\d+|\d{1,3})$/.test(value)) grades.push(index); });
    if (item >= 0 && (qtd >= 0 || grades.length)) return { row: r, item, qtd, grades, manga: findColumn(row, ['MANGA']), tecido: multiLineColumn(rows, r, ['TECIDO', 'COMPOSICAO']), cor: findColumn(row, ['COR']) };
  }
  return null;
}

function parseItems(rawRows, shownRows) {
  const header = findItemHeader(shownRows);
  if (!header) return [];
  const items = []; let blanks = 0;
  for (let r = header.row + 1; r < shownRows.length; r++) {
    const shown = shownRows[r] || []; const raw = rawRows[r] || [];
    const item = clean(shown[header.item]);
    const footer = /^(OBS|OBSERVACAO|SUBTOTAL|SUB TOTAL|TOTAL GERAL|TOTAL PEDIDO|TOTAL R\$|TOTAL|FRETE|DESCONTO|CONDICAO|TRANSPORTADORA)$/.test(normalized(item).replace(/[:.]/g, ''));
    if (footer) break;
    let qtd = header.qtd >= 0 ? numberValue(raw[header.qtd]) || numberValue(shown[header.qtd]) : 0;
    if (!qtd) qtd = header.grades.reduce((sum, col) => sum + (numberValue(raw[col]) || numberValue(shown[col]) || 0), 0);
    if (item && qtd > 0) {
      blanks = 0;
      items.push({ item, manga: header.manga >= 0 ? clean(shown[header.manga]) : '', tecido: header.tecido >= 0 ? clean(shown[header.tecido]) : '', cor: header.cor >= 0 ? clean(shown[header.cor]) : '', qtd, ordemItem: items.length + 1, observacao: '' });
    } else if (++blanks >= 8 && items.length) break;
  }
  return items;
}

export function parseOrder(rawRows, shownRows, fileName = '') {
  if (!Array.isArray(shownRows) || !shownRows.length) throw new Error('A planilha não possui dados para análise.');
  const orderPosition = findLabel(shownRows, ['PEDIDO', 'N PEDIDO', 'NUMERO PEDIDO']);
  const orderCell = findAfter(rawRows, shownRows, orderPosition, 8, (raw, shown) => { const value = digits(shown || raw); return value.length >= 3 && value.length <= 10; });
  const numeroPedido = orderCell ? digits(orderCell.shown || orderCell.raw) : (String(fileName).match(/^\s*(\d{3,10})\b/)?.[1] || '');
  const datePosition = findLabel(shownRows, ['DATA', 'DATA PEDIDO', 'DATA EMISSAO', 'EMISSAO']);
  const dateCell = findAfter(rawRows, shownRows, datePosition, 8, (raw, shown) => Boolean(dateValue(raw, shown)));
  const date = dateCell ? dateValue(dateCell.raw, dateCell.shown) : null;
  const clientPosition = findLabel(shownRows, ['CLIENTE', 'RAZAO SOCIAL']);
  const clientCell = findAfter(rawRows, shownRows, clientPosition, 10, (raw, shown) => {
    const value = clean(shown || raw); const candidate = label(value);
    return value.length >= 3 && !/^\d+$/.test(value) && !['CLIENTE', 'ENDERECO', 'BAIRRO', 'CEP', 'CIDADE', 'CNPJ', 'CPF', 'IE', 'RG'].includes(candidate);
  });
  const cliente = clean(clientCell?.shown || clientCell?.raw);
  const termPosition = findLabel(shownRows, ['ENTREGA', 'PRAZO', 'PRAZO ENTREGA']);
  let termCell = findAfter(rawRows, shownRows, termPosition, 12, (raw, shown) => /\d/.test(clean(shown || raw)) && /DIA/.test(normalized(shown || raw)));
  if (!termCell) outer: for (const row of shownRows) for (const cell of row) if (/\d/.test(clean(cell)) && /DIA/.test(normalized(cell))) { termCell = { raw: cell, shown: cell }; break outer; }
  const prazoOriginal = clean(termCell?.shown || termCell?.raw);
  const terms = (prazoOriginal.match(/\d+/g) || []).map(Number).filter(value => value > 0 && value <= 1000);
  const prazoMin = terms.length ? Math.min(...terms) : 0; const prazoMax = terms.length ? Math.max(...terms) : 0;
  const itens = parseItems(rawRows, shownRows);
  const delivery = date && prazoMax ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + prazoMax) : null;
  const alertas = [];
  if (!numeroPedido) alertas.push('Número do pedido não identificado.');
  if (!date) alertas.push('Data de entrada não identificada.');
  if (!cliente) alertas.push('Cliente não identificado.');
  if (!prazoMax) alertas.push('Prazo de entrega não identificado.');
  if (!itens.length) alertas.push('Nenhum item foi identificado.');
  return { numeroPedido, dataEntrada: formatDate(date), cliente, prazoOriginal, prazoMin, prazoMax, dataEntrega: formatDate(delivery), itens, qtdItens: itens.length, qtdTotal: itens.reduce((sum, item) => sum + item.qtd, 0), alertas };
}
