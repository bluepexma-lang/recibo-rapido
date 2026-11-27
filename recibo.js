// Desenha o recibo (e as páginas de fotos) em canvas A4, que depois vira PDF.
(function (global) {
  const W = 1240, H = 1754, M = 110; // A4 a 150 dpi
  const FONTE = 'Helvetica, Arial, sans-serif';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'];

  const moeda = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = (n) => String(n).padStart(4, '0');
  function dataExtenso(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return d + ' de ' + MESES[m - 1] + ' de ' + a;
  }

  function carregarImagem(src) {
    return new Promise((ok, erro) => {
      if (!src) return ok(null);
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = erro;
      i.src = src;
    });
  }

  function quebrarLinhas(ctx, texto, largura) {
    const linhas = [];
    texto.split('\n').forEach((par) => {
      const palavras = par.split(/\s+/).filter(Boolean);
      let linha = '';
      palavras.forEach((p) => {
        const teste = linha ? linha + ' ' + p : p;
        if (ctx.measureText(teste).width > largura && linha) { linhas.push(linha); linha = p; }
        else linha = teste;
      });
      linhas.push(linha);
    });
    return linhas;
  }

  function encaixar(img, maxL, maxA) {
    const r = Math.min(maxL / img.width, maxA / img.height);
    return { l: img.width * r, a: img.height * r };
  }

  function novoCanvas() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.textBaseline = 'alphabetic';
    return { c, ctx };
  }

  async function paginaRecibo(r) {
    const p = r.prestador;
    const { c, ctx } = novoCanvas();
    const [logo, assinatura] = await Promise.all([carregarImagem(p.logo), carregarImagem(p.assinatura)]);

    // Cabeçalho
    let x = M, y = M;
    let alturaCab = 0;
    if (logo) {
      const t = encaixar(logo, 230, 150);
      ctx.drawImage(logo, M, M, t.l, t.a);
      x = M + t.l + 40;
      alturaCab = t.a;
    }
    ctx.font = 'bold 36px ' + FONTE;
    ctx.fillText(p.nome, x, y + 36);
    ctx.font = '24px ' + FONTE;
    ctx.fillStyle = '#444';
    let yl = y + 36;
    [p.documento && 'CPF/CNPJ: ' + p.documento, p.telefone, p.endereco].filter(Boolean).forEach((t) => {
      yl += 34; ctx.fillText(t, x, yl);
    });
    ctx.fillStyle = '#111';
    y = Math.max(y + alturaCab, yl) + 40;
    ctx.fillRect(M, y, W - 2 * M, 3);

    // Título, número e valor
    y += 110;
    ctx.font = 'bold 72px ' + FONTE;
    ctx.fillText('RECIBO', M, y);
    ctx.font = '28px ' + FONTE;
    ctx.fillStyle = '#555';
    ctx.fillText('Nº ' + numero(r.numero), M, y + 48);
    ctx.fillStyle = '#111';
    // caixa do valor
    const txtValor = moeda(r.valor);
    ctx.font = 'bold 48px ' + FONTE;
    const lv = ctx.measureText(txtValor).width + 60;
    ctx.lineWidth = 3;
    ctx.strokeRect(W - M - lv, y - 70, lv, 100);
    ctx.fillText(txtValor, W - M - lv + 30, y);
    y += 140;

    // Corpo
    const doc = r.cliente.documento ? ', CPF/CNPJ ' + r.cliente.documento + ',' : '';
    const pag = r.pagamento ? ' Forma de pagamento: ' + r.pagamento + '.' : '';
    const corpo = 'Recebi de ' + r.cliente.nome + doc + ' a importância de ' + txtValor +
      ' (' + valorPorExtenso(r.valor) + '), referente ao seguinte serviço:\n' +
      r.servico.trim() + '\n' + pag.trim() +
      (r.fotos && r.fotos.length ? '\nFotos do serviço em anexo (' + r.fotos.length + ').' : '') +
      '\nPara clareza, firmo o presente recibo.';

    // reduz a fonte se o texto for muito longo
    const limite = H - M - 420 - y;
    let tam = 32, linhas, lh;
    do {
      ctx.font = tam + 'px ' + FONTE;
      lh = Math.round(tam * 1.5);
      linhas = quebrarLinhas(ctx, corpo, W - 2 * M);
      if (linhas.length * lh <= limite) break;
      tam -= 2;
    } while (tam > 16);
    linhas.forEach((l) => { ctx.fillText(l, M, y); y += lh; });

    // Local e data
    y += 50;
    ctx.font = '30px ' + FONTE;
    const local = (r.cidade ? r.cidade + ', ' : '') + dataExtenso(r.data) + '.';
    ctx.fillText(local, W - M - ctx.measureText(local).width, y);

    // Assinatura do prestador
    const yLinha = Math.max(y + 230, H - M - 170);
    if (assinatura) {
      const t = encaixar(assinatura, 520, 170);
      ctx.drawImage(assinatura, (W - t.l) / 2, yLinha - t.a - 6, t.l, t.a);
    }
    ctx.fillRect(W / 2 - 300, yLinha, 600, 2);
    ctx.font = 'bold 28px ' + FONTE;
    ctx.textAlign = 'center';
    ctx.fillText(p.nome, W / 2, yLinha + 40);
    if (p.documento) {
      ctx.font = '24px ' + FONTE;
      ctx.fillText('CPF/CNPJ: ' + p.documento, W / 2, yLinha + 74);
    }
    ctx.textAlign = 'left';
    return c;
  }

  async function paginasFotos(r) {
    const paginas = [];
    const fotos = r.fotos || [];
    for (let i = 0; i < fotos.length; i += 4) {
      const { c, ctx } = novoCanvas();
      ctx.font = 'bold 32px ' + FONTE;
      ctx.fillText('Fotos do serviço: recibo nº ' + numero(r.numero), M, M + 32);
      ctx.font = '24px ' + FONTE;
      ctx.fillStyle = '#555';
      ctx.fillText(r.prestador.nome + ' · ' + r.cliente.nome, M, M + 72);
      const grupo = fotos.slice(i, i + 4);
      const topo = M + 110, gap = 30;
      const cl = (W - 2 * M - gap) / 2, ca = (H - topo - M - gap) / 2;
      const imgs = await Promise.all(grupo.map(carregarImagem));
      imgs.forEach((img, k) => {
        const cx = M + (k % 2) * (cl + gap), cy = topo + Math.floor(k / 2) * (ca + gap);
        const t = encaixar(img, cl, ca);
        ctx.drawImage(img, cx + (cl - t.l) / 2, cy + (ca - t.a) / 2, t.l, t.a);
      });
      paginas.push(c);
    }
    return paginas;
  }

  async function gerarPdfRecibo(r) {
    const canvases = [await paginaRecibo(r), ...(await paginasFotos(r))];
    const paginas = canvases.map((c) => ({ jpeg: c.toDataURL('image/jpeg', 0.88), largura: W, altura: H }));
    return { blob: montarPdf(paginas), previa: paginas.map((p) => p.jpeg) };
  }

  global.Recibo = { gerarPdfRecibo, moeda, numero, dataExtenso };
})(window);
