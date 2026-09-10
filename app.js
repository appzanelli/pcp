let estado = {
    auth: null,
    usuario: null,
    permissoes: {},
    pedidos: [],
    pedidosCompleto: [],
    recentes: [],
    kanban: { colunas: [], cards: [] },
    etapas: [],
    gargalos: [],
    metricas: {},
    itensCache: {},
    excel: null,
    interpretado: null,
    itens: [],
    etapaRapida: null,
    paginaPedidos: 1,
    tamanhoPaginaPedidos: 25
  };

  document.addEventListener('DOMContentLoaded', function() {
  configurarLoginEventos();
  carregarSessaoLocal();

  if (!estado.auth) {
    mostrarLogin();
    return;
  }

  ocultarLogin();

  var local = lerEstadoLocal();
  if (local) {
    estado = Object.assign({}, estado, local, { auth: estado.auth });
    document.getElementById('versaoApp').textContent = 'Versão 6.0.0 - LOGIN ESTAVEL';
    renderizarTudo();
  }

  validarUsuarioECarregar(!local);
});


  function configurarLoginEventos() {
    var botao = document.getElementById('btnLogin');
    var senha = document.getElementById('loginSenha');
    var email = document.getElementById('loginEmail');

    if (botao) {
      botao.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        login();
        return false;
      });
      botao.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          login();
        }
      });
    }

    [email, senha].forEach(function(campo) {
      if (!campo) return;
      campo.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          login();
        }
      });
    });

    window.login = login;
  }

  function mostrarLogin() {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  function ocultarLogin() {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function carregarSessaoLocal() {
    try {
      localStorage.removeItem('ZANELLI_V60_AUTH');
      var raw = sessionStorage.getItem('ZANELLI_V70_AUTH');
      if (!raw) return;
      var sessao = JSON.parse(raw);
      if (!sessao.accessToken || Date.now() > Number(sessao.expiresAt || 0)) {
        sessionStorage.removeItem('ZANELLI_V70_AUTH');
        return;
      }
      estado.auth = sessao;
    } catch (e) {
      console.error(e);
      sessionStorage.removeItem('ZANELLI_V70_AUTH');
    }
  }

  function salvarSessaoLocal(sessao) {
    estado.auth = sessao;
    sessionStorage.setItem('ZANELLI_V70_AUTH', JSON.stringify(sessao));
  }

  var loginEmAndamento = false;

  function login() {
    if (loginEmAndamento) return;

    var emailInput = document.getElementById('loginEmail');
    var senhaInput = document.getElementById('loginSenha');
    var msg = document.getElementById('loginMsg');
    var botao = document.getElementById('btnLogin');

    var email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    var senha = senhaInput ? senhaInput.value : '';

    if (msg) msg.textContent = '';

    if (!email || !senha) {
      if (msg) msg.textContent = 'Informe e-mail e senha.';
      return;
    }

    loginEmAndamento = true;
    if (botao) {
      botao.classList.add('disabled');
      botao.textContent = 'Entrando...';
    }
    exibirLoading('Entrando no sistema...');

    google.script.run
      .withSuccessHandler(function(resposta) {
        loginEmAndamento = false;
        ocultarLoading();
        if (botao) {
          botao.classList.remove('disabled');
          botao.textContent = 'Entrar';
        }

        if (!resposta || !resposta.accessToken) {
          if (msg) msg.textContent = 'Login não retornou sessão válida.';
          return;
        }

        salvarSessaoLocal({
          accessToken: resposta.accessToken,
          refreshToken: resposta.refreshToken || '',
          expiresAt: Date.now() + Number(resposta.expiresIn || 3600) * 1000 - 60000,
          email: email
        });

        estado.usuario = resposta.usuario;
        estado.permissoes = resposta.permissoes || {};
        ocultarLogin();
        atualizarInterfacePermissoes();
        carregarSistema(true);
      })
      .withFailureHandler(function(erro) {
        loginEmAndamento = false;
        ocultarLoading();
        if (botao) {
          botao.classList.remove('disabled');
          botao.textContent = 'Entrar';
        }
        var mensagem = erro && erro.message ? erro.message : String(erro);
        if (msg) msg.textContent = mensagem || 'Falha ao entrar.';
        console.error(erro);
      })
      .loginSupabaseSistema({ email: email, senha: senha });
  }

  function logout() {
    estado.auth = null;
    estado.usuario = null;
    estado.permissoes = {};
    sessionStorage.removeItem('ZANELLI_V70_AUTH');
    sessionStorage.removeItem('ZANELLI_V70_SUPABASE_ESTADO');
    localStorage.removeItem('ZANELLI_V60_AUTH');
    localStorage.removeItem('ZANELLI_V70_SUPABASE_ESTADO');
    localStorage.removeItem('ZANELLI_V42_SUPABASE_ESTADO');
    mostrarLogin();
  }

  function authPayload(extra) {
    return {
      ...(extra || {}),
      auth: {
        accessToken: estado.auth && estado.auth.accessToken
      }
    };
  }

  function pode(permissao) {
    return Boolean(estado.permissoes && estado.permissoes[permissao]);
  }

  function atualizarInterfacePermissoes() {
    var userBox = document.getElementById('userBox');
    if (userBox) userBox.classList.remove('hidden');
    var nome = document.getElementById('userNome');
    var perfil = document.getElementById('userPerfil');
    if (nome) nome.textContent = (estado.usuario && estado.usuario.nome) || (estado.auth && estado.auth.email) || '';
    if (perfil) perfil.textContent = (estado.usuario && estado.usuario.perfil) || '';
    var menuAdmin = document.getElementById('menuAdmin');
    if (menuAdmin) menuAdmin.classList.toggle('hidden', !pode('GERENCIAR_USUARIOS'));

    var menuImport = document.getElementById('menuImportacao');
    if (menuImport) menuImport.classList.toggle('hidden', !pode('IMPORTAR_PEDIDO'));
    var btnImportarTopo = document.getElementById('btnImportarTopo');
    if (btnImportarTopo) btnImportarTopo.classList.toggle('hidden', !pode('IMPORTAR_PEDIDO'));
  }

  function validarUsuarioECarregar(mostrarLoad) {
    if (mostrarLoad) exibirLoading('Validando usuário...');
    google.script.run
      .withSuccessHandler(function(resposta) {
        estado.usuario = resposta.usuario;
        estado.permissoes = resposta.permissoes || {};
        atualizarInterfacePermissoes();
        carregarSistema(mostrarLoad);
      })
      .withFailureHandler(function(erro) {
        ocultarLoading();
        logout();
        var msg = document.getElementById('loginMsg');
        if (msg) msg.textContent = erro && erro.message ? erro.message : String(erro);
      })
      .obterUsuarioLogado({ accessToken: estado.auth.accessToken });
  }

  function carregarSistema(mostrarLoad) {
    if (!estado.auth) { mostrarLogin(); return; }
    if (mostrarLoad) {
      exibirLoading('Carregando dados do Supabase...');
    }

    google.script.run
      .withSuccessHandler(dados => {
        estado.pedidosCompleto = dados.pedidos || [];
        estado.pedidos = dados.pedidos || [];
        estado.recentes = dados.recentes || (dados.pedidos || []).slice(0, 6);
        estado.kanban = dados.kanban || { colunas: [], cards: [] };
        estado.etapas = dados.etapas || [];
        estado.metricas = dados.metricas || {};
        estado.gargalos = dados.gargalos || [];
        if (dados.usuario) estado.usuario = dados.usuario;
        if (dados.permissoes) estado.permissoes = dados.permissoes;

        document.getElementById('versaoApp').textContent = 'Versão ' + (dados.version || '6.0.0');

        renderizarTudo();
        atualizarInterfacePermissoes();
        salvarEstadoLocal();

        if (mostrarLoad) {
          ocultarLoading();
        }
      })
      .withFailureHandler(erro => {
        if (mostrarLoad) {
          tratarErro(erro);
        } else {
          mostrarToast('Não consegui sincronizar agora. Usando dados locais, se disponíveis.');
        }
      })
      .obterDadosIniciais(authPayload());
  }

  function renderizarTudo() {
    renderizarMetricas(estado.metricas || {});
    renderizarRecentes();
    renderizarGargalos();
    renderizarKanban();
    renderizarPedidosCompleto();
  }

  function mostrarTela(tela) {
    ['Dashboard', 'Kanban', 'Pedidos', 'Importacao', 'Admin'].forEach(nome => {
      const section = document.getElementById(`tela${nome}`);
      const menu = document.getElementById(`menu${nome}`);

      if (section) section.classList.add('hidden');
      if (menu) menu.classList.remove('active');
    });

    const mapa = {
      dashboard: ['telaDashboard', 'menuDashboard', 'Central de Pedidos'],
      kanban: ['telaKanban', 'menuKanban', 'Kanban de Produção'],
      pedidos: ['telaPedidos', 'menuPedidos', 'Pedidos'],
      importacao: ['telaImportacao', 'menuImportacao', 'Importação de Pedido'],
      admin: ['telaAdmin', 'menuAdmin', 'Administração']
    };

    const alvo = mapa[tela] || mapa.dashboard;

    document.getElementById(alvo[0]).classList.remove('hidden');
    document.getElementById(alvo[1]).classList.add('active');
    document.getElementById('tituloTela').textContent = alvo[2];

    if (tela === 'kanban') {
      renderizarKanban();
    }

    if (tela === 'pedidos') {
      renderizarPedidosCompleto();
    }

    if (tela === 'admin') {
      carregarUsuarios();
    }
  }

  function testarConexao() {
    exibirLoading('Testando conexão com Supabase...');

    google.script.run
      .withSuccessHandler(resposta => {
        ocultarLoading();
        mostrarToast(resposta.mensagem || 'Conexão OK.');
      })
      .withFailureHandler(tratarErro)
      .testeConexaoSupabase(authPayload());
  }

  function abrirImportacao() {
    if (!pode('IMPORTAR_PEDIDO')) { mostrarToast('Você não tem permissão para importar pedidos.'); return; }
    limparImportacao();
    mostrarTela('importacao');
  }

  function limparImportacao() {
    estado.excel = null;
    estado.interpretado = null;
    estado.itens = [];

    document.getElementById('arquivoExcel').value = '';
    document.getElementById('arquivoSelecionado').classList.add('hidden');
    document.getElementById('btnAnalisar').disabled = true;
    document.getElementById('etapaUpload').classList.remove('hidden');
    document.getElementById('etapaConferencia').classList.add('hidden');
  }

  function selecionarExcel(event) {
    const arquivo = event.target.files[0];
    const card = document.getElementById('arquivoSelecionado');

    if (!arquivo) {
      estado.excel = null;
      card.classList.add('hidden');
      document.getElementById('btnAnalisar').disabled = true;
      return;
    }

    const extensao = arquivo.name.split('.').pop().toLowerCase();

    if (!['xls', 'xlsx'].includes(extensao)) {
      mostrarToast('Selecione um arquivo XLS ou XLSX.');
      event.target.value = '';
      return;
    }

    estado.excel = arquivo;
    card.innerHTML = `<strong>${escapeHtml(arquivo.name)}</strong><br><small>${formatarBytes(arquivo.size)}</small>`;
    card.classList.remove('hidden');
    document.getElementById('btnAnalisar').disabled = false;
  }

  async function analisarPedido() {
    if (!estado.excel) return;

    try {
      exibirLoading('Lendo grades, removendo valores e gerando o PDF visual...');

      const base64 = await arquivoParaBase64(estado.excel);

      google.script.run
        .withSuccessHandler(dados => {
          estado.interpretado = dados;
          estado.itens = (dados.itens || []).map(item => ({ ...item }));

          preencherConferencia(dados);

          document.getElementById('etapaUpload').classList.add('hidden');
          document.getElementById('etapaConferencia').classList.remove('hidden');

          ocultarLoading();
        })
        .withFailureHandler(tratarErro)
        .analisarArquivoExcel(authPayload({
          nomeArquivo: estado.excel.name,
          mimeType: estado.excel.type || 'application/vnd.ms-excel',
          base64
        }));

    } catch (erro) {
      tratarErro(erro);
    }
  }

  function preencherConferencia(dados) {
    setValor('numeroPedido', dados.numeroPedido || '');
    setValor('dataEntrada', dados.dataEntrada || '');
    setValor('cliente', dados.cliente || '');
    setValor('prazoOriginal', dados.prazoOriginal || '');
    setValor('prazoMax', dados.prazoMax || '');
    setValor('dataEntrega', dados.dataEntrega || '');

    const alertas = dados.alertas || [];

    document.getElementById('alertasInterpretacao').innerHTML = alertas.length
      ? `<div class="alert"><strong>Atenção:</strong><br>${alertas.map(escapeHtml).join('<br>')}</div>`
      : '';

    document.getElementById('statusPdfAutomatico').innerHTML = dados.pdfGerado
      ? `<strong>PDF visual sanitizado gerado.</strong><br>Imagens e observações preservadas; valores financeiros removidos.<br>${escapeHtml(dados.nomePdfGerado || '')}`
      : `<strong>PDF automático não gerado.</strong>`;

    renderizarItens();
  }

  function renderizarItens() {
    const lista = document.getElementById('listaItens');

    if (!estado.itens.length) {
      lista.innerHTML = `<div class="empty-state">Nenhum item identificado. Use "Adicionar item".</div>`;
      atualizarResumoItens();
      return;
    }

    lista.innerHTML = estado.itens.map((item, index) => `
      <div class="item-card">
        ${campoItem('Item', `item_${index}`, item.item)}
        ${campoItem('Manga', `manga_${index}`, item.manga)}
        ${campoItem('Tecido', `tecido_${index}`, item.tecido)}
        ${campoItem('Cor', `cor_${index}`, item.cor)}
        <label>
          <span>Qtd.</span>
          <input id="qtd_${index}" class="input" type="number" min="0" value="${Number(item.qtd || 0)}" oninput="atualizarItem(${index}, 'qtd', this.value)" ${Object.keys(item.grade || {}).length ? 'readonly title="Quantidade calculada pela grade"' : ''}>
        </label>
        <button class="btn btn-danger" onclick="removerItem(${index})">Excluir</button>
        ${renderizarEditorGrade(item, index)}
      </div>
    `).join('');

    atualizarResumoItens();
  }

  function entradasGrade(grade) {
    const ordem = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EXG', 'G1', 'G2', 'G3', 'G4'];
    return Object.entries(grade || {}).sort(([a], [b]) => {
      const ia = ordem.indexOf(a); const ib = ordem.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'pt-BR', { numeric: true });
    });
  }

  function renderizarEditorGrade(item, index) {
    const grade = item.grade || {};
    const tamanhos = Object.keys(grade).length ? entradasGrade(grade) : [];
    return `<details class="grade-editor" ${tamanhos.length ? 'open' : ''}>
      <summary>Grade de tamanhos <strong>${tamanhos.length ? `${tamanhos.length} tamanhos` : 'não informada'}</strong></summary>
      <div class="grade-inputs">
        ${tamanhos.map(([tamanho, quantidade]) => `<label><span>${escapeHtml(tamanho)}</span><input class="input" type="number" min="0" value="${Number(quantidade || 0)}" oninput="atualizarGrade(${index}, decodeURIComponent('${encodeInlineArg(tamanho)}'), this.value)"></label>`).join('')}
        <div class="grade-add"><input id="novoTamanho_${index}" class="input" type="text" maxlength="8" placeholder="Ex.: G2"><button class="btn btn-light" onclick="adicionarTamanhoGrade(${index})">Adicionar tamanho</button></div>
      </div>
    </details>`;
  }

  function atualizarGrade(index, tamanho, valor) {
    const item = estado.itens[index]; if (!item) return;
    item.grade = item.grade || {};
    item.grade[tamanho] = Math.max(0, Number(valor || 0));
    item.qtd = Object.values(item.grade).reduce((soma, qtd) => soma + Number(qtd || 0), 0);
    const campoQtd = document.getElementById(`qtd_${index}`); if (campoQtd) campoQtd.value = item.qtd;
    atualizarResumoItens();
  }

  function adicionarTamanhoGrade(index) {
    const campo = document.getElementById(`novoTamanho_${index}`);
    const tamanho = String(campo?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!tamanho) { mostrarToast('Informe um tamanho válido.'); return; }
    estado.itens[index].grade = estado.itens[index].grade || {};
    if (!(tamanho in estado.itens[index].grade)) estado.itens[index].grade[tamanho] = 0;
    renderizarItens();
  }

  function campoItem(rotulo, id, valor) {
    const partes = id.split('_');
    const index = partes.pop();
    const campo = partes.join('_');

    return `
      <label>
        <span>${rotulo}</span>
        <input class="input" type="text" value="${escapeHtml(valor || '')}" oninput="atualizarItem(${index}, '${campo}', this.value)">
      </label>
    `;
  }

  function atualizarItem(index, campo, valor) {
    if (!estado.itens[index]) return;

    estado.itens[index][campo] = campo === 'qtd'
      ? Number(valor || 0)
      : valor;

    atualizarResumoItens();
  }

  function adicionarItem() {
    estado.itens.push({
      item: '',
      manga: '',
      tecido: '',
      cor: '',
      grade: {},
      qtd: 0,
      observacao: ''
    });

    renderizarItens();
  }

  function removerItem(index) {
    estado.itens.splice(index, 1);
    renderizarItens();
  }

  function atualizarResumoItens() {
    const total = estado.itens.reduce((soma, item) => soma + Number(item.qtd || 0), 0);

    document.getElementById('qtdItensResumo').textContent = estado.itens.length.toLocaleString('pt-BR');
    document.getElementById('qtdTotalResumo').textContent = total.toLocaleString('pt-BR');
  }

  function recalcularPrazoManual() {
    const prazos = extrairPrazosTexto(document.getElementById('prazoOriginal').value);

    if (!prazos.length) return;

    setValor('prazoMax', Math.max(...prazos));
    recalcularDataEntrega();
  }

  function recalcularDataEntrega() {
    const dataTexto = document.getElementById('dataEntrada').value;
    const prazoMax = Number(document.getElementById('prazoMax').value || 0);
    const data = parseDataBR(dataTexto);

    if (!data || !prazoMax) {
      setValor('dataEntrega', '');
      return;
    }

    data.setHours(12, 0, 0, 0);
    data.setDate(data.getDate() + prazoMax);
    setValor('dataEntrega', formatarDataBR(data));
  }

  async function confirmarImportacao(atualizarExistente) {
    try {
      exibirLoading('Salvando pedido no Supabase...');

      const prazoOriginal = document.getElementById('prazoOriginal').value.trim();
      const prazos = extrairPrazosTexto(prazoOriginal);
      const prazoMax = Number(document.getElementById('prazoMax').value || 0);

      const payload = {
        numeroPedido: document.getElementById('numeroPedido').value.trim(),
        dataEntrada: document.getElementById('dataEntrada').value.trim(),
        cliente: document.getElementById('cliente').value.trim(),
        prazoOriginal,
        prazoMin: prazos.length ? Math.min(...prazos) : prazoMax,
        prazoMax,
        itens: estado.itens.map((item, index) => ({ ...item, ordemItem: index + 1 })),
        nomeArquivo: estado.excel.name,
        tempPdfId: estado.interpretado.tempPdfId,
        nomePdfGerado: estado.interpretado.nomePdfGerado,
        atualizarExistente
      };

      payload.auth = authPayload().auth;

      google.script.run
        .withSuccessHandler(resposta => {
          if (resposta.duplicado) {
            ocultarLoading();

            const confirmar = window.confirm(`${resposta.mensagem}\n\nDeseja atualizar o pedido existente?`);

            if (confirmar) {
              confirmarImportacao(true);
            }

            return;
          }

          aplicarDadosSistema(resposta);
          ocultarLoading();
          mostrarToast(resposta.mensagem || 'Pedido salvo com sucesso.');
          mostrarTela('kanban');
          limparImportacao();
        })
        .withFailureHandler(tratarErro)
        .salvarPedido(payload);

    } catch (erro) {
      tratarErro(erro);
    }
  }

  function voltarUpload() {
    document.getElementById('etapaConferencia').classList.add('hidden');
    document.getElementById('etapaUpload').classList.remove('hidden');
  }

  function aplicarDadosSistema(dados) {
    estado.pedidosCompleto = dados.pedidos || [];
    estado.pedidos = dados.pedidos || [];
    estado.recentes = dados.recentes || (dados.pedidos || []).slice(0, 6);
    estado.kanban = dados.kanban || { colunas: [], cards: [] };
    estado.etapas = dados.etapas || estado.etapas || [];
    estado.metricas = dados.metricas || {};
    estado.gargalos = dados.gargalos || [];
        if (dados.usuario) estado.usuario = dados.usuario;
        if (dados.permissoes) estado.permissoes = dados.permissoes;

    renderizarTudo();
    atualizarInterfacePermissoes();
    salvarEstadoLocal();
  }

  function renderizarMetricas(metricas) {
    document.getElementById('mTotalPedidos').textContent = Number(metricas.totalPedidos || 0).toLocaleString('pt-BR');
    document.getElementById('mQtdTotal').textContent = Number(metricas.qtdTotal || 0).toLocaleString('pt-BR');
    document.getElementById('mAtrasados').textContent = Number(metricas.atrasados || 0).toLocaleString('pt-BR');
    document.getElementById('mParados').textContent = Number(metricas.pedidosParados || 0).toLocaleString('pt-BR');
  }

  function renderizarRecentes() {
    const corpo = document.getElementById('tabelaRecentes');

    if (!estado.recentes.length) {
      corpo.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum pedido cadastrado.</td></tr>`;
      return;
    }

    corpo.innerHTML = estado.recentes.map(pedido => `
      <tr>
        <td><a class="link-anexo" href="javascript:void(0)" onclick="abrirEtapaAtual(decodeURIComponent('${encodeInlineArg(pedido.numeroPedido)}'))">${escapeHtml(pedido.numeroPedido)}</a>${numeroCorteHtml(pedido.numeroCorte)}</td>
        <td>${escapeHtml(pedido.cliente || '')}</td>
        <td>${escapeHtml(pedido.dataEntrega || '')}</td>
        <td>${Number(pedido.qtdTotal || 0).toLocaleString('pt-BR')}</td>
        <td>${statusPedidoHtml(pedido)}</td>
      </tr>
    `).join('');
  }

  function renderizarPedidosCompleto() {
    const corpo = document.getElementById('tabelaPedidosCompleto');
    const termo = (document.getElementById('buscaPedidosCompleto')?.value || '').trim().toLowerCase();
    const filtro = document.getElementById('filtroPedidos')?.value || 'todos';

    let pedidos = estado.pedidosCompleto || [];

    if (termo) {
      pedidos = pedidos.filter(pedido =>
        String(pedido.numeroPedido || '').toLowerCase().includes(termo) ||
        String(pedido.numeroCorte || '').toLowerCase().includes(termo) ||
        String(pedido.cliente || '').toLowerCase().includes(termo)
      );
    }

    pedidos = pedidos.filter(pedido => filtrarPedidoLista_(pedido, filtro));
    const totalPaginas = Math.max(1, Math.ceil(pedidos.length / estado.tamanhoPaginaPedidos));
    estado.paginaPedidos = Math.min(Math.max(1, estado.paginaPedidos), totalPaginas);
    const inicioPagina = (estado.paginaPedidos - 1) * estado.tamanhoPaginaPedidos;
    const pedidosPagina = pedidos.slice(inicioPagina, inicioPagina + estado.tamanhoPaginaPedidos);
    renderizarPaginacaoPedidos(pedidos.length, totalPaginas);

    if (!pedidos.length) {
      corpo.innerHTML = `<tr><td colspan="10" class="empty-state">Nenhum pedido encontrado.</td></tr>`;
      return;
    }

    corpo.innerHTML = pedidosPagina.map(pedido => `
      <tr>
        <td><a class="link-anexo" href="javascript:void(0)" onclick="abrirEtapaAtual(decodeURIComponent('${encodeInlineArg(pedido.numeroPedido)}'))">${escapeHtml(pedido.numeroPedido)}</a>${numeroCorteHtml(pedido.numeroCorte)}</td>
        <td>${escapeHtml(pedido.cliente || '')}</td>
        <td>${escapeHtml(pedido.dataEntrada || '')}</td>
        <td>${escapeHtml(pedido.dataEntrega || '')}</td>
        <td>${escapeHtml(pedido.prazoOriginal || '')}</td>
        <td>${Number(pedido.qtdTotal || 0).toLocaleString('pt-BR')}</td>
        <td><span class="status status-info">${escapeHtml(pedido.etapaAtual || '')}</span></td>
        <td>${pedido.etapaAtual === 'CONCLUÍDO' ? 'Concluído' : formatarDiasEntrega(pedido.diasParaEntrega)}</td>
        <td>${Number(pedido.diasParado || 0)} dias</td>
        <td>
          <div class="acao-inline">
            ${urlSegura(pedido.linkPdf) ? `<a class="link-anexo" href="${escapeAttr(urlSegura(pedido.linkPdf))}" target="_blank" rel="noopener noreferrer">PDF</a>` : ''}
            ${pode('EDITAR_PEDIDO') ? `<a class="link-anexo" href="javascript:void(0)" onclick="abrirModalEditarPedido(decodeURIComponent('${encodeInlineArg(pedido.numeroPedido)}'))">Editar</a>` : ''}
            ${pode('APAGAR_PEDIDO') ? `<a class="link-anexo danger-link" href="javascript:void(0)" onclick="apagarPedido(decodeURIComponent('${encodeInlineArg(pedido.numeroPedido)}'))">Apagar</a>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderizarPaginacaoPedidos(total, totalPaginas) {
    const el = document.getElementById('paginacaoPedidos');
    if (!el) return;
    el.innerHTML = `
      <button class="btn btn-light" onclick="mudarPaginaPedidos(-1)" ${estado.paginaPedidos <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${estado.paginaPedidos} de ${totalPaginas} — ${total} pedidos</span>
      <button class="btn btn-light" onclick="mudarPaginaPedidos(1)" ${estado.paginaPedidos >= totalPaginas ? 'disabled' : ''}>Próxima</button>
    `;
  }

  function mudarPaginaPedidos(delta) {
    estado.paginaPedidos = Math.max(1, estado.paginaPedidos + Number(delta || 0));
    renderizarPedidosCompleto();
  }

  function reiniciarPaginacaoPedidos() {
    estado.paginaPedidos = 1;
    renderizarPedidosCompleto();
  }

  function filtrarPedidoLista_(pedido, filtro) {
    const dias = pedido.diasParaEntrega === '' ? null : Number(pedido.diasParaEntrega);

    if (filtro === 'atrasados') return pedido.etapaAtual !== 'CONCLUÍDO' && dias !== null && dias < 0;
    if (filtro === 'proximos7') return pedido.etapaAtual !== 'CONCLUÍDO' && dias !== null && dias >= 0 && dias <= 7;
    if (filtro === 'proximos30') return pedido.etapaAtual !== 'CONCLUÍDO' && dias !== null && dias >= 0 && dias <= 30;
    if (filtro === 'parados') return pedido.etapaAtual !== 'CONCLUÍDO' && Number(pedido.diasParado || 0) >= 3;
    if (filtro === 'concluidos') return String(pedido.etapaAtual || '') === 'CONCLUÍDO';

    return true;
  }

  function renderizarKanban() {
    const board = document.getElementById('kanbanBoard');
    const termo = (document.getElementById('buscaKanban')?.value || '').trim().toLowerCase();
    const colunas = estado.kanban.colunas || [];

    if (!colunas.length) {
      board.innerHTML = `<div class="empty-state">Nenhum pedido no Kanban.</div>`;
      return;
    }

    board.innerHTML = colunas.map(coluna => {
      const cards = (coluna.cards || []).filter(card => {
        if (!termo) return true;

        return (
          String(card.numeroPedido || '').toLowerCase().includes(termo) ||
          String(card.numeroCorte || '').toLowerCase().includes(termo) ||
          String(card.cliente || '').toLowerCase().includes(termo)
        );
      });

      return `
        <div class="kanban-col">
          <div class="kanban-col-header">
            <div class="kanban-col-title">
              <span>${escapeHtml(coluna.etapa)}</span>
              <span>${cards.length}</span>
            </div>
          </div>

          <div class="kanban-col-body">
            ${cards.length ? cards.map(renderizarCardKanban).join('') : '<div class="empty-state">Sem pedidos</div>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderizarCardKanban(card) {
    const classe = card.cor === 'danger'
      ? 'card-danger'
      : card.cor === 'warning'
        ? 'card-warning'
        : '';

    return `
      <article class="kanban-card ${classe}" onclick="abrirEtapaAtual(decodeURIComponent('${encodeInlineArg(card.numeroPedido)}'))">
        <h4>Pedido ${escapeHtml(card.numeroPedido)}</h4>
        ${numeroCorteHtml(card.numeroCorte)}
        ${card.costuraExterna ? '<span class="costura-externa-flag">COSTURA EXTERNA</span>' : ''}
        <p>${escapeHtml(card.cliente)}</p>

        <div class="kanban-meta">
          <div><span>Qtd.</span><strong>${Number(card.qtdTotal || 0).toLocaleString('pt-BR')}</strong></div>
          <div><span>Entrega</span><strong>${escapeHtml(card.dataEntrega || '')}</strong></div>
          <div><span>Prazo</span><strong>${card.etapaAtual === 'CONCLUÍDO' ? 'Concluído' : escapeHtml(formatarDiasEntrega(card.diasParaEntrega))}</strong></div>
          <div><span>Parado</span><strong>${Number(card.diasParado || 0)} dias</strong></div>
        </div>

        ${card.responsavelAtual ? `<p style="margin-top:10px">Resp.: ${escapeHtml(card.responsavelAtual)}</p>` : ''}
      </article>
    `;
  }

  function renderizarGargalos() {
    const lista = document.getElementById('listaGargalos');
    const gargalos = estado.gargalos || [];
    const maior = Math.max(1, ...gargalos.map(item => Number(item.quantidade || 0)));

    lista.innerHTML = gargalos.map(item => `
      <div class="gargalo-item">
        <div class="gargalo-line">
          <strong>${escapeHtml(item.etapa)}</strong>
          <span>${Number(item.quantidade || 0)} pedidos</span>
        </div>

        <div class="gargalo-bar">
          <span style="width:${Math.min(100, Number(item.quantidade || 0) / maior * 100)}%"></span>
        </div>

        <div class="gargalo-line" style="margin-top:8px;color:#728078">
          <span>Parados: ${Number(item.parados || 0)}</span>
          <span>Atrasados: ${Number(item.atrasados || 0)}</span>
        </div>
      </div>
    `).join('');
  }

  function abrirEtapaAtual(numeroPedido) {
    const card = encontrarCard(numeroPedido);

    if (card && card.etapaAtual === 'CONCLUÍDO') {
      abrirDetalheCompleto(numeroPedido);
      return;
    }

    if (card && card.idEtapaDbAtual) {
      renderizarModalEtapaRapida({
        pedido: encontrarPedido(numeroPedido) || {
          numeroPedido: card.numeroPedido,
          cliente: card.cliente,
          dataEntrega: card.dataEntrega,
          qtdTotal: card.qtdTotal
        },
        etapa: {
          id: card.idEtapaDbAtual,
          idEtapa: card.idEtapaAtual,
          numeroPedido: card.numeroPedido,
          etapa: card.etapaAtual,
          ordemEtapa: card.ordemEtapaAtual,
          dataInicio: card.dataInicioAtual || '',
          dataConclusao: card.dataConclusaoAtual || '',
          responsavel: card.responsavelAtual || '',
          observacao: card.observacaoAtual || '',
          statusEtapa: card.statusEtapaAtual || '',
          diasEmAberto: card.diasParado || 0,
          costuraExterna: Boolean(card.costuraExterna)
        },
        card
      });

      return;
    }

    exibirLoading('Carregando etapa atual...');

    google.script.run
      .withSuccessHandler(dados => {
        ocultarLoading();
        if (!dados.etapa && dados.card && dados.card.etapaAtual === 'CONCLUÍDO') {
          abrirDetalheCompleto(numeroPedido);
          return;
        }
        renderizarModalEtapaRapida(dados);
      })
      .withFailureHandler(tratarErro)
      .obterEtapaAtualPedidoRapido(authPayload({ numeroPedido: numeroPedido }));
  }

  function encontrarCard(numeroPedido) {
    return (estado.kanban.cards || []).find(card => String(card.numeroPedido) === String(numeroPedido));
  }

  function encontrarPedido(numeroPedido) {
    return (estado.pedidosCompleto || []).find(pedido => String(pedido.numeroPedido) === String(numeroPedido)) ||
      (estado.pedidos || []).find(pedido => String(pedido.numeroPedido) === String(numeroPedido));
  }

  function fecharModalEtapaRapida() {
    document.getElementById('modalEtapaRapida').classList.add('hidden');
  }

  function renderizarModalEtapaRapida(dados) {
    estado.etapaRapida = dados;

    const pedido = dados.pedido;
    const etapa = dados.etapa;
    const podeEditarEtapaAtual = pode('EDITAR_ETAPA') && (Number(etapa?.ordemEtapa || 0) !== 1 || estado.usuario?.perfil === 'ADMIN');

    document.getElementById('modalEtapaTitulo').textContent =
      `Pedido ${pedido.numeroPedido} — ${pedido.cliente}`;

    if (!etapa) {
      document.getElementById('modalEtapaConteudo').innerHTML =
        `<div class="alert">${escapeHtml(dados.mensagem || 'Etapa não encontrada.')}</div>`;

      document.getElementById('modalEtapaRapida').classList.remove('hidden');
      return;
    }

    const labelResponsavel = 'Responsável';

    document.getElementById('modalEtapaConteudo').innerHTML = `
      <div class="quick-summary">
          <p><strong>Etapa atual:</strong> ${escapeHtml(etapa.etapa)}</p>
          ${numeroCorteHtml(pedido.numeroCorte)}
        <p><strong>Entrega:</strong> ${escapeHtml(pedido.dataEntrega || '')} | <strong>Qtd.:</strong> ${Number(pedido.qtdTotal || 0).toLocaleString('pt-BR')}</p>
        <p><strong>Status:</strong> ${escapeHtml(etapa.statusEtapa || '')} | <strong>Dias em aberto:</strong> ${Number(etapa.diasEmAberto || 0)}</p>
        ${dados.card?.costuraExterna || etapa.costuraExterna ? '<span class="costura-externa-flag">COSTURA EXTERNA</span>' : ''}
      </div>

      <div class="quick-form">
        <div class="quick-form-grid">
          <label>
            <span>Data início</span>
            <input id="rapidoInicio" class="input" type="text" placeholder="dd/mm/aaaa" value="${escapeHtml(etapa.dataInicio || '')}" ${podeEditarEtapaAtual ? '' : 'disabled'}>
          </label>

          <label>
            <span>Data conclusão</span>
            <input id="rapidoConclusao" class="input" type="text" placeholder="dd/mm/aaaa" value="${escapeHtml(etapa.dataConclusao || '')}" ${podeEditarEtapaAtual ? '' : 'disabled'}>
          </label>
        </div>

        ${Number(etapa.ordemEtapa) === 1 ? `<label><span>Nº CORTE</span><input id="rapidoNumeroCorte" class="input" type="text" value="${escapeHtml(pedido.numeroCorte || '')}" ${podeEditarEtapaAtual ? '' : 'disabled'}></label>` : ''}
        ${etapa.etapa === 'COSTURA' ? `<label class="check-option"><input id="rapidoCosturaExterna" type="checkbox" ${etapa.costuraExterna ? 'checked' : ''} ${podeEditarEtapaAtual ? '' : 'disabled'}><span>Este pedido está em costura externa</span></label>` : ''}

        <label>
          <span>${labelResponsavel}</span>
          <input id="rapidoResponsavel" class="input" type="text" value="${escapeHtml(etapa.responsavel || '')}" ${podeEditarEtapaAtual ? '' : 'disabled'}>
        </label>

        <label>
          <span>Observação</span>
          <textarea id="rapidoObs" class="textarea" ${podeEditarEtapaAtual ? '' : 'disabled'}>${escapeHtml(etapa.observacao || '')}</textarea>
        </label>

        <div class="actions">
          <button class="btn btn-light" onclick="abrirDetalheCompleto(decodeURIComponent('${encodeInlineArg(pedido.numeroPedido)}'))">Ver pedido completo</button>
          ${podeEditarEtapaAtual ? '<button class="btn btn-light" onclick="salvarEtapaRapida(false)">Salvar</button><button class="btn btn-primary" onclick="salvarEtapaRapida(true)">Salvar e concluir etapa</button>' : '<span class="alert">Esta etapa pode ser alterada somente por ADMIN.</span>'}
        </div>
      </div>
    `;

    document.getElementById('modalEtapaRapida').classList.remove('hidden');
  }

  function salvarEtapaRapida(concluir) {
    const dados = estado.etapaRapida;
    const etapa = dados.etapa;

    if (!etapa) return;

    const payload = {
      idEtapaDb: etapa.id,
      dataInicio: document.getElementById('rapidoInicio').value.trim(),
      dataConclusao: document.getElementById('rapidoConclusao').value.trim(),
      responsavel: document.getElementById('rapidoResponsavel').value.trim(),
      observacao: document.getElementById('rapidoObs').value.trim(),
      numeroCorte: document.getElementById('rapidoNumeroCorte') ? document.getElementById('rapidoNumeroCorte').value.trim() : '',
      costuraExterna: document.getElementById('rapidoCosturaExterna') ? document.getElementById('rapidoCosturaExterna').checked : false,
      concluir
    };

    payload.auth = authPayload().auth;

    if (!validarDatasEtapaFrontend(payload.dataInicio, payload.dataConclusao)) return;

    const botoes = document.querySelectorAll('#modalEtapaConteudo button');
    botoes.forEach(btn => btn.disabled = true);

    google.script.run
      .withSuccessHandler(resposta => {
        botoes.forEach(btn => btn.disabled = false);

        if (resposta.card) {
          atualizarCardKanbanLocal(resposta.card);
        }

        if (resposta.etapa) {
          atualizarEtapaLocal(resposta.etapa);
          atualizarPedidoCompletoLocal(resposta.card);
          renderizarModalEtapaRapida({
            pedido: encontrarPedido(resposta.card.numeroPedido) || dados.pedido,
            etapa: resposta.etapa,
            card: resposta.card
          });
        }

        if (concluir) {
          fecharModalEtapaRapida();
        }

        salvarEstadoLocal();
        mostrarToast(resposta.mensagem || 'Etapa salva.');
      })
      .withFailureHandler(erro => {
        botoes.forEach(btn => btn.disabled = false);
        tratarErro(erro);
      })
      .salvarEtapaAtualRapido(payload);
  }

  function atualizarCardKanbanLocal(cardAtualizado) {
    (estado.kanban.colunas || []).forEach(coluna => {
      coluna.cards = (coluna.cards || []).filter(card => String(card.numeroPedido) !== String(cardAtualizado.numeroPedido));
    });

    let colunaDestino = (estado.kanban.colunas || []).find(coluna => coluna.etapa === cardAtualizado.etapaAtual);

    if (!colunaDestino) {
      colunaDestino = { ordem: cardAtualizado.ordemEtapaAtual || 0, etapa: cardAtualizado.etapaAtual, cards: [] };
      estado.kanban.colunas.push(colunaDestino);
    }

    colunaDestino.cards.push(cardAtualizado);
    colunaDestino.cards.sort((a, b) => {
      const da = a.diasParaEntrega === '' ? 999999 : Number(a.diasParaEntrega);
      const db = b.diasParaEntrega === '' ? 999999 : Number(b.diasParaEntrega);
      return da - db;
    });

    estado.kanban.cards = (estado.kanban.cards || []).filter(card => String(card.numeroPedido) !== String(cardAtualizado.numeroPedido));
    estado.kanban.cards.push(cardAtualizado);

    renderizarKanban();
  }

  function atualizarPedidoCompletoLocal(card) {
    if (!card) return;

    const atualizar = pedido => {
      if (String(pedido.numeroPedido) !== String(card.numeroPedido)) {
        return pedido;
      }

      return {
        ...pedido,
        etapaAtual: card.etapaAtual,
        diasParaEntrega: card.diasParaEntrega,
        diasParado: card.diasParado,
        responsavelAtual: card.responsavelAtual,
        numeroCorte: card.numeroCorte || pedido.numeroCorte || ''
      };
    };
    estado.pedidosCompleto = (estado.pedidosCompleto || []).map(atualizar);
    estado.pedidos = (estado.pedidos || []).map(atualizar);
    estado.recentes = (estado.recentes || []).map(atualizar);

    renderizarPedidosCompleto();
    renderizarRecentes();
  }

  function abrirDetalheCompleto(numeroPedido) {
    const pedido = encontrarPedido(numeroPedido);

    if (!pedido) {
      mostrarToast('Pedido não encontrado na tela. Clique em Atualizar.');
      return;
    }

    const etapasLocais = obterEtapasLocaisPedido(numeroPedido);
    const itens = estado.itensCache[String(numeroPedido)];

    const detalheInicial = {
      pedido,
      etapas: etapasLocais,
      itens: itens || [],
      etapaAtual: calcularEtapaAtualLocal(etapasLocais, pedido)
    };

    renderizarDetalhePedido(detalheInicial);
    fecharModalEtapaRapida();

    carregarDetalheCompletoServidor(numeroPedido);
  }

  function obterEtapasLocaisPedido(numeroPedido) {
    const n = String(numeroPedido).trim();

    return (estado.etapas || [])
      .filter(etapa => String(etapa.numeroPedido || '').trim() === n)
      .sort((a, b) => Number(a.ordemEtapa || 0) - Number(b.ordemEtapa || 0));
  }

  function calcularEtapaAtualLocal(etapas, pedido) {
    const ordenadas = (etapas || [])
      .slice()
      .sort((a, b) => Number(a.ordemEtapa || 0) - Number(b.ordemEtapa || 0));

    const andamento = ordenadas.find(etapa => etapa.statusEtapa === 'EM ANDAMENTO');

    if (andamento) {
      return { etapa: andamento.etapa, ordem: andamento.ordemEtapa, status: andamento.statusEtapa };
    }

    const pendente = ordenadas.find(etapa => etapa.statusEtapa !== 'CONCLUÍDA');

    if (pendente) {
      return { etapa: pendente.etapa, ordem: pendente.ordemEtapa, status: pendente.statusEtapa };
    }

    return {
      etapa: pedido?.etapaAtual || 'CONCLUÍDO',
      ordem: 99,
      status: pedido?.etapaAtual === 'CONCLUÍDO' ? 'CONCLUÍDO' : ''
    };
  }

  function carregarDetalheCompletoServidor(numeroPedido) {
    google.script.run
      .withSuccessHandler(detalhe => {
        const etapasServidor = detalhe.etapas || [];
        const etapasLocais = obterEtapasLocaisPedido(numeroPedido);
        const etapasFinais = etapasServidor.length ? etapasServidor : etapasLocais;

        if (etapasServidor.length) {
          atualizarEtapasLocaisPedido(numeroPedido, etapasServidor);
        }

        estado.itensCache[String(numeroPedido)] = detalhe.itens || estado.itensCache[String(numeroPedido)] || [];

        renderizarDetalhePedido({
          ...detalhe,
          etapas: etapasFinais,
          itens: estado.itensCache[String(numeroPedido)] || []
        });

        salvarEstadoLocal();
      })
      .withFailureHandler(erro => {
        console.error(erro);
        const pedido = encontrarPedido(numeroPedido);
        const etapasLocais = obterEtapasLocaisPedido(numeroPedido);

        renderizarDetalhePedido({
          pedido,
          etapas: etapasLocais,
          itens: estado.itensCache[String(numeroPedido)] || [],
          etapaAtual: calcularEtapaAtualLocal(etapasLocais, pedido)
        });

        mostrarToast('Não consegui atualizar o detalhe agora. Exibindo dados locais.');
      })
      .obterDetalhePedidoCompleto(authPayload({ numeroPedido: numeroPedido }));
  }

  function atualizarEtapasLocaisPedido(numeroPedido, etapasServidor) {
    const n = String(numeroPedido).trim();

    estado.etapas = (estado.etapas || []).filter(etapa =>
      String(etapa.numeroPedido || '').trim() !== n
    );

    estado.etapas.push(...(etapasServidor || []));
  }

  function fecharDetalhePedido() {
    document.getElementById('modalDetalhe').classList.add('hidden');
  }

  function renderizarDetalhePedido(detalhe) {
    const pedido = detalhe.pedido;
    const etapas = detalhe.etapas || [];
    const itens = detalhe.itens || [];
    const gargalo = detalhe.gargalo || null;

    document.getElementById('modalDetalheTitulo').textContent =
      `Pedido ${pedido.numeroPedido} — ${pedido.cliente}`;

    document.getElementById('modalDetalheConteudo').innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h3>Linha do tempo das etapas</h3>

          <div class="leadtime-summary">
            <div><span>Lead time total</span><strong>${Number(detalhe.leadTimeDias || 0)} dias</strong></div>
            <div><span>Tempo somado nas etapas</span><strong>${Number(detalhe.somaEtapasDias || 0)} dias</strong></div>
            <div><span>Operação gargalo</span><strong>${gargalo ? `${escapeHtml(gargalo.etapa)} · ${Number(gargalo.dias)} dias` : 'Ainda não calculada'}</strong></div>
          </div>

          <div class="timeline">
            ${etapas.length ? etapas.map(etapa => renderizarTimeline(etapa, gargalo)).join('') : '<p>Linha do tempo não carregada ainda. Clique em Atualizar se necessário.</p>'}
          </div>
        </div>

        <div class="detail-card">
          <h3>Resumo</h3>
          <p><strong>Pedido ${escapeHtml(pedido.numeroPedido || '')}</strong>${numeroCorteHtml(pedido.numeroCorte)}</p>
          <p><strong>Cliente:</strong><br>${escapeHtml(pedido.cliente || '')}</p>
          <p><strong>Entrada:</strong> ${escapeHtml(pedido.dataEntrada || '')}</p>
          <p><strong>Entrega:</strong> ${escapeHtml(pedido.dataEntrega || '')}</p>
          <p><strong>Prazo:</strong> ${escapeHtml(pedido.prazoOriginal || '')}</p>
          <p><strong>Qtd. total:</strong> ${Number(pedido.qtdTotal || 0).toLocaleString('pt-BR')}</p>
          <p>
            ${urlSegura(pedido.linkPdf) ? `<a class="link-anexo" href="${escapeAttr(urlSegura(pedido.linkPdf))}" target="_blank" rel="noopener noreferrer">PDF</a>` : ''}
          </p>

          <h3 style="margin-top:24px">Itens</h3>

          <div class="detail-items">
            ${itens.length ? itens.map(renderizarItemDetalhe).join('') : '<p>Carregando itens...</p>'}
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalDetalhe').classList.remove('hidden');
  }

  function renderizarItemDetalhe(item) {
    const grade = entradasGrade(item.grade || {}).filter(([, quantidade]) => Number(quantidade) > 0);
    return `<details class="detail-item">
      <summary><span>${escapeHtml(item.item || 'Item sem descrição')}</span><strong>${Number(item.qtd || 0).toLocaleString('pt-BR')} peças</strong></summary>
      <div class="detail-item-body">
        <p><strong>Manga:</strong> ${escapeHtml(item.manga || '-')} · <strong>Tecido:</strong> ${escapeHtml(item.tecido || '-')} · <strong>Cor:</strong> ${escapeHtml(item.cor || '-')}</p>
        <div class="grade-view">${grade.length ? grade.map(([tamanho, quantidade]) => `<span><strong>${escapeHtml(tamanho)}</strong>${Number(quantidade).toLocaleString('pt-BR')} peças</span>`).join('') : '<em>Grade não informada.</em>'}</div>
        ${item.observacao ? `<p><strong>Observação:</strong> ${escapeHtml(item.observacao)}</p>` : ''}
      </div>
    </details>`;
  }

  function renderizarTimeline(etapa, gargalo) {
    const statusClass = etapa.statusEtapa === 'CONCLUÍDA'
      ? 'status-ok'
      : etapa.statusEtapa === 'EM ANDAMENTO'
        ? 'status-info'
        : 'status-muted';

    const dotClass = etapa.statusEtapa === 'CONCLUÍDA'
      ? 'done'
      : etapa.statusEtapa === 'EM ANDAMENTO'
        ? 'active'
        : '';

    return `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}">
          ${etapa.statusEtapa === 'CONCLUÍDA' ? '✓' : etapa.ordemEtapa}
        </div>

        <div class="timeline-box ${gargalo && gargalo.etapa === etapa.etapa && etapa.diasNaEtapa !== null ? 'timeline-bottleneck' : ''}">
          <div class="timeline-title">
            <strong>${escapeHtml(etapa.etapa)}</strong>
            <div class="timeline-tags">
              ${etapa.costuraExterna ? '<span class="costura-externa-flag">COSTURA EXTERNA</span>' : ''}
              ${gargalo && gargalo.etapa === etapa.etapa && etapa.diasNaEtapa !== null ? '<span class="bottleneck-flag">GARGALO</span>' : ''}
              <span class="status ${statusClass}">${escapeHtml(etapa.statusEtapa)}</span>
            </div>
          </div>

          <p><strong>Início:</strong> ${escapeHtml(etapa.dataInicio || '-')} | <strong>Conclusão:</strong> ${escapeHtml(etapa.dataConclusao || '-')}</p>
          <p><strong>Tempo na etapa:</strong> ${etapa.diasNaEtapa === null || etapa.diasNaEtapa === undefined ? '-' : `${Number(etapa.diasNaEtapa)} dias`}</p>
          <p><strong>Responsável:</strong> ${escapeHtml(etapa.responsavel || '-')}</p>
          ${etapa.observacao ? `<p><strong>Obs.:</strong> ${escapeHtml(etapa.observacao)}</p>` : ''}
          ${pode('ALTERAR_QUALQUER_ETAPA') ? `<div class="actions" style="margin-top:10px"><button class="btn btn-light" onclick="editarEtapaLinhaTempo('${escapeAttr(etapa.id)}')">Editar etapa</button></div>` : ''}
        </div>
      </div>
    `;
  }

  function statusPedidoHtml(pedido) {
    const etapa = String(pedido.etapaAtual || '').trim().toUpperCase();

    if (etapa === 'CONCLUÍDO' || etapa === 'CONCLUIDO' || pedido.concluido) {
      return `<span class="status status-ok">CONCLUÍDO</span>`;
    }

    const data = parseDataBR(pedido.dataEntrega);

    if (!data) {
      return `<span class="status status-warning">SEM DATA</span>`;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diff = Math.ceil((data.getTime() - hoje.getTime()) / 86400000);

    if (diff < 0) return `<span class="status status-danger">ATRASADO</span>`;
    if (diff <= 15) return `<span class="status status-warning">ATENÇÃO</span>`;

    return `<span class="status status-ok">NO PRAZO</span>`;
  }

  function formatarDiasEntrega(valor) {
    if (valor === '' || valor === null || valor === undefined) return 'Sem data';

    const dias = Number(valor);

    if (dias < 0) return `${Math.abs(dias)} dias atrasado`;
    if (dias === 0) return 'vence hoje';

    return `${dias} dias`;
  }


  function atualizarEtapaLocal(etapaAtualizada) {
    if (!etapaAtualizada) return;

    const id = String(etapaAtualizada.id || etapaAtualizada.idEtapa || '').trim();

    if (!id) return;

    const idx = (estado.etapas || []).findIndex(etapa =>
      String(etapa.id || etapa.idEtapa || '').trim() === id
    );

    if (idx >= 0) {
      estado.etapas[idx] = { ...estado.etapas[idx], ...etapaAtualizada };
    } else {
      estado.etapas = estado.etapas || [];
      estado.etapas.push(etapaAtualizada);
    }
  }


  function carregarUsuarios() {
    if (!pode('GERENCIAR_USUARIOS')) return;

    google.script.run
      .withSuccessHandler(usuarios => {
        estado.usuarios = usuarios || [];
        renderizarUsuarios();
      })
      .withFailureHandler(tratarErro)
      .listarUsuariosSistema(authPayload());
  }

  function renderizarUsuarios() {
    const corpo = document.getElementById('tabelaUsuarios');

    if (!corpo) return;

    if (!estado.usuarios.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    corpo.innerHTML = estado.usuarios.map(usuario => `
      <tr>
        <td>${escapeHtml(usuario.nome || '')}</td>
        <td>${escapeHtml(usuario.email || '')}</td>
        <td><span class="permission-chip">${escapeHtml(usuario.perfil || '')}</span></td>
        <td>${usuario.ativo ? 'Sim' : 'Não'}</td>
        <td>${escapeHtml(formatarDataHoraCurta(usuario.ultimoAcesso || ''))}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn-light" onclick="abrirModalUsuario('${escapeAttr(usuario.id)}')">Editar</button>
            ${usuario.authUserId ? `<button class="btn btn-light" onclick="alterarSenhaUsuario('${escapeAttr(usuario.authUserId)}')">Senha</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function abrirModalUsuario(id) {
    if (!pode('GERENCIAR_USUARIOS')) {
      mostrarToast('Você não tem permissão para gerenciar usuários.');
      return;
    }

    const usuario = id
      ? (estado.usuarios || []).find(u => String(u.id) === String(id))
      : { nome: '', email: '', perfil: 'PRODUCAO', ativo: true, senha: '' };

    estado.usuarioEditando = usuario || null;

    document.getElementById('modalUsuarioTitulo').textContent = id ? 'Editar usuário' : 'Novo usuário';

    document.getElementById('modalUsuarioConteudo').innerHTML = `
      <div class="quick-form">
        <label>
          <span>Nome</span>
          <input id="usuarioNome" class="input" type="text" value="${escapeHtml(usuario?.nome || '')}">
        </label>

        <label>
          <span>E-mail</span>
          <input id="usuarioEmail" class="input" type="email" value="${escapeHtml(usuario?.email || '')}" ${id ? 'readonly' : ''}>
        </label>

        <label>
          <span>Perfil</span>
          <select id="usuarioPerfil" class="input">
            ${['ADMIN', 'PCP', 'PRODUCAO', 'CONSULTA'].map(perfil => `
              <option value="${perfil}" ${usuario?.perfil === perfil ? 'selected' : ''}>${perfil}</option>
            `).join('')}
          </select>
        </label>

        <label>
          <span>Ativo</span>
          <select id="usuarioAtivo" class="input">
            <option value="true" ${usuario?.ativo !== false ? 'selected' : ''}>Sim</option>
            <option value="false" ${usuario?.ativo === false ? 'selected' : ''}>Não</option>
          </select>
        </label>

        ${id ? '' : `
          <label>
            <span>Senha inicial</span>
            <input id="usuarioSenha" class="input" type="password" placeholder="mínimo 6 caracteres">
          </label>
          <small>Use "Criar login + perfil" se a SUPABASE_SERVICE_ROLE_KEY estiver nas Script Properties. Caso contrário, crie o usuário no Supabase Auth e use "Salvar perfil".</small>
        `}

        <div class="actions">
          <button class="btn btn-light" onclick="fecharModalUsuario()">Cancelar</button>
          ${id ? '' : '<button class="btn btn-light" onclick="salvarUsuario(false)">Salvar perfil</button>'}
          <button class="btn btn-primary" onclick="salvarUsuario(${id ? 'false' : 'true'})">${id ? 'Salvar' : 'Criar login + perfil'}</button>
        </div>
      </div>
    `;

    document.getElementById('modalUsuario').classList.remove('hidden');
  }

  function fecharModalUsuario() {
    document.getElementById('modalUsuario').classList.add('hidden');
  }

  function salvarUsuario(criarAuth) {
    const usuario = {
      id: estado.usuarioEditando?.id || '',
      email: document.getElementById('usuarioEmail').value.trim(),
      nome: document.getElementById('usuarioNome').value.trim(),
      perfil: document.getElementById('usuarioPerfil').value,
      ativo: document.getElementById('usuarioAtivo').value === 'true',
      senha: document.getElementById('usuarioSenha') ? document.getElementById('usuarioSenha').value : ''
    };

    exibirLoading('Salvando usuário...');

    const fn = criarAuth ? 'criarUsuarioAuthESistema' : 'salvarUsuarioSistema';

    google.script.run
      .withSuccessHandler(resposta => {
        estado.usuarios = resposta.usuarios || estado.usuarios;
        renderizarUsuarios();
        fecharModalUsuario();
        ocultarLoading();
        mostrarToast(resposta.mensagem || 'Usuário salvo.');
      })
      .withFailureHandler(tratarErro)
      [fn](authPayload({ usuario }));
  }

  function alterarSenhaUsuario(authUserId) {
    const novaSenha = prompt('Digite a nova senha do usuário. Mínimo 6 caracteres.');

    if (!novaSenha) return;

    exibirLoading('Alterando senha...');

    google.script.run
      .withSuccessHandler(resposta => {
        ocultarLoading();
        mostrarToast(resposta.mensagem || 'Senha alterada.');
      })
      .withFailureHandler(tratarErro)
      .alterarSenhaUsuarioAuth(authPayload({ authUserId, novaSenha }));
  }

  function abrirModalEditarPedido(numeroPedido) {
    if (!pode('EDITAR_PEDIDO')) {
      mostrarToast('Você não tem permissão para editar pedidos.');
      return;
    }

    const pedido = encontrarPedido(numeroPedido);

    if (!pedido) {
      mostrarToast('Pedido não encontrado.');
      return;
    }

    estado.pedidoEditando = pedido;

    document.getElementById('modalEditarPedidoTitulo').textContent = `Editar pedido ${pedido.numeroPedido}`;

    document.getElementById('modalEditarPedidoConteudo').innerHTML = `
      <div class="quick-form">
        <label>
          <span>Cliente</span>
          <input id="editPedidoCliente" class="input" type="text" value="${escapeHtml(pedido.cliente || '')}">
        </label>

        <div class="quick-form-grid">
          <label>
            <span>Data entrada</span>
            <input id="editPedidoEntrada" class="input" type="text" value="${escapeHtml(pedido.dataEntrada || '')}">
          </label>

          <label>
            <span>Data entrega</span>
            <input id="editPedidoEntrega" class="input" type="text" value="${escapeHtml(pedido.dataEntrega || '')}">
          </label>
        </div>

        <div class="quick-form-grid">
          <label>
            <span>Prazo original</span>
            <input id="editPedidoPrazo" class="input" type="text" value="${escapeHtml(pedido.prazoOriginal || '')}">
          </label>

          <label>
            <span>Qtd. total</span>
            <input id="editPedidoQtd" class="input" type="number" value="${Number(pedido.qtdTotal || 0)}">
          </label>
        </div>

        <div class="actions">
          <button class="btn btn-light" onclick="fecharModalEditarPedido()">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarEdicaoPedido()">Salvar pedido</button>
        </div>
      </div>
    `;

    document.getElementById('modalEditarPedido').classList.remove('hidden');
  }

  function fecharModalEditarPedido() {
    document.getElementById('modalEditarPedido').classList.add('hidden');
  }

  function salvarEdicaoPedido() {
    const pedidoBase = estado.pedidoEditando;

    const pedido = {
      numeroPedido: pedidoBase.numeroPedido,
      cliente: document.getElementById('editPedidoCliente').value.trim(),
      dataEntrada: document.getElementById('editPedidoEntrada').value.trim(),
      dataEntrega: document.getElementById('editPedidoEntrega').value.trim(),
      prazoOriginal: document.getElementById('editPedidoPrazo').value.trim(),
      qtdTotal: Number(document.getElementById('editPedidoQtd').value || 0)
    };

    exibirLoading('Salvando pedido...');

    google.script.run
      .withSuccessHandler(resposta => {
        aplicarDadosSistema(resposta);
        fecharModalEditarPedido();
        ocultarLoading();
        mostrarToast(resposta.mensagem || 'Pedido salvo.');
      })
      .withFailureHandler(tratarErro)
      .editarPedidoAdmin(authPayload({ pedido }));
  }

  function apagarPedido(numeroPedido) {
    if (!pode('APAGAR_PEDIDO')) {
      mostrarToast('Você não tem permissão para apagar pedidos.');
      return;
    }

    const motivo = prompt(`Informe o motivo para apagar o pedido ${numeroPedido}:`);

    if (!motivo) return;

    if (!confirm(`Confirma apagar o pedido ${numeroPedido}? Ele será ocultado do sistema, mas ficará registrado em auditoria.`)) {
      return;
    }

    exibirLoading('Apagando pedido...');

    google.script.run
      .withSuccessHandler(resposta => {
        aplicarDadosSistema(resposta);
        ocultarLoading();
        mostrarToast(resposta.mensagem || 'Pedido apagado.');
      })
      .withFailureHandler(tratarErro)
      .apagarPedidoAdmin(authPayload({ numeroPedido, motivo }));
  }

  function editarEtapaLinhaTempo(idEtapaDb) {
    if (!pode('ALTERAR_QUALQUER_ETAPA')) {
      mostrarToast('Você não tem permissão para alterar etapas concluídas.');
      return;
    }

    const etapa = buscarEtapaLocalPorId(idEtapaDb);

    if (!etapa) {
      mostrarToast('Etapa não encontrada localmente. Reabra o pedido completo.');
      return;
    }

    if (Number(etapa.ordemEtapa) === 1 && estado.usuario?.perfil !== 'ADMIN') {
      mostrarToast('A etapa COMPRA TECIDO/RISCO pode ser alterada somente por ADMIN.');
      return;
    }
    const pedido = encontrarPedido(etapa.numeroPedido) || {};
    estado.etapaEdicaoLivre = etapa;
    document.getElementById('modalEtapaTitulo').textContent = `Editar ${etapa.etapa}`;
    document.getElementById('modalEtapaConteudo').innerHTML = `
      <div class="quick-summary"><p><strong>Pedido ${escapeHtml(etapa.numeroPedido)}</strong></p>${numeroCorteHtml(pedido.numeroCorte)}${etapa.costuraExterna ? '<span class="costura-externa-flag">COSTURA EXTERNA</span>' : ''}</div>
      <div class="quick-form">
        <div class="quick-form-grid">
          <label><span>Data início</span><input id="edicaoEtapaInicio" class="input" type="text" placeholder="dd/mm/aaaa" value="${escapeHtml(etapa.dataInicio || '')}"></label>
          <label><span>Data conclusão</span><input id="edicaoEtapaConclusao" class="input" type="text" placeholder="dd/mm/aaaa" value="${escapeHtml(etapa.dataConclusao || '')}"></label>
        </div>
        ${Number(etapa.ordemEtapa) === 1 ? `<label><span>Nº CORTE</span><input id="edicaoEtapaNumeroCorte" class="input" type="text" value="${escapeHtml(pedido.numeroCorte || '')}"></label>` : ''}
        ${etapa.etapa === 'COSTURA' ? `<label class="check-option"><input id="edicaoCosturaExterna" type="checkbox" ${etapa.costuraExterna ? 'checked' : ''}><span>Este pedido está em costura externa</span></label>` : ''}
        <label><span>Responsável</span><input id="edicaoEtapaResponsavel" class="input" type="text" value="${escapeHtml(etapa.responsavel || '')}"></label>
        <label><span>Observação</span><textarea id="edicaoEtapaObs" class="textarea">${escapeHtml(etapa.observacao || '')}</textarea></label>
        <div class="actions"><button class="btn btn-light" onclick="fecharModalEtapaRapida()">Cancelar</button><button class="btn btn-primary" onclick="salvarEdicaoEtapaCompleta()">Salvar etapa</button></div>
      </div>`;
    fecharDetalhePedido();
    document.getElementById('modalEtapaRapida').classList.remove('hidden');
  }

  function salvarEdicaoEtapaCompleta() {
    const etapaBase = estado.etapaEdicaoLivre;
    if (!etapaBase) return;
    const etapa = {
      id: etapaBase.id,
      dataInicio: document.getElementById('edicaoEtapaInicio').value.trim(),
      dataConclusao: document.getElementById('edicaoEtapaConclusao').value.trim(),
      responsavel: document.getElementById('edicaoEtapaResponsavel').value.trim(),
      observacao: document.getElementById('edicaoEtapaObs').value.trim(),
      numeroCorte: document.getElementById('edicaoEtapaNumeroCorte') ? document.getElementById('edicaoEtapaNumeroCorte').value.trim() : '',
      costuraExterna: document.getElementById('edicaoCosturaExterna') ? document.getElementById('edicaoCosturaExterna').checked : false
    };
    if (!validarDatasEtapaFrontend(etapa.dataInicio, etapa.dataConclusao)) return;
    exibirLoading('Salvando etapa...');
    google.script.run.withSuccessHandler(resposta => {
      if (resposta.etapa) atualizarEtapaLocal(resposta.etapa);
      fecharModalEtapaRapida();
      ocultarLoading();
      carregarSistema(false);
      abrirDetalheCompleto(etapaBase.numeroPedido);
      mostrarToast(resposta.mensagem || 'Etapa salva.');
    }).withFailureHandler(tratarErro).editarQualquerEtapaAdmin(authPayload({ etapa }));
  }

  function buscarEtapaLocalPorId(idEtapaDb) {
    const etapas = estado.etapas || [];

    return etapas.find(etapa => String(etapa.id) === String(idEtapaDb));
  }

  function formatarDataHoraCurta(valor) {
    if (!valor) return '';

    const data = new Date(valor);

    if (isNaN(data.getTime())) return valor;

    return data.toLocaleString('pt-BR');
  }

  function salvarEstadoLocal() {
    try {
      const payload = {
        pedidos: estado.pedidos || [],
        pedidosCompleto: estado.pedidosCompleto || [],
        recentes: estado.recentes || [],
        kanban: estado.kanban || { colunas: [], cards: [] },
        etapas: estado.etapas || [],
        gargalos: estado.gargalos || [],
        metricas: estado.metricas || {},
        itensCache: estado.itensCache || {},
        salvoEm: Date.now()
      };

      sessionStorage.setItem('ZANELLI_V70_SUPABASE_ESTADO', JSON.stringify(payload));
    } catch (e) {
      console.error(e);
    }
  }

  function lerEstadoLocal() {
    try {
      const bruto = sessionStorage.getItem('ZANELLI_V70_SUPABASE_ESTADO');

      if (!bruto) return null;

      const payload = JSON.parse(bruto);
      const idade = Date.now() - Number(payload.salvoEm || 0);

      if (idade > 1000 * 60 * 5) {
        sessionStorage.removeItem('ZANELLI_V70_SUPABASE_ESTADO');
        return null;
      }

      return payload;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function arquivoParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const resultado = String(reader.result || '');
        resolve(resultado.split(',')[1] || '');
      };

      reader.onerror = reject;
      reader.readAsDataURL(arquivo);
    });
  }

  function extrairPrazosTexto(texto) {
    return (String(texto || '').match(/\d+/g) || [])
      .map(Number)
      .filter(numero => Number.isFinite(numero) && numero > 0 && numero <= 1000);
  }

  function parseDataBR(texto) {
    const match = String(texto || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!match) return null;

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]);

    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;

    const data = new Date(ano, mes - 1, dia);

    if (
      data.getFullYear() !== ano ||
      data.getMonth() !== mes - 1 ||
      data.getDate() !== dia
    ) {
      return null;
    }

    data.setHours(0, 0, 0, 0);
    return data;
  }

  function formatarDataBR(data) {
    return [
      String(data.getDate()).padStart(2, '0'),
      String(data.getMonth() + 1).padStart(2, '0'),
      data.getFullYear()
    ].join('/');
  }

  function validarDatasEtapaFrontend(inicioTexto, conclusaoTexto) {
    const inicio = inicioTexto ? parseDataBR(inicioTexto) : null;
    const conclusao = conclusaoTexto ? parseDataBR(conclusaoTexto) : null;
    if (inicioTexto && !inicio) { mostrarToast('Data de início inválida. Use dd/mm/aaaa.'); return false; }
    if (conclusaoTexto && !conclusao) { mostrarToast('Data de conclusão inválida. Use dd/mm/aaaa.'); return false; }
    if (conclusao && !inicio) { mostrarToast('Informe a data de início antes da conclusão.'); return false; }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (conclusao && conclusao > hoje) { mostrarToast('A data de conclusão não pode ser futura.'); return false; }
    if (inicio && conclusao && conclusao < inicio) { mostrarToast('A conclusão não pode ser anterior ao início.'); return false; }
    return true;
  }

  function setValor(id, valor) {
    document.getElementById(id).value = valor ?? '';
  }

  function exibirLoading(texto) {
    document.getElementById('loadingTexto').textContent = texto || 'Processando...';
    document.getElementById('loading').classList.remove('hidden');
  }

  function ocultarLoading() {
    document.getElementById('loading').classList.add('hidden');
  }

  function tratarErro(erro) {
    console.error(erro);
    ocultarLoading();

    const mensagem =
      erro?.message ||
      erro?.toString?.() ||
      'Ocorreu um erro inesperado.';

    mostrarToast(mensagem);
  }

  function mostrarToast(mensagem) {
    const toast = document.getElementById('toast');

    toast.textContent = mensagem;
    toast.classList.remove('hidden');

    window.clearTimeout(window.__toastTimer);

    window.__toastTimer = window.setTimeout(() => {
      toast.classList.add('hidden');
    }, 5000);
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(valor) {
    return escapeHtml(valor).replace(/`/g, '&#096;');
  }

  function encodeInlineArg(valor) {
    return encodeURIComponent(String(valor || '')).replace(/'/g, '%27');
  }

  function urlSegura(valor) {
    const texto = String(valor || '').trim();
    return /^https:\/\/(drive|docs)\.google\.com\//i.test(texto) ? texto : '';
  }

  function numeroCorteHtml(numeroCorte) {
    return numeroCorte
      ? `<div class="numero-corte"><strong>Nº CORTE: ${escapeHtml(numeroCorte)}</strong></div>`
      : '';
  }

  function formatarBytes(bytes) {
    const numero = Number(bytes || 0);

    if (numero < 1024) return `${numero} B`;
    if (numero < 1024 ** 2) return `${(numero / 1024).toFixed(1)} KB`;

    return `${(numero / 1024 ** 2).toFixed(1)} MB`;
  }
