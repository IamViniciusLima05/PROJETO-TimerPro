/* TimerPro — Pomodoro configurável + cronômetro com voltas */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};
const dataISO = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const dois = (n) => String(n).padStart(2, '0');
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${dois(Math.floor(s / 60))}:${dois(s % 60)}`; };

const PADRAO = { foco: 25, curta: 5, longa: 15, ciclos: 4, auto: false, som: true, notif: false };
const config = { ...PADRAO, ...banco.ler('tp_config', {}) };
const historico = banco.ler('tp_historico', {});
const ROTULOS = { foco: 'Hora de focar', curta: 'Pausa curta', longa: 'Pausa longa' };
const CIRC = 628.3;

/* ---------- Pomodoro ---------- */
const pomo = { fase: 'foco', total: config.foco * 60000, restante: config.foco * 60000, rodando: false, fim: 0, feitos: 0, timer: null };

function duracao(fase) { return config[fase] * 60000; }

function mudarFase(fase, iniciar = false) {
  pararPomo();
  pomo.fase = fase;
  pomo.total = pomo.restante = duracao(fase);
  document.body.dataset.fase = fase;
  $$('.fases button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fase === fase));
  desenharPomo();
  if (iniciar) iniciarPomo();
}

function iniciarPomo() {
  if (pomo.rodando) return;
  pomo.rodando = true;
  pomo.fim = Date.now() + pomo.restante;
  pomo.timer = setInterval(tick, 200);
  pedirAudio();
  desenharPomo();
}
function pararPomo() {
  if (!pomo.rodando) return;
  pomo.restante = Math.max(0, pomo.fim - Date.now());
  pomo.rodando = false;
  clearInterval(pomo.timer);
  desenharPomo();
}
function tick() {
  pomo.restante = Math.max(0, pomo.fim - Date.now());
  if (pomo.restante <= 0) { concluirFase(); return; }
  desenharPomo();
}

function concluirFase() {
  clearInterval(pomo.timer);
  pomo.rodando = false;
  const terminou = pomo.fase;
  if (terminou === 'foco') {
    registrarSessao(config.foco);
    pomo.feitos++;
  }
  alertar(terminou);
  let proxima;
  if (terminou === 'foco') proxima = pomo.feitos % config.ciclos === 0 ? 'longa' : 'curta';
  else proxima = 'foco';
  document.body.classList.add('pulsar');
  setTimeout(() => document.body.classList.remove('pulsar'), 3000);
  mudarFase(proxima, config.auto);
}

function desenharPomo() {
  $('#tempo').textContent = mmss(pomo.restante);
  $('#anel').style.strokeDashoffset = CIRC * (1 - pomo.restante / pomo.total);
  $('#iniciar').textContent = pomo.rodando ? 'Pausar' : (pomo.restante < pomo.total ? 'Continuar' : 'Iniciar');
  $('#rotulo').textContent = pomo.rodando || pomo.restante < pomo.total ? ROTULOS[pomo.fase] : `${ROTULOS[pomo.fase]} · ${config[pomo.fase]} min`;
  if (estadoAba === 'pomodoro') document.title = pomo.rodando ? `${mmss(pomo.restante)} · ${pomo.fase === 'foco' ? 'Foco' : 'Pausa'} | TimerPro` : 'TimerPro | Pomodoro e cronômetro';
  // Bolinhas dos ciclos até a pausa longa
  const noCiclo = pomo.feitos % config.ciclos;
  $('#ciclos').innerHTML = Array.from({ length: config.ciclos }, (_, i) =>
    `<i class="${i < noCiclo ? 'feito' : ''} ${i === noCiclo && pomo.fase === 'foco' ? 'atual' : ''}"></i>`).join('');
  $('#ciclos').setAttribute('aria-label', `${noCiclo} de ${config.ciclos} ciclos até a pausa longa`);
}

/* Registro das sessões de foco concluídas */
function registrarSessao(min) {
  const hoje = dataISO();
  const dia = historico[hoje] ||= { pomos: 0, min: 0, sessoes: [] };
  dia.pomos++; dia.min += min;
  const agora = new Date();
  dia.sessoes.unshift({ tarefa: $('#tarefa').value.trim() || 'Sessão de foco', min, hora: `${dois(agora.getHours())}:${dois(agora.getMinutes())}` });
  banco.salvar('tp_historico', historico);
  desenharStats();
}
function sequencia() {
  let n = 0;
  const d = new Date();
  if (!historico[dataISO(d)]?.pomos) d.setDate(d.getDate() - 1); // hoje ainda pode entrar
  while (historico[dataISO(d)]?.pomos) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function desenharStats() {
  const dia = historico[dataISO()] || { pomos: 0, min: 0, sessoes: [] };
  $('#st-pomos').textContent = dia.pomos;
  $('#st-foco').textContent = dia.min >= 60 ? `${Math.floor(dia.min / 60)}h ${dois(dia.min % 60)}` : `${dia.min} min`;
  $('#st-seq').textContent = sequencia();
  $('#sessoes').innerHTML = dia.sessoes.length
    ? dia.sessoes.map((s) => `<li><span>${escapar(s.tarefa)}</span><span>${s.hora} · ${s.min} min</span></li>`).join('')
    : '<li class="vazio">Nenhum pomodoro concluído hoje.</li>';
}
let confirmarLimpar = false;
$('#limpar-hoje').addEventListener('click', (e) => {
  if (!confirmarLimpar) {
    confirmarLimpar = true; e.target.textContent = 'Confirmar?';
    setTimeout(() => { confirmarLimpar = false; e.target.textContent = 'Limpar'; }, 3000);
    return;
  }
  delete historico[dataISO()];
  banco.salvar('tp_historico', historico);
  confirmarLimpar = false; e.target.textContent = 'Limpar';
  desenharStats();
});

/* Som (Web Audio) e notificação */
let audio = null;
function pedirAudio() { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { /* sem áudio */ } }
function bip(freq, ini, dur) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, audio.currentTime + ini);
  g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + ini + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ini + dur);
  o.connect(g).connect(audio.destination);
  o.start(audio.currentTime + ini); o.stop(audio.currentTime + ini + dur + 0.05);
}
function alertar(fase) {
  if (config.som && audio) { try { [0, 0.25, 0.5].forEach((t, i) => bip(fase === 'foco' ? 880 : 660 - i * 80, t, 0.22)); } catch { /* ignora */ } }
  if (config.notif && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('TimerPro', { body: fase === 'foco' ? 'Foco concluído! Hora de uma pausa.' : 'Pausa encerrada. Bora focar!' }); } catch { /* ignora */ }
  }
}

$('#iniciar').addEventListener('click', () => (pomo.rodando ? pararPomo() : iniciarPomo()));
$('#reiniciar').addEventListener('click', () => mudarFase(pomo.fase));
$('#pular').addEventListener('click', () => {
  if (pomo.fase === 'foco') { pomo.feitos++; mudarFase(pomo.feitos % config.ciclos === 0 ? 'longa' : 'curta'); }
  else mudarFase('foco');
});
$$('.fases button').forEach((b) => b.addEventListener('click', () => mudarFase(b.dataset.fase)));
$('#tarefa').value = banco.ler('tp_tarefa', '');
$('#tarefa').addEventListener('input', (e) => banco.salvar('tp_tarefa', e.target.value));

/* Configurações */
const dlg = $('#config');
$('#abrir-config').addEventListener('click', () => {
  $('#c-foco').value = config.foco; $('#c-curta').value = config.curta; $('#c-longa').value = config.longa; $('#c-ciclos').value = config.ciclos;
  $('#c-auto').checked = config.auto; $('#c-som').checked = config.som; $('#c-notif').checked = config.notif;
  dlg.showModal();
});
$('#c-padrao').addEventListener('click', () => {
  $('#c-foco').value = PADRAO.foco; $('#c-curta').value = PADRAO.curta; $('#c-longa').value = PADRAO.longa; $('#c-ciclos').value = PADRAO.ciclos;
});
$('#c-notif').addEventListener('change', (e) => {
  if (e.target.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'salvar') return;
  const lim = (id, a, b) => Math.min(b, Math.max(a, Math.round(+$(id).value) || a));
  Object.assign(config, {
    foco: lim('#c-foco', 1, 120), curta: lim('#c-curta', 1, 60), longa: lim('#c-longa', 1, 90), ciclos: lim('#c-ciclos', 2, 10),
    auto: $('#c-auto').checked, som: $('#c-som').checked, notif: $('#c-notif').checked
  });
  banco.salvar('tp_config', config);
  if (!pomo.rodando) mudarFase(pomo.fase); else desenharPomo();
});

/* ---------- Cronômetro ---------- */
const crono = { rodando: false, inicio: 0, acumulado: 0, voltas: [], raf: 0 };
const tempoCrono = () => crono.acumulado + (crono.rodando ? performance.now() - crono.inicio : 0);
function formatarCrono(ms, html = true) {
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000);
  const base = `${h ? h + ':' : ''}${dois(m)}:${dois(s)}`;
  return html ? `${base}<small>,${dois(cs)}</small>` : `${base},${dois(cs)}`;
}
function quadro() {
  const t = tempoCrono();
  $('#crono').innerHTML = formatarCrono(t);
  $('#ponteiro').style.strokeDashoffset = -((t % 60000) / 60000) * CIRC;
  if (estadoAba === 'cronometro' && crono.rodando) document.title = `${formatarCrono(t, false).slice(0, -3)} | TimerPro`;
  if (crono.rodando) crono.raf = requestAnimationFrame(quadro);
}
function desenharCrono() {
  $('#crono-iniciar').textContent = crono.rodando ? 'Pausar' : (crono.acumulado ? 'Continuar' : 'Iniciar');
  $('#crono-volta').disabled = !crono.rodando;
  $('#crono-rotulo').textContent = crono.rodando ? 'Rodando' : (crono.acumulado ? 'Pausado' : 'Pronto');
  const v = crono.voltas;
  const duracoes = v.map((x) => x.volta);
  const min = Math.min(...duracoes), max = Math.max(...duracoes);
  $('#voltas').innerHTML = v.length
    ? v.map((x, i) => `<li class="${v.length > 2 && x.volta === min ? 'melhor' : ''} ${v.length > 2 && x.volta === max ? 'pior' : ''}"><span>Volta ${i + 1}</span><span>${formatarCrono(x.volta, false)} · ${formatarCrono(x.total, false)}</span></li>`).reverse().join('')
    : '<li class="vazio">Marque voltas enquanto o cronômetro roda.</li>';
  quadro();
}
$('#crono-iniciar').addEventListener('click', () => {
  if (crono.rodando) { crono.acumulado = tempoCrono(); crono.rodando = false; cancelAnimationFrame(crono.raf); }
  else { crono.inicio = performance.now(); crono.rodando = true; }
  desenharCrono();
});
$('#crono-volta').addEventListener('click', () => {
  const total = tempoCrono();
  const anterior = crono.voltas.at(-1)?.total || 0;
  crono.voltas.push({ total, volta: total - anterior });
  desenharCrono();
});
$('#crono-zerar').addEventListener('click', () => {
  cancelAnimationFrame(crono.raf);
  Object.assign(crono, { rodando: false, acumulado: 0, voltas: [] });
  document.title = 'TimerPro | Pomodoro e cronômetro';
  desenharCrono();
});

/* ---------- Abas e atalhos ---------- */
let estadoAba = 'pomodoro';
function trocarAba(aba) {
  estadoAba = aba;
  $('#aba-pomodoro').setAttribute('aria-selected', aba === 'pomodoro');
  $('#aba-cronometro').setAttribute('aria-selected', aba === 'cronometro');
  $('#painel-pomodoro').hidden = aba !== 'pomodoro';
  $('#painel-cronometro').hidden = aba !== 'cronometro';
  document.body.dataset.modo = aba === 'cronometro' ? 'crono' : '';
  $('#abrir-config').style.visibility = aba === 'pomodoro' ? 'visible' : 'hidden';
  desenharPomo(); desenharCrono();
}
$('#aba-pomodoro').addEventListener('click', () => trocarAba('pomodoro'));
$('#aba-cronometro').addEventListener('click', () => trocarAba('cronometro'));

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || dlg.open || e.ctrlKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); (estadoAba === 'pomodoro' ? $('#iniciar') : $('#crono-iniciar')).click(); }
  if (estadoAba === 'pomodoro' && k === 'r') $('#reiniciar').click();
  if (estadoAba === 'pomodoro' && k === 'n') $('#pular').click();
  if (estadoAba === 'cronometro' && k === 'v' && crono.rodando) $('#crono-volta').click();
});

mudarFase('foco');
desenharStats();
desenharCrono();
