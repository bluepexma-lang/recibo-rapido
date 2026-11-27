// Assinatura pela câmera: foto -> recorte manual -> limpa o fundo -> traço azul com fundo transparente.
// Tudo roda no aparelho; a foto não sai do celular.
(function (global) {
  const COR = [11, 31, 102];      // azul caneta (mesmo do quadro de assinar com o dedo)
  const MAX_FOTO = 1600;          // reduz fotos grandes pra caber na memória do celular
  const MAX_SAIDA = 1200;         // tamanho máximo da área limpa

  function carregar(arquivo) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Imagem inválida')); };
      img.src = url;
    });
  }
  function reduzida(img, max) {
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  // ----- Limpeza -----
  // Compara cada ponto com a média da vizinhança (aguenta sombra e luz desigual).
  // intensidade: 0 (só traço bem escuro) a 100 (pega até traço fraco).
  function limpar(origem, intensidade) {
    const w = origem.width, h = origem.height;
    const px = origem.getContext('2d').getImageData(0, 0, w, h).data;
    const cinza = new Float32Array(w * h);
    for (let i = 0, j = 0; i < cinza.length; i++, j += 4) cinza[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];

    // imagem integral pra média rápida da vizinhança
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let soma = 0;
      for (let x = 0; x < w; x++) {
        soma += cinza[y * w + x];
        integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + soma;
      }
    }
    const raio = Math.max(8, Math.round(Math.max(w, h) / 16));
    const t = 0.30 - (intensidade / 100) * 0.26;   // quanto mais escuro que a vizinhança precisa ser
    const alfa = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - raio), y1 = Math.min(h - 1, y + raio);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - raio), x1 = Math.min(w - 1, x + raio);
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const s = integ[(y1 + 1) * (w + 1) + x1 + 1] - integ[y0 * (w + 1) + x1 + 1]
          - integ[(y1 + 1) * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
        const media = s / n;
        const limite = media * (1 - t);
        const v = cinza[y * w + x];
        if (v < limite) alfa[y * w + x] = Math.min(255, ((limite - v) / Math.max(12, media * 0.18)) * 255 + 60);
      }
    }
    tirarSujeira(alfa, w, h);

    // recorta o espaço vazio
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alfa[y * w + x]) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (bx1 < 0) return null;
    const pad = 6;
    bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
    bx1 = Math.min(w - 1, bx1 + pad); by1 = Math.min(h - 1, by1 + pad);
    const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = alfa[(y + by0) * w + x + bx0], k = (y * cw + x) * 4;
      out.data[k] = COR[0]; out.data[k + 1] = COR[1]; out.data[k + 2] = COR[2]; out.data[k + 3] = a;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  // apaga pontinhos soltos (poeira, textura do papel)
  function tirarSujeira(alfa, w, h) {
    const minimo = Math.max(12, Math.round(w * h * 0.0004));
    const visto = new Uint8Array(w * h);
    const pilha = new Int32Array(w * h);
    const grupo = [];
    for (let i = 0; i < alfa.length; i++) {
      if (!alfa[i] || visto[i]) continue;
      let topo = 0; pilha[topo++] = i; visto[i] = 1; grupo.length = 0;
      while (topo) {
        const p = pilha[--topo]; grupo.push(p);
        const x = p % w, y = (p - x) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (alfa[q] && !visto[q]) { visto[q] = 1; pilha[topo++] = q; }
        }
      }
      if (grupo.length < minimo) for (const p of grupo) alfa[p] = 0;
    }
  }

  // ----- Tela (recorte + ajuste) -----
  let foto, ret, etapa, resultado, arrasto, aoUsar;
  const $ = (s) => document.querySelector(s);

  function abrir(arquivo, callback) {
    aoUsar = callback;
    return carregar(arquivo).then((img) => {
      foto = reduzida(img, MAX_FOTO);
      // retângulo inicial: faixa central, onde normalmente está a assinatura
      ret = { x: foto.width * 0.08, y: foto.height * 0.3, w: foto.width * 0.84, h: foto.height * 0.4 };
      $('#foto-assin').hidden = false;
      irPara('recorte');
    });
  }
  function fechar() { $('#foto-assin').hidden = true; foto = resultado = null; }

  function irPara(e) {
    etapa = e;
    $('#fa-titulo').textContent = e === 'recorte' ? '1/2 · Ajuste o quadro em volta da assinatura' : '2/2 · Confira a assinatura limpa';
    $('#fa-recorte').hidden = e !== 'recorte';
    $('#fa-ajuste').hidden = e !== 'ajuste';
    $('#fa-proximo').parentElement.hidden = e !== 'recorte';
    $('#fa-botoes-ajuste').hidden = e !== 'ajuste';
    if (e === 'recorte') desenharRecorte(); else processar();
  }

  // canvas de recorte: mostra a foto inteira ajustada à tela
  function escala() { const c = $('#fa-canvas'); return c.width / foto.width; }
  function desenharRecorte() {
    const c = $('#fa-canvas'), box = c.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const maxL = box.clientWidth, maxA = Math.max(200, window.innerHeight * 0.58);
    const r = Math.min(maxL / foto.width, maxA / foto.height);
    c.style.width = Math.round(foto.width * r) + 'px';
    c.style.height = Math.round(foto.height * r) + 'px';
    c.width = Math.round(foto.width * r * dpr); c.height = Math.round(foto.height * r * dpr);
    const ctx = c.getContext('2d'), s = escala();
    ctx.drawImage(foto, 0, 0, c.width, c.height);
    const x = ret.x * s, y = ret.y * s, w = ret.w * s, h = ret.h * s;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, c.width, y); ctx.fillRect(0, y + h, c.width, c.height - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, c.width - x - w, h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x, y, w, h);
    const k = 14 * dpr;
    ctx.fillStyle = '#fff';
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, k / 1.4, 0, Math.PI * 2); ctx.fill();
    });
  }
  function pontoFoto(e) {
    const c = $('#fa-canvas'), b = c.getBoundingClientRect();
    return [(e.clientX - b.left) / b.width * foto.width, (e.clientY - b.top) / b.height * foto.height];
  }
  function iniciarArrasto(e) {
    const c = $('#fa-canvas');
    c.setPointerCapture(e.pointerId);
    const [px, py] = pontoFoto(e);
    const tol = 30 / (c.getBoundingClientRect().width / foto.width); // 30px na tela
    const cantos = { nw: [ret.x, ret.y], ne: [ret.x + ret.w, ret.y], sw: [ret.x, ret.y + ret.h], se: [ret.x + ret.w, ret.y + ret.h] };
    let modo = null;
    for (const k in cantos) if (Math.hypot(px - cantos[k][0], py - cantos[k][1]) < tol) modo = k;
    if (!modo && px > ret.x && px < ret.x + ret.w && py > ret.y && py < ret.y + ret.h) modo = 'mover';
    if (!modo) { modo = 'se'; ret = { x: px, y: py, w: 1, h: 1 }; } // toque fora: começa um quadro novo
    arrasto = { modo, px, py, r0: Object.assign({}, ret) };
  }
  function moverArrasto(e) {
    if (!arrasto) return;
    const [px, py] = pontoFoto(e), dx = px - arrasto.px, dy = py - arrasto.py, r0 = arrasto.r0;
    let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
    if (arrasto.modo === 'mover') {
      const nx = Math.min(Math.max(0, x0 + dx), foto.width - r0.w), ny = Math.min(Math.max(0, y0 + dy), foto.height - r0.h);
      ret = { x: nx, y: ny, w: r0.w, h: r0.h };
    } else {
      if (arrasto.modo.includes('w')) x0 += dx; else x1 += dx;
      if (arrasto.modo.includes('n')) y0 += dy; else y1 += dy;
      x0 = Math.max(0, Math.min(x0, foto.width)); x1 = Math.max(0, Math.min(x1, foto.width));
      y0 = Math.max(0, Math.min(y0, foto.height)); y1 = Math.max(0, Math.min(y1, foto.height));
      ret = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    }
    desenharRecorte();
  }

  function recorteDaFoto() {
    const r = Math.min(1, MAX_SAIDA / Math.max(ret.w, ret.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(ret.w * r)); c.height = Math.max(1, Math.round(ret.h * r));
    c.getContext('2d').drawImage(foto, ret.x, ret.y, ret.w, ret.h, 0, 0, c.width, c.height);
    return c;
  }
  let recorteCache;
  function processar() {
    if (!recorteCache) recorteCache = recorteDaFoto();
    resultado = limpar(recorteCache, Number($('#fa-intens').value));
    const prev = $('#fa-previa');
    $('#fa-vazio').hidden = !!resultado;
    prev.hidden = !resultado;
    $('#fa-usar').disabled = !resultado;
    if (resultado) prev.src = resultado.toDataURL('image/png');
  }

  function iniciar() {
    $('#btn-foto-assin').addEventListener('click', () => $('#in-foto-assin').click());
    $('#in-foto-assin').addEventListener('change', (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) abrir(f, global.AssinaturaFoto.aoUsar).catch(() => alert('Não consegui abrir essa foto.'));
    });
    const c = $('#fa-canvas');
    c.addEventListener('pointerdown', iniciarArrasto);
    c.addEventListener('pointermove', moverArrasto);
    ['pointerup', 'pointercancel'].forEach((ev) => c.addEventListener(ev, () => (arrasto = null)));
    $('#fa-cancelar').addEventListener('click', fechar);
    $('#fa-proximo').addEventListener('click', () => {
      if (ret.w < 20 || ret.h < 10) { alert('O quadro está pequeno demais. Arraste os cantos em volta da assinatura.'); return; }
      recorteCache = null; irPara('ajuste');
    });
    $('#fa-voltar').addEventListener('click', () => irPara('recorte'));
    let espera;
    $('#fa-intens').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(processar, 60); });
    $('#fa-usar').addEventListener('click', () => {
      if (!resultado) return;
      const url = resultado.toDataURL('image/png');
      fechar();
      if (aoUsar) aoUsar(url);
    });
    window.addEventListener('resize', () => { if (foto && etapa === 'recorte') desenharRecorte(); });
  }

  global.AssinaturaFoto = { iniciar, limpar, aoUsar: null };
})(window);
