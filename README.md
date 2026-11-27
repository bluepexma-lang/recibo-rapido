# iAris Gerador de Recibos

**O que é:** app web instalável (PWA) pra emitir recibo assinado no celular, logo depois de terminar o serviço.
**Pra quem:** prestador de serviço (eletricista, encanador, técnico, diarista etc.).

## O que faz
- Cadastro do prestador uma vez só: nome, CPF/CNPJ, telefone, endereço, cidade, **logo** e **assinatura com o dedo**
  ou **fotografada do papel**: recorte manual, fundo limpo automático (transparente), traço azul, ajuste de intensidade.
- Recibo com **numeração automática** (0001, 0002…), **valor por extenso**, forma de pagamento, data e cidade.
- **Fotos do serviço** (até 12), que vão em páginas anexas do PDF, 4 por página.
- Gera **PDF A4** e envia por WhatsApp, e-mail etc. pelo menu de compartilhar do celular, ou baixa o arquivo.
- Histórico com busca e opção de reabrir ou apagar.
- **Tudo fica só no aparelho** (sem servidor, sem login). Tem exportar/importar cópia de segurança (.json).
- Funciona **sem internet** depois do primeiro acesso.

## Como rodar (teste no PC)
```
cd recibos
python -m http.server 8765
```
Abrir http://localhost:8765

## Como colocar no celular
O celular só instala o app (e só funciona offline) se ele estiver num endereço **https**. Qualquer hospedagem de
site estático serve (GitHub Pages, Netlify, Cloudflare Pages: todas grátis). É só subir esta pasta inteira.
No celular: abrir o link no Chrome, menu **⋮**, **Adicionar à tela inicial**. No iPhone: Safari, **Compartilhar**,
**Adicionar à Tela de Início**.

## Arquivos
| Arquivo | Pra quê |
|---|---|
| `index.html`, `style.css` | telas |
| `app.js` | lógica: dados, assinatura, histórico, envio |
| `recibo.js` | desenho do recibo e das páginas de fotos |
| `pdf.js` | monta o PDF (sem biblioteca externa) |
| `extenso.js` | valor por extenso |
| `assinatura-foto.js` | assinatura pela câmera: recorte e limpeza do fundo |
| `sw.js`, `manifest.json`, `icon-*.png` | instalação e funcionamento offline |

**Ao alterar qualquer arquivo**, aumente `VERSAO` em `sw.js`, senão os celulares continuam com a versão antiga.

## Limitações conhecidas
- O texto do PDF é imagem (não dá pra selecionar/copiar). O arquivo fica com uns 200–400 KB por página.
- Se o usuário limpar os dados do navegador, perde o histórico. Por isso a cópia de segurança.
- Em navegador de computador, "Enviar" normalmente só baixa o PDF (o envio direto é recurso do celular).
- Recibo emitido não se edita: se errou, apaga e emite outro.
