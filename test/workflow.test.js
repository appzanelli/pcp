import test from 'node:test';
import assert from 'node:assert/strict';
import { dayDiff, validateStageDates, workflowSummary } from '../api/workflow.js';

test('calcula duração, lead time e gargalo com dias corridos', () => {
  const stages = [
    { etapa:'COMPRA TECIDO/RISCO', ordemEtapa:1, dataInicioISO:'2026-09-01', dataConclusaoISO:'2026-09-03', costuraExterna:false },
    { etapa:'ENFESTO/CORTE', ordemEtapa:2, dataInicioISO:'2026-09-03', dataConclusaoISO:'2026-09-04', costuraExterna:false },
    { etapa:'COSTURA', ordemEtapa:5, dataInicioISO:'2026-09-04', dataConclusaoISO:'2026-09-10', costuraExterna:true },
    { etapa:'EMBALAGEM', ordemEtapa:7, dataInicioISO:'2026-09-10', dataConclusaoISO:'2026-09-11', costuraExterna:false }
  ];
  const summary = workflowSummary(stages, '2026-09-11');
  assert.equal(summary.leadTimeDias, 10);
  assert.deepEqual(summary.gargalo, { etapa:'COSTURA', dias:6 });
  assert.equal(summary.etapas[3].costuraExterna, true);
});

test('bloqueia conclusão futura, mas aceita data retroativa válida', () => {
  assert.throws(() => validateStageDates('2026-09-01','2026-09-12','2026-09-11'), /não pode ser futura/);
  assert.doesNotThrow(() => validateStageDates('2026-08-20','2026-09-01','2026-09-11'));
  assert.throws(() => validateStageDates(null,'2026-09-01','2026-09-11'), /data de início/);
  assert.equal(dayDiff('2026-09-01','2026-09-01'), 0);
});
