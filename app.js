// Recibo Rápido: telas, dados no aparelho (localStorage + IndexedDB), assinatura e envio.
(function () {
  const $ = (s) => document.querySelector(s);
  const CHAVE_PERFIL = 'recibo-rapido:perfil';

  // ---------- Banco local (IndexedDB) ----------
  let dbPromessa;
  function db() {
    if (!dbPromessa) dbPromessa = new Promise((ok, erro) => {
      const req = indexedDB.open('recibo-rapido', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('recibos', { keyPath: 'numero' });
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
    return dbPromessa;
  }
  async function tx(modo, fn) {
    const d = await db();
    return new Promise((ok, erro) => {
      const t = d.transaction('recibos', modo);
      const r = fn(t.objectStore('recibos'));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => erro(t.error);
    });
  }
  const salvarRecibo = (r) => tx('readwrite', (s) => s.put(r));
  const listarRecibos = () => tx('readonly', (s) => s.getAll());
  const pegarRecibo = (n) => tx('readonly', (s) => s.get(n));
  const apagarRecibo = (n) => tx('readwrite', (s) => s.delete(n));

  // ---------- Perfil do prestador ----------
  function lerPerfil() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PERFIL)) || { proximoNumero: 1 }; }
    catch { return { proximoNumero: 1 }; }
  }
  function gravarPerfil(p) { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(p)); }
  let perfil = lerPerfil();
  const perfilCompleto = () => !!(perfil.nome && perfil.assinatura);

  // ---------- Utilidades ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
  }
  function hojeIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function lerValor(txt) {
    let s = String(txt || '').replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const v = Number(s);
    return isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  }
  function lerArquivoComoImagem(arquivo) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Imagem inválida')); };
      img.src = url;
    });
  }
  // reduz a imagem para não pesar no aparelho nem no PDF
  async function reduzir(arquivo, max, tipo, qualidade) {
    const img = await lerArquivoComoImagem(arquivo);
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    const ctx = c.getContext('2d');
    if (tipo === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(tipo, qualidade);
  }
  function baixar(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- Abas ----------
  function abrirAba(nome) {
    document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
    document.querySelectorAll('.aba').forEach((s) => s.classList.toggle('ativa', s.id === 'aba-' + nome));
    if (nome === 'dados') prepararAssinatura();
    if (nome === 'historico') mostrarHistorico();
    if (nome === 'novo') prepararNovo();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

  // ---------- Assinatura ----------
  const canvasAssin = $('#assin');
  const ctxAssin = canvasAssin.getContext('2d');
  let assinRabiscada = false, desenhando = false;

  function prepararAssinatura() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasAssin.getBoundingClientRect();
    canvasAssin.width = Math.round(rect.width * dpr);
    canvasAssin.height = Math.round(rect.height * dpr);
    ctxAssin.lineWidth = 2.6 * dpr;
    ctxAssin.lineCap = 'round'; ctxAssin.lineJoin = 'round';
    ctxAssin.strokeStyle = '#0b1f66';
    assinRabiscada = false;
    if (perfil.assinatura) {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(canvasAssin.width * 0.9 / img.width, canvasAssin.height * 0.9 / img.height);
        const l = img.width * r, a = img.height * r;
        ctxAssin.drawImage(img, (canvasAssin.width - l) / 2, (canvasAssin.height - a) / 2, l, a);
      };
      img.src = perfil.assinatura;
    }
  }
  function ponto(e) {
    const rect = canvasAssin.getBoundingClientRect();
    const dpr = canvasAssin.width / rect.width;
    return [(e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr];
  }
  canvasAssin.addEventListener('pointerdown', (e) => {
    if (!assinRabiscada) ctxAssin.clearRect(0, 0, canvasAssin.width, canvasAssin.height); // assinatura nova substitui a antiga
    desenhando = true; assinRabiscada = true;
    canvasAssin.setPointerCapture(e.pointerId);
    const [x, y] = ponto(e);
    ctxAssin.beginPath(); ctxAssin.moveTo(x, y); ctxAssin.lineTo(x + 0.1, y + 0.1); ctxAssin.stroke();
  });
  canvasAssin.addEventListener('pointermove', (e) => {
    if (!desenhando) return;
    const [x, y] = ponto(e);
    ctxAssin.lineTo(x, y); ctxAssin.stroke();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => canvasAssin.addEventListener(ev, () => (desenhando = false)));
  $('#limpar-assin').addEventListener('click', () => {
    ctxAssin.clearRect(0, 0, canvasAssin.width, canvasAssin.height);
    assinRabiscada = true; // marca como "apagada": ao salvar, fica sem assinatura
  });

  // recorta o espaço vazio em volta da assinatura
  function assinaturaRecortada() {
    const { width: w, height: h } = canvasAssin;
    const dados = ctxAssin.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (dados[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const pad = 8;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext('2d').drawImage(canvasAssin, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // ---------- Meus dados ----------
  const formDados = $('#form-dados');
  let logoTemp;
  function preencherDados() {
    ['nome', 'documento', 'telefone', 'endereco', 'cidade', 'proximoNumero'].forEach((k) => {
      formDados.elements[k].value = perfil[k] != null ? perfil[k] : '';
    });
    logoTemp = perfil.logo || null;
    mostrarLogo();
  }
  function mostrarLogo() {
    const img = $('#logo-prev');
    img.hidden = !logoTemp;
    if (logoTemp) img.src = logoTemp;
  }
  $('#in-logo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { logoTemp = await reduzir(f, 600, 'image/png'); mostrarLogo(); }
    catch { toast('Não consegui abrir essa imagem.'); }
  });
  $('#tirar-logo').addEventListener('click', () => { logoTemp = null; mostrarLogo(); });

  formDados.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formDados.elements;
    const novo = {
      nome: f.nome.value.trim(), documento: f.documento.value.trim(), telefone: f.telefone.value.trim(),
      endereco: f.endereco.value.trim(), cidade: f.cidade.value.trim(),
      proximoNumero: Math.max(1, parseInt(f.proximoNumero.value, 10) || 1),
      logo: logoTemp, assinatura: assinRabiscada ? assinaturaRecortada() : perfil.assinatura,
    };
    if (!novo.assinatura) { toast('Faltou a assinatura.'); return; }
    perfil = novo;
    try { gravarPerfil(perfil); } catch { toast('Sem espaço no aparelho. Tente uma logo menor.'); return; }
    assinRabiscada = false;
    toast('Dados salvos.');
    abrirAba('novo');
  });

  // ---------- Novo recibo ----------
  const formRec = $('#form-recibo');
  let fotos = [];
  function prepararNovo() {
    $('#aviso-dados').hidden = perfilCompleto();
    $('#prox-num').textContent = Recibo.numero(perfil.proximoNumero || 1);
    if (!formRec.elements.data.value) formRec.elements.data.value = hojeIso();
    if (!formRec.elements.cidade.value) formRec.elements.cidade.value = perfil.cidade || '';
  }
  formRec.elements.valor.addEventListener('input', () => {
    const c = lerValor(formRec.elements.valor.value);
    $('#extenso').textContent = c ? Recibo.moeda(c) + ' (' + valorPorExtenso(c) + ')' : '';
  });
  function mostrarFotos() {
    const box = $('#fotos');
    box.innerHTML = '';
    fotos.forEach((src, i) => {
      const d = document.createElement('div');
      const img = document.createElement('img'); img.src = src; img.alt = 'Foto ' + (i + 1);
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '×'; b.title = 'Tirar foto';
      b.onclick = () => { fotos.splice(i, 1); mostrarFotos(); };
      d.append(img, b); box.append(d);
    });
  }
  $('#in-fotos').addEventListener('change', async (e) => {
    const arqs = [...e.target.files]; e.target.value = '';
    for (const f of arqs) {
      if (fotos.length >= 12) { toast('Máximo de 12 fotos por recibo.'); break; }
      try { fotos.push(await reduzir(f, 1400, 'image/jpeg', 0.8)); } catch { toast('Uma das imagens não abriu.'); }
    }
    mostrarFotos();
  });

  formRec.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!perfilCompleto()) { toast('Preencha seus dados e a assinatura primeiro.'); abrirAba('dados'); return; }
    const f = formRec.elements;
    const valor = lerValor(f.valor.value);
    if (!valor) { toast('Valor inválido. Ex.: 150,00'); f.valor.focus(); return; }

    const numero = perfil.proximoNumero || 1;
    if (await pegarRecibo(numero)) {
      toast('Já existe o recibo nº ' + Recibo.numero(numero) + '. Ajuste o próximo número em Meus dados.');
      return;
    }
    const r = {
      numero, criadoEm: new Date().toISOString(),
      prestador: { nome: perfil.nome, documento: perfil.documento, telefone: perfil.telefone,
        endereco: perfil.endereco, logo: perfil.logo, assinatura: perfil.assinatura },
      cliente: { nome: f.cliNome.value.trim(), documento: f.cliDoc.value.trim() },
      servico: f.servico.value.trim(), valor, pagamento: f.pagamento.value,
      data: f.data.value || hojeIso(), cidade: f.cidade.value.trim(), fotos: fotos.slice(),
    };
    const botao = formRec.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Gerando…';
    try {
      await salvarRecibo(r);
      perfil.proximoNumero = numero + 1;
      gravarPerfil(perfil);
      formRec.reset(); fotos = []; mostrarFotos(); $('#extenso').textContent = '';
      prepararNovo();
      await abrirPrevia(r);
    } catch (err) {
      console.error(err);
      toast('Erro ao gerar o recibo. Pode ser falta de espaço no aparelho.');
    } finally {
      botao.disabled = false; botao.textContent = 'Gerar recibo';
    }
  });

  // ---------- Prévia / envio ----------
  let atual = null; // { r, blob, nome }
  async function abrirPrevia(r) {
    const { blob, previa } = await Recibo.gerarPdfRecibo(r);
    const cliente = r.cliente.nome.replace(/[^\p{L}\p{N} ]/gu, '').trim().replace(/\s+/g, '_');
    atual = { r, blob, nome: 'Recibo_' + Recibo.numero(r.numero) + '_' + cliente + '.pdf' };
    $('#previa-titulo').textContent = 'Recibo nº ' + Recibo.numero(r.numero);
    const box = $('#previa-paginas');
    box.innerHTML = '';
    previa.forEach((src) => { const i = document.createElement('img'); i.src = src; i.alt = 'Página do recibo'; box.append(i); });
    $('#previa').hidden = false;
  }
  $('#fechar').addEventListener('click', () => { $('#previa').hidden = true; atual = null; });
  $('#baixar').addEventListener('click', () => atual && baixar(atual.blob, atual.nome));
  $('#compartilhar').addEventListener('click', async () => {
    if (!atual) return;
    const arquivo = new File([atual.blob], atual.nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: atual.nome,
          text: 'Recibo nº ' + Recibo.numero(atual.r.numero) + ' - ' + Recibo.moeda(atual.r.valor) });
      } catch (err) { if (err.name !== 'AbortError') toast('Não deu pra compartilhar. Use "Baixar PDF".'); }
    } else {
      baixar(atual.blob, atual.nome);
      toast('Este navegador não envia direto. O PDF foi baixado.');
    }
  });

  // ---------- Histórico ----------
  async function mostrarHistorico() {
    const termo = $('#busca').value.trim().toLowerCase();
    const todos = (await listarRecibos()).sort((a, b) => b.numero - a.numero);
    const lista = todos.filter((r) => !termo || r.cliente.nome.toLowerCase().includes(termo) ||
      Recibo.numero(r.numero).includes(termo));
    const ul = $('#lista');
    ul.innerHTML = '';
    $('#vazio').hidden = lista.length > 0;
    $('#vazio').textContent = todos.length ? 'Nada encontrado.' : 'Nenhum recibo emitido ainda.';
    lista.forEach((r) => {
      const li = document.createElement('li');
      const [a, m, d] = r.data.split('-');
      li.innerHTML = '<div class="info"><b></b><small></small></div>';
      li.querySelector('b').textContent = 'Nº ' + Recibo.numero(r.numero) + ' · ' + r.cliente.nome;
      li.querySelector('small').textContent = d + '/' + m + '/' + a + ' · ' + Recibo.moeda(r.valor);
      const abrir = document.createElement('button'); abrir.textContent = 'Abrir';
      abrir.onclick = () => abrirPrevia(r);
      const apagar = document.createElement('button'); apagar.textContent = 'Apagar'; apagar.className = 'sec';
      apagar.onclick = async () => {
        if (!confirm('Apagar o recibo nº ' + Recibo.numero(r.numero) + ' de ' + r.cliente.nome + '? Não tem como desfazer.')) return;
        await apagarRecibo(r.numero); mostrarHistorico();
      };
      li.append(abrir, apagar);
      ul.append(li);
    });
  }
  $('#busca').addEventListener('input', mostrarHistorico);

  // ---------- Cópia de segurança ----------
  $('#exportar').addEventListener('click', async () => {
    const copia = { app: 'recibo-rapido', versao: 1, geradoEm: new Date().toISOString(), perfil, recibos: await listarRecibos() };
    baixar(new Blob([JSON.stringify(copia)], { type: 'application/json' }), 'recibos_copia_' + hojeIso() + '.json');
  });
  $('#importar').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const copia = JSON.parse(await f.text());
      if (copia.app !== 'recibo-rapido' || !Array.isArray(copia.recibos)) throw new Error('arquivo errado');
      if (!confirm('Importar ' + copia.recibos.length + ' recibo(s) e os dados do prestador desta cópia? Recibos com o mesmo número serão substituídos.')) return;
      for (const r of copia.recibos) await salvarRecibo(r);
      const maior = copia.recibos.reduce((m, r) => Math.max(m, r.numero), 0);
      perfil = Object.assign({}, copia.perfil);
      perfil.proximoNumero = Math.max(perfil.proximoNumero || 1, maior + 1);
      gravarPerfil(perfil);
      preencherDados(); prepararAssinatura();
      toast('Cópia importada.');
    } catch { toast('Esse arquivo não é uma cópia válida do Recibo Rápido.'); }
  });

  // ---------- Início ----------
  preencherDados();
  abrirAba(perfilCompleto() ? 'novo' : 'dados');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
