// Valor em reais por extenso (pt-BR). Ex.: 150.5 -> "cento e cinquenta reais e cinquenta centavos"
(function (global) {
  const UNID = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
    'setecentos', 'oitocentos', 'novecentos'];

  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, partes = [];
    if (c) partes.push(CEM[c]);
    if (r > 0 && r < 20) partes.push(UNID[r]);
    else if (r >= 20) {
      const d = Math.floor(r / 10), u = r % 10;
      partes.push(u ? DEZ[d] + ' e ' + UNID[u] : DEZ[d]);
    }
    return partes.join(' e ');
  }

  function inteiro(n) {
    if (n === 0) return 'zero';
    const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    const grupos = [];
    let x = n;
    while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
    const pedacos = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i];
      if (!g) continue;
      let t;
      if (i === 0) t = ate999(g);
      else if (i === 1) t = g === 1 ? 'mil' : ate999(g) + ' mil';
      else t = ate999(g) + ' ' + (g === 1 ? nomes[i][0] : nomes[i][1]);
      pedacos.push({ t, g, i });
    }
    let out = pedacos[0].t;
    for (let k = 1; k < pedacos.length; k++) {
      const p = pedacos[k], ultimo = k === pedacos.length - 1;
      const usaE = ultimo && (p.g < 100 || p.g % 100 === 0);
      out += (usaE ? ' e ' : ' ') + p.t;
    }
    return out;
  }

  function reais(centavosTotal) {
    const int = Math.floor(centavosTotal / 100), cent = centavosTotal % 100;
    let r = '', c = '';
    if (int > 0) {
      const de = int >= 1000000 && int % 1000000 === 0 ? ' de' : '';
      r = inteiro(int) + de + (int === 1 ? ' real' : ' reais');
    }
    if (cent > 0) c = inteiro(cent) + (cent === 1 ? ' centavo' : ' centavos');
    if (r && c) return r + ' e ' + c;
    return r || c || 'zero real';
  }

  global.valorPorExtenso = reais;
  if (typeof module !== 'undefined') module.exports = { valorPorExtenso: reais };
})(typeof window !== 'undefined' ? window : globalThis);
