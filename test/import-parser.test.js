import test from 'node:test';
import assert from 'node:assert/strict';
import { financialClearRanges, normalizeGrade, parseOrder } from '../api/import-parser.js';

test('interpreta cabeçalho, grade e ignora campos financeiros', () => {
  const rows = [
    ['PEDIDO', '12345', '', 'DATA EMISSÃO', 45567],
    ['CLIENTE', 'Cliente Teste'],
    ['PRAZO ENTREGA', '30 / 45 DIAS'],
    ['ITEM', 'MANGA', 'TECIDO', 'COR', 'P', 'M', 'G', 'VALOR R$'],
    ['Camiseta Polo', 'CURTA', 'PIQUET', 'AZUL', 2, 3, 4, 'R$ 999,00'],
    ['TOTAL GERAL', '', '', '', '', '', 9, 'R$ 999,00']
  ];
  const result = parseOrder(rows, rows, 'pedido.xlsx');
  assert.equal(result.numeroPedido, '12345');
  assert.equal(result.cliente, 'Cliente Teste');
  assert.equal(result.dataEntrada, '02/10/2024');
  assert.equal(result.prazoMin, 30);
  assert.equal(result.prazoMax, 45);
  assert.equal(result.qtdTotal, 9);
  assert.deepEqual(result.itens[0], { item: 'Camiseta Polo', manga: 'CURTA', tecido: 'PIQUET', cor: 'AZUL', grade:{P:2,M:3,G:4}, qtd: 9, ordemItem: 1, observacao: '' });
  assert.equal(JSON.stringify(result).includes('999'), false);
});

test('identifica faixas financeiras para remoção antes do PDF', () => {
  const rows=[['ITEM','P','M','QUANT.','$ UNIT.','TOTAL'],['Polo',2,3,5,72,360]];
  assert.deepEqual(financialClearRanges(rows,rows,'pedido'),["'pedido'!E2:E2","'pedido'!F2:F2"]);
});

test('alerta quando número interno diverge do nome do arquivo',()=>{
  const rows=[['PEDIDO','6486'],['CLIENTE','Teste'],['DATA','10/09/2026'],['PRAZO','20 DIAS'],['ITEM','P','QTD','$ UNIT.'],['Polo',2,2,50]];
  const result=parseOrder(rows,rows,'6578 CLIENTE.xlsx');
  assert.match(result.alertas.join(' '),/6578.*6486/);
});

test('normaliza a grade recebida do navegador',()=>{
  assert.deepEqual(normalizeGrade({g:'40',' GG ':5,XGG:'10',invalido:-2}),{G:40,GG:5,XGG:10});
});

test('usa quantidade direta e aceita número no nome do arquivo', () => {
  const rows = [
    ['CLIENTE:', 'Indústria Zanelli'],
    ['DATA PEDIDO', '10/09/2026'],
    ['PRAZO', '20 DIAS'],
    ['DESCRIÇÃO', 'QUANTIDADE'],
    ['Jaleco', '12'],
    ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', '']
  ];
  const result = parseOrder(rows, rows, '98765 pedido.xlsx');
  assert.equal(result.numeroPedido, '98765');
  assert.equal(result.qtdTotal, 12);
  assert.equal(result.dataEntrega, '30/09/2026');
  assert.deepEqual(result.alertas, []);
});
