export function todayISO(timeZone = 'America/Sao_Paulo', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isoDay(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(time);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? time : null;
}

export function dayDiff(start, end) {
  const startTime = isoDay(start); const endTime = isoDay(end);
  if (startTime === null || endTime === null) return null;
  return Math.max(0, Math.floor((endTime - startTime) / 86400000));
}

export function validateStageDates(start, end, today = todayISO()) {
  if (end && !start) throw new Error('Informe a data de início antes da conclusão.');
  if (end && end > today) throw new Error('A data de conclusão não pode ser futura.');
  if (start && end && end < start) throw new Error('A data de conclusão não pode ser anterior à data de início.');
}

export function workflowSummary(stages, today = todayISO()) {
  const externalOrder = stages.find(stage => stage.etapa === 'COSTURA' && stage.costuraExterna)?.ordemEtapa;
  const enriched = stages.map(stage => {
    const duration = stage.dataInicioISO ? dayDiff(stage.dataInicioISO, stage.dataConclusaoISO || today) : null;
    return {
      ...stage,
      costuraExterna: Boolean(externalOrder && Number(stage.ordemEtapa) >= Number(externalOrder)),
      diasNaEtapa: duration,
      diasEmAberto: duration ?? 0
    };
  });
  const measured = enriched.filter(stage => stage.diasNaEtapa !== null);
  const firstStart = measured.map(stage => stage.dataInicioISO).sort()[0] || null;
  const completed = enriched.length > 0 && enriched.every(stage => stage.dataConclusaoISO);
  const finalEnd = completed ? enriched.map(stage => stage.dataConclusaoISO).sort().at(-1) : today;
  const gargalo = measured.reduce((max, stage) => !max || stage.diasNaEtapa > max.diasNaEtapa ? stage : max, null);
  return {
    etapas: enriched,
    leadTimeDias: firstStart ? dayDiff(firstStart, finalEnd) : 0,
    somaEtapasDias: measured.reduce((sum, stage) => sum + stage.diasNaEtapa, 0),
    gargalo: gargalo ? { etapa: gargalo.etapa, dias: gargalo.diasNaEtapa } : null,
    costuraExterna: Boolean(externalOrder)
  };
}
