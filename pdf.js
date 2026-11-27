// Gera um PDF (A4) a partir de imagens JPEG, uma por página. Sem bibliotecas externas, funciona offline.
(function (global) {
  function dataUrlParaBytes(dataUrl) {
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // paginas: [{ jpeg: dataURL, largura: px, altura: px }]
  function montarPdf(paginas) {
    const enc = new TextEncoder();
    const partes = [];
    const offsets = [];
    let tamanho = 0;
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); tamanho += b.length; };
    const obj = (n, corpo) => { offsets[n] = tamanho; add(n + ' 0 obj\n'); corpo(); add('\nendobj\n'); };

    const W = 595.28, H = 841.89; // A4 em pontos
    const n = paginas.length;
    // 1 = catálogo, 2 = páginas; cada página usa 3 objetos (página, imagem, conteúdo)
    const idPagina = (i) => 3 + i * 3;

    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add('<< /Type /Pages /Count ' + n + ' /Kids [' +
      paginas.map((_, i) => idPagina(i) + ' 0 R').join(' ') + '] >>'));

    paginas.forEach((p, i) => {
      const pg = idPagina(i), img = pg + 1, cont = pg + 2;
      const jpg = dataUrlParaBytes(p.jpeg);
      const conteudo = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
      obj(pg, () => add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] ' +
        '/Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + cont + ' 0 R >>'));
      obj(img, () => {
        add('<< /Type /XObject /Subtype /Image /Width ' + p.largura + ' /Height ' + p.altura +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
        add(jpg);
        add('\nendstream');
      });
      obj(cont, () => add('<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream'));
    });

    const total = 3 + n * 3;
    const inicioXref = tamanho;
    let xref = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    add(xref);
    add('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF');

    return new Blob(partes, { type: 'application/pdf' });
  }

  global.montarPdf = montarPdf;
})(window);
