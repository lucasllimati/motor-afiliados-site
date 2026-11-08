// Vitrine de achados: lê achados.json (gerado pelo motor) e monta a lista numerada.
// Tudo com textContent (nunca innerHTML): o conteúdo vem de anúncios de terceiros.
// Os cartões são criados uma vez só; busca, filtros e ordem apenas mostram, escondem e reordenam
// (resposta instantânea, sem baixar imagem de novo).
// Campos novos do JSON (categoria, desconto, preco_antes, preco_em, indisponivel, video) são
// opcionais: sem eles, o recurso correspondente simplesmente não aparece.
"use strict";

(function () {
  var lista = document.getElementById("lista");
  var estado = document.getElementById("estado");
  var busca = document.getElementById("busca");
  var limpar = document.getElementById("limpar");
  var acao = document.getElementById("acao");
  var secao = document.getElementById("achados");
  var filtros = document.getElementById("filtros");
  var faixas = document.getElementById("faixas");
  var categorias = document.getElementById("categorias");
  var colecoes = document.getElementById("colecoes");
  var ordem = document.getElementById("ordem");
  var detalhe = document.getElementById("detalhe");
  var topo = document.getElementById("topo");
  var medir = window.medir || function () {};

  var FAIXAS = [20, 30, 50];
  var DIAS_DE_NOVO = 1; // hoje e ontem
  var ESPERA_FOTO_MS = 450; // quem digita "12" passa pelo "1": só baixa a foto grande ao parar
  var CONVITE_DEPOIS_DE = 8;
  var TELEGRAM = "https://t.me/achadinhospicks";
  var LOJAS = { shopee: "Shopee", amazon: "Amazon" };
  var MESES = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

  // Como cada ordem compara dois cartões; empate fica com o mais novo.
  var ORDENS = {
    novos: function () { return 0; },
    preco: function (a, b) { return precoOuFim(a) - precoOuFim(b); },
    vendas: function (a, b) { return (b.item.vendas || 0) - (a.item.vendas || 0); },
    nota: function (a, b) {
      return (b.item.nota || 0) - (a.item.nota || 0) || (b.item.vendas || 0) - (a.item.vendas || 0);
    },
  };
  var LEGENDA_ORDEM = {
    novos: "do mais novo para o mais antigo",
    preco: "do menor para o maior preço",
    vendas: "dos mais vendidos para os menos",
    nota: "das melhores notas para as menores",
  };

  // Coleções prontas para usar em links (?colecao=natal). Só aparecem com 3 achados ou mais.
  var COLECOES = [
    { id: "natal", titulo: "Natal", palavras: /natal|pisca|papai noel|enfeite|presepio|guirlanda|arvore de/ },
    { id: "presentes", titulo: "Presentes até R$ 50", ate: 50, notaMinima: 4.7 },
    { id: "cozinha", titulo: "Cozinha", palavras: /cozinha|panela|faca|pote|copo|garrafa|talher|tabua|escorredor|mixer|batedor|chaleira|louca|xicara/ },
    { id: "ate-20", titulo: "Até R$ 20", ate: 20 },
  ];
  var MINIMO_COLECAO = 3;

  var cartoes = [];
  var maiorNumero = 0;
  var dataMaisRecente = "";
  var limitePreco = 0;
  var categoriaAtiva = "todas";
  var colecaoAtiva = null;
  var aoAgir = null;
  var timerFoto = null;
  var convite = null;
  var favoritos = lerGuardado("achados:favoritos");
  var vistos = lerGuardado("achados:vistos");

  // ---------- guardado no aparelho (pode falhar: aba anônima, bloqueio) ----------

  function lerGuardado(chave) {
    try {
      var valor = JSON.parse(localStorage.getItem(chave) || "[]");
      return Array.isArray(valor) ? valor.filter(function (n) { return typeof n === "number"; }) : [];
    } catch (e) {
      return [];
    }
  }

  function guardar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor.slice(-300)));
    } catch (e) {
      // Sem armazenamento, o recurso vale só nesta visita.
    }
  }

  // ---------- formatos ----------

  function temPreco(item) {
    return item.preco !== null && item.preco !== undefined;
  }

  // Sem preço (ex.: Amazon) vai para o fim quando a ordem é por preço.
  function precoOuFim(cartao) {
    return temPreco(cartao.item) ? cartao.item.preco : Infinity;
  }

  function preco(valor) {
    if (valor === null || valor === undefined) return "";
    return "R$ " + Number(valor).toFixed(2).replace(".", ",");
  }

  function vendidos(n) {
    if (n < 1000) return n + " vendidos";
    var mil = (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(".", ",").replace(/,0$/, "");
    return mil + " mil vendidos";
  }

  // "2026-11-04" vira "4 de nov.": com o mês escrito, fica claro que é uma data.
  function dataCurta(data) {
    var partes = /^\d{4}-(\d{2})-(\d{2})/.exec(data || "");
    var mes = partes && MESES[Number(partes[1]) - 1];
    return mes ? Number(partes[2]) + " de " + mes : "";
  }

  function dataDoPreco(item) {
    return dataCurta(item.preco_em || item.data);
  }

  // "Preço visto em 8 de nov." já termina em ponto: não repete antes da frase seguinte.
  function frase(texto) {
    return /[.!?]$/.test(texto) ? texto : texto + ".";
  }

  // Só o lote mais recente, e só enquanto for de hoje ou ontem: selo em tudo não diz nada.
  function ehNovo(data) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || "");
    if (!partes || data !== dataMaisRecente) return false;
    var dia = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    return (Date.now() - dia.getTime()) / 86400000 < DIAS_DE_NOVO + 1;
  }

  function semAcento(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // "copos" acha "copo" e "termicos" acha "termico": tira o plural simples.
  function raiz(palavra) {
    if (palavra.length > 4 && /oes$/.test(palavra)) return palavra.slice(0, -3);
    if (palavra.length > 4 && /[rsz]es$/.test(palavra)) return palavra.slice(0, -2);
    if (palavra.length > 3 && /s$/.test(palavra)) return palavra.slice(0, -1);
    return palavra;
  }

  function slug(texto) {
    return semAcento(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function loja(item) {
    return LOJAS[item.plataforma] || "Shopee";
  }

  // Miniatura da Shopee: ~20 KB em vez de ~400 KB da foto cheia.
  function miniatura(url) {
    return /^https:\/\/cf\.shopee\.com\.br\/file\/[^_/]+$/.test(url) ? url + "_tn" : url;
  }

  function linkSeguro(url) {
    return /^https:\/\//.test(url || "") ? url : null;
  }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  // ---------- cartões ----------

  function blocoDePreco(item, alvo) {
    if (!temPreco(item)) {
      alvo.append(elemento("p", "sem-preco", "Veja o preço na " + loja(item)));
      return;
    }
    var linha = elemento("p", "preco", preco(item.preco));
    if (item.desconto) linha.append(elemento("span", "desconto", "−" + item.desconto + "%"));
    alvo.append(linha);
    if (item.preco_antes) alvo.append(elemento("p", "antes", "Baixou de " + preco(item.preco_antes)));
  }

  function criarCartao(item, posicao) {
    var li = elemento("li", "achado");
    li.id = "achado-" + item.numero;
    if (item.indisponivel) li.classList.add("fora");

    // Link (e não botão): pode conter título e parágrafos, e "abrir em nova aba" leva ao achado.
    var abrir = elemento("a", "abrir");
    abrir.href = "#" + item.numero;
    abrir.setAttribute("aria-haspopup", "dialog");

    var foto = document.createElement("img");
    foto.src = miniatura(item.imagem);
    foto.alt = "";
    foto.width = 300;
    foto.height = 300;
    foto.decoding = "async";
    // As primeiras aparecem sem rolar a tela no celular; as outras só quando chegar perto.
    if (posicao > 3) foto.loading = "lazy";
    if (posicao < 2) foto.fetchPriority = "high";

    var moldura = elemento("div", "foto");
    moldura.append(foto, elemento("span", "selo", "Nº " + item.numero));
    if (item.indisponivel) moldura.append(elemento("span", "novo aviso-fora", "Fora do ar"));
    else if (ehNovo(item.data)) moldura.append(elemento("span", "novo", "Novo"));
    if (linkSeguro(item.video)) moldura.append(elemento("span", "tem-video", "▶ Vídeo"));

    var dados = elemento("p", "dados");
    if (item.nota) {
      dados.append(elemento("span", "estrelas", "★ " + String(item.nota).replace(".", ",")));
    }
    if (item.vendas) dados.append(elemento("span", "", vendidos(item.vendas)));
    // Sem preço (ex.: Amazon, por regra do programa), não há data de preço a mostrar.
    var quando = null;
    if (temPreco(item) && dataDoPreco(item)) {
      quando = elemento("span", "quando", "Preço visto em " + dataDoPreco(item));
      dados.append(quando);
    }
    var visto = elemento("span", "visto", "Você já viu");
    dados.append(visto);

    abrir.append(moldura, elemento("h3", "", item.nome));
    blocoDePreco(item, abrir);
    abrir.append(dados);

    var acoes = elemento("div", "acoes");
    var ir = elemento("a", "ir", item.indisponivel ? "Ver na loja" : "Ver oferta");
    ir.href = item.link;
    ir.rel = "sponsored nofollow noopener";
    ir.target = "_blank";
    var fav = elemento("button", "fav");
    fav.type = "button";
    fav.setAttribute("aria-label", "Guardar o achado nº " + item.numero + " nos favoritos");
    fav.append(coracao());
    acoes.append(ir, fav);
    li.append(abrir, acoes);

    var cartao = {
      item: item, li: li, foto: foto, ir: ir, fav: fav, visto: visto, quando: quando,
      chave: semAcento(item.nome), slugCategoria: slug(item.categoria || ""),
    };

    if (navigator.share || navigator.clipboard) {
      var botao = elemento("button", "compartilhar", "Compartilhar");
      botao.type = "button";
      botao.addEventListener("click", function () {
        compartilhar(item, botao);
      });
      li.append(botao);
    }
    abrir.addEventListener("click", function (evento) {
      evento.preventDefault();
      abrirDetalhe(cartao);
    });
    ir.addEventListener("click", function () { marcarVisto(cartao, "card"); });
    fav.addEventListener("click", function () { alternarFavorito(cartao); });
    return cartao;
  }

  function coracao() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z");
    svg.append(p);
    return svg;
  }

  function pintarFavorito(cartao) {
    cartao.fav.setAttribute("aria-pressed", String(favoritos.indexOf(cartao.item.numero) !== -1));
  }

  function pintarVisto(cartao) {
    cartao.visto.hidden = vistos.indexOf(cartao.item.numero) === -1;
  }

  function alternarFavorito(cartao) {
    var n = cartao.item.numero;
    var i = favoritos.indexOf(n);
    if (i === -1) favoritos.push(n); else favoritos.splice(i, 1);
    guardar("achados:favoritos", favoritos);
    pintarFavorito(cartao);
    contarCategorias();
    medir("favorito", { numero: n, ligado: i === -1 });
    if (categoriaAtiva === "favoritos") mostrar();
  }

  function marcarVisto(cartao, origem) {
    var n = cartao.item.numero;
    if (vistos.indexOf(n) === -1) {
      vistos.push(n);
      guardar("achados:vistos", vistos);
    }
    pintarVisto(cartao);
    medir("oferta", { numero: n, origem: origem });
  }

  // Abre o compartilhamento do celular; sem ele, copia o link do achado.
  function compartilhar(item, botao) {
    var url = location.origin + location.pathname + "#" + item.numero;
    var titulo = "Achado nº " + item.numero + ": " + item.nome;
    medir("compartilhar", { numero: item.numero });
    if (navigator.share) {
      navigator.share({ title: titulo, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        botao.textContent = "Link copiado";
      });
    }
  }

  // ---------- painel de detalhes ----------

  function abrirDetalhe(cartao) {
    var item = cartao.item;
    var corpo = detalhe.querySelector(".corpo");
    var foto = document.createElement("img");
    foto.src = item.imagem;
    foto.alt = "";
    foto.width = 600;
    foto.height = 600;
    var moldura = elemento("div", "foto");
    moldura.append(foto, elemento("span", "selo", "Nº " + item.numero));

    var nome = elemento("h2", "", item.nome);
    nome.id = "detalhe-nome";
    var info = elemento("div", "info");
    if (item.categoria) info.append(elemento("p", "categoria", item.categoria));
    info.append(nome);
    blocoDePreco(item, info);
    var dados = elemento("p", "dados");
    if (item.nota) dados.append(elemento("span", "estrelas", "★ " + String(item.nota).replace(".", ",")));
    if (item.vendas) dados.append(elemento("span", "", vendidos(item.vendas)));
    info.append(dados);
    if (temPreco(item) && dataDoPreco(item)) {
      info.append(elemento("p", "aviso-preco", frase("Preço visto em " + dataDoPreco(item)) + " Pode ter mudado na loja: confira antes de pagar."));
    }
    if (item.indisponivel) {
      info.append(elemento("p", "aviso-fora-texto", "Esta oferta saiu do ar na última conferência. Ela pode voltar."));
    }

    var comprar = elemento("a", "comprar", (item.indisponivel ? "Ver na " : "Ver oferta na ") + loja(item));
    comprar.href = item.link;
    comprar.rel = "sponsored nofollow noopener";
    comprar.target = "_blank";
    comprar.addEventListener("click", function () { marcarVisto(cartao, "detalhe"); });
    var botoes = elemento("div", "botoes");
    botoes.append(comprar);
    var video = linkSeguro(item.video);
    if (video) {
      var verVideo = elemento("a", "video", "▶ Ver o vídeo");
      verVideo.href = video;
      verVideo.rel = "noopener";
      verVideo.target = "_blank";
      verVideo.addEventListener("click", function () { medir("video", { numero: item.numero }); });
      botoes.append(verVideo);
    }
    var fav = elemento("button", "fav-texto");
    fav.type = "button";
    function pintar() {
      var ligado = favoritos.indexOf(item.numero) !== -1;
      fav.textContent = ligado ? "♥ Nos favoritos" : "♡ Guardar nos favoritos";
      fav.setAttribute("aria-pressed", String(ligado));
    }
    pintar();
    fav.addEventListener("click", function () { alternarFavorito(cartao); pintar(); });
    botoes.append(fav);
    info.append(botoes);

    corpo.replaceChildren(moldura, info);
    if (typeof detalhe.showModal === "function") detalhe.showModal();
    else detalhe.setAttribute("open", "");
    medir("detalhe", { numero: item.numero });
  }

  function fecharDetalhe() {
    if (typeof detalhe.close === "function") detalhe.close();
    else detalhe.removeAttribute("open");
  }

  // ---------- filtros, categorias, coleções e ordem ----------

  function definirAcao(texto, funcao) {
    aoAgir = funcao || null;
    acao.textContent = texto || "";
    acao.hidden = !texto;
  }

  function verTodos() {
    busca.value = "";
    definirLimite(0);
    definirCategoria("todas");
    colecaoAtiva = null;
    pintarColecoes();
    ordem.value = "novos";
    ordenar();
    mostrar();
  }

  function definirLimite(valor) {
    limitePreco = valor;
    faixas.querySelectorAll("[data-ate]").forEach(function (b) {
      var ativo = Number(b.dataset.ate) === valor;
      b.setAttribute("aria-pressed", String(ativo));
      if (ativo) mostrarBotao(b);
    });
  }

  function definirCategoria(valor) {
    categoriaAtiva = valor;
    categorias.querySelectorAll("[data-cat]").forEach(function (b) {
      var ativo = b.dataset.cat === valor;
      b.setAttribute("aria-pressed", String(ativo));
      if (ativo) mostrarBotao(b);
    });
  }

  // No celular as linhas de botões rolam de lado: o escolhido não pode ficar fora da tela.
  function mostrarBotao(botao) {
    var linha = botao.parentNode;
    var inicio = botao.offsetLeft;
    var fim = inicio + botao.offsetWidth;
    if (inicio < linha.scrollLeft || fim > linha.scrollLeft + linha.clientWidth) {
      linha.scrollLeft = Math.max(0, fim - linha.clientWidth + 16);
    }
  }

  function botaoDeFiltro(rotulo, atributo, valor) {
    var b = elemento("button", "", rotulo);
    b.type = "button";
    b.dataset[atributo] = valor;
    b.setAttribute("aria-pressed", "false");
    b.append(elemento("span", "conta"));
    return b;
  }

  function rotular(botao, n) {
    var rotulo = botao.firstChild.textContent;
    botao.querySelector(".conta").textContent = String(n);
    botao.setAttribute("aria-label", rotulo + ", " + n + (n === 1 ? " achado" : " achados"));
  }

  // Quantos achados há em cada faixa; faixa vazia some.
  function contarFaixas() {
    faixas.querySelectorAll("[data-ate]").forEach(function (b) {
      var ate = Number(b.dataset.ate);
      var n = cartoes.filter(function (c) {
        return !ate || (temPreco(c.item) && c.item.preco <= ate);
      }).length;
      rotular(b, n);
      b.hidden = Boolean(ate) && n === 0;
    });
  }

  // Botões de categoria a partir dos dados; só aparecem com 2 categorias ou mais.
  function montarCategorias() {
    var nomes = {};
    cartoes.forEach(function (c) {
      if (c.item.categoria) nomes[c.item.categoria] = (nomes[c.item.categoria] || 0) + 1;
    });
    var ordenadas = Object.keys(nomes).sort(function (a, b) {
      if (a === "Outros") return 1;
      if (b === "Outros") return -1;
      return nomes[b] - nomes[a] || a.localeCompare(b);
    });
    var botoes = [botaoDeFiltro("Todas", "cat", "todas"), botaoDeFiltro("♥ Favoritos", "cat", "favoritos")];
    if (ordenadas.length >= 2) {
      ordenadas.forEach(function (nome) { botoes.push(botaoDeFiltro(nome, "cat", slug(nome))); });
    }
    categorias.replaceChildren.apply(categorias, botoes);
    contarCategorias();
  }

  function contarCategorias() {
    var temCategorias = categorias.querySelectorAll("[data-cat]").length > 2;
    categorias.querySelectorAll("[data-cat]").forEach(function (b) {
      var cat = b.dataset.cat;
      var n = cartoes.filter(function (c) { return combinaCategoria(c, cat); }).length;
      rotular(b, n);
      if (cat === "favoritos") b.hidden = n === 0;
    });
    var favs = categorias.querySelector('[data-cat="favoritos"]');
    categorias.hidden = !temCategorias && (!favs || favs.hidden);
    if (favs && favs.hidden && categoriaAtiva === "favoritos") definirCategoria("todas");
  }

  function combinaCategoria(c, cat) {
    if (!cat || cat === "todas") return true;
    if (cat === "favoritos") return favoritos.indexOf(c.item.numero) !== -1;
    return c.slugCategoria === cat;
  }

  function combinaColecao(c, colecao) {
    if (!colecao) return true;
    if (colecao.ate && !(temPreco(c.item) && c.item.preco <= colecao.ate)) return false;
    if (colecao.notaMinima && !((c.item.nota || 0) >= colecao.notaMinima)) return false;
    if (colecao.palavras && !colecao.palavras.test(c.chave)) return false;
    return !c.item.indisponivel;
  }

  function montarColecoes() {
    var links = COLECOES.filter(function (col) {
      return cartoes.filter(function (c) { return combinaColecao(c, col); }).length >= MINIMO_COLECAO;
    }).map(function (col) {
      var a = elemento("a", "", col.titulo);
      a.href = "?colecao=" + col.id;
      a.dataset.colecao = col.id;
      a.addEventListener("click", function (evento) {
        evento.preventDefault();
        colecaoAtiva = colecaoAtiva === col ? null : col;
        pintarColecoes();
        medir("colecao", { id: col.id });
        aoDigitar();
      });
      return a;
    });
    var titulo = elemento("span", "rotulo", "Coleções");
    colecoes.replaceChildren.apply(colecoes, [titulo].concat(links));
    colecoes.hidden = links.length === 0;
    pintarColecoes();
  }

  function pintarColecoes() {
    colecoes.querySelectorAll("[data-colecao]").forEach(function (a) {
      if (colecaoAtiva && a.dataset.colecao === colecaoAtiva.id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  function ordenar() {
    var comparar = ORDENS[ordem.value] || ORDENS.novos;
    var ordenados = cartoes.slice().sort(function (a, b) {
      // Oferta fora do ar fica sempre por último.
      return (a.item.indisponivel ? 1 : 0) - (b.item.indisponivel ? 1 : 0) ||
        comparar(a, b) || b.item.numero - a.item.numero;
    });
    var itens = ordenados.map(function (c) { return c.li; });
    if (convite) itens.splice(Math.min(CONVITE_DEPOIS_DE, itens.length), 0, convite);
    lista.append.apply(lista, itens);
  }

  function criarConvite() {
    var li = elemento("li", "convite");
    li.append(
      elemento("p", "titulo", "Quer receber os próximos achados?"),
      elemento("p", "", "Cada achado novo chega no canal do Telegram, com foto e link.")
    );
    var a = elemento("a", "", "Entrar no canal");
    a.href = TELEGRAM;
    a.rel = "noopener";
    a.addEventListener("click", function () { medir("telegram", { origem: "lista" }); });
    li.append(a);
    return li;
  }

  // ---------- endereço ----------

  // Faixa, ordem, categoria e coleção ficam no endereço: o link compartilhado abre do mesmo jeito.
  function atualizarEndereco(numero) {
    var p = new URLSearchParams();
    if (limitePreco) p.set("ate", String(limitePreco));
    if (ordem.value !== "novos") p.set("ordem", ordem.value);
    if (categoriaAtiva !== "todas" && categoriaAtiva !== "favoritos") p.set("cat", categoriaAtiva);
    if (colecaoAtiva) p.set("colecao", colecaoAtiva.id);
    var consulta = p.toString() ? "?" + p.toString() : "";
    history.replaceState(null, "", location.pathname + consulta + (numero ? "#" + numero : ""));
  }

  function lerFiltrosDoEndereco() {
    var p = new URLSearchParams(location.search);
    var ate = Number(p.get("ate"));
    definirLimite(FAIXAS.indexOf(ate) !== -1 ? ate : 0);
    ordem.value = ORDENS.hasOwnProperty(p.get("ordem")) ? p.get("ordem") : "novos";
    var cat = slug(p.get("cat") || "");
    var existe = cat && cat !== "favoritos" && categorias.querySelector('[data-cat="' + cat + '"]');
    definirCategoria(existe ? cat : "todas");
    colecaoAtiva = COLECOES.filter(function (c) { return c.id === p.get("colecao"); })[0] || null;
    pintarColecoes();
  }

  function lerEndereco() {
    var alvo = location.hash.replace("#", "");
    if (/^\d+$/.test(alvo)) busca.value = alvo;
  }

  // ---------- mostrar ----------

  function destacar(cartao) {
    clearTimeout(timerFoto);
    cartoes.forEach(function (c) {
      var ativo = c === cartao;
      c.li.classList.toggle("destaque", ativo);
      c.ir.textContent = c.item.indisponivel ? "Ver na loja" : ativo ? "Ver oferta na " + loja(c.item) : "Ver oferta";
      if (c.quando) {
        var visto = "Preço visto em " + dataDoPreco(c.item);
        c.quando.textContent = ativo ? frase(visto) + " Pode ter mudado na loja." : visto;
      }
    });
    if (cartao) {
      timerFoto = setTimeout(function () {
        // Troca só depois de baixar: a miniatura fica na tela até lá.
        var cheia = new Image();
        cheia.onload = function () {
          cartao.foto.src = cartao.item.imagem;
        };
        cheia.src = cartao.item.imagem;
      }, ESPERA_FOTO_MS);
    }
  }

  function combinaBusca(c, palavras) {
    return palavras.every(function (p) { return c.chave.indexOf(p) !== -1; });
  }

  function mostrar() {
    var texto = busca.value.trim();
    var termo = semAcento(texto).replace(/^n[ºo°]?\s*(?=\d)/, "").trim();
    var numerico = /^\d+$/.test(termo);
    var palavras = numerico ? [] : termo.split(/\s+/).filter(Boolean).map(raiz);
    var visiveis = 0;
    var exato = null;

    cartoes.forEach(function (c) {
      var ver = numerico ? c.item.numero === Number(termo) : combinaBusca(c, palavras);
      if (!numerico) {
        if (limitePreco && !(temPreco(c.item) && c.item.preco <= limitePreco)) ver = false;
        if (!combinaCategoria(c, categoriaAtiva)) ver = false;
        if (!combinaColecao(c, colecaoAtiva)) ver = false;
      }
      c.li.hidden = !ver;
      if (ver) {
        visiveis += 1;
        if (numerico) exato = c;
      }
    });
    destacar(exato);
    limpar.hidden = !texto;
    atualizarEndereco(exato ? exato.item.numero : null);
    definirAcao();
    filtros.hidden = !cartoes.length || numerico;
    colecoes.hidden = numerico || !colecoes.querySelector("[data-colecao]");
    if (convite) convite.hidden = Boolean(termo) || categoriaAtiva === "favoritos" || visiveis <= CONVITE_DEPOIS_DE;

    var filtrado = limitePreco || categoriaAtiva !== "todas" || colecaoAtiva;
    var sufixo = (colecaoAtiva ? " na coleção " + colecaoAtiva.titulo : "") +
      (limitePreco ? " até R$ " + limitePreco : "");

    if (!cartoes.length) {
      estado.textContent = "Os primeiros achados aparecem aqui em breve.";
    } else if (exato) {
      estado.textContent = "Achado nº " + exato.item.numero;
      definirAcao("Ver todos", verTodos);
    } else if (numerico) {
      estado.textContent = "Ainda não existe o achado nº " + Number(termo) + ". O mais recente é o nº " + maiorNumero + ".";
      definirAcao("Ver todos", verTodos);
    } else if (!visiveis) {
      estado.textContent = termo
        ? "Nenhum achado com “" + texto + "”" + sufixo + ". Tente o número mostrado no vídeo."
        : "Nenhum achado" + (sufixo || " com esses filtros") + " por enquanto.";
      definirAcao("Ver todos", verTodos);
    } else if (termo || filtrado) {
      estado.textContent = visiveis + (visiveis === 1 ? " achado" : " achados") +
        (sufixo || (visiveis === 1 ? " encontrado" : " encontrados"));
      definirAcao("Ver todos", verTodos);
    } else {
      estado.textContent = cartoes.length === 1
        ? "1 achado"
        : cartoes.length + " achados, " + LEGENDA_ORDEM[ordem.value];
    }
  }

  var timerMedida = null;
  function aoDigitar() {
    mostrar();
    // Rolou a lista e digitou: volta ao começo do resultado, sob a etiqueta fixa.
    var topoDaSecao = secao.getBoundingClientRect().top;
    if (topoDaSecao < 0) window.scrollBy(0, topoDaSecao - busca.form.offsetHeight - 16);
    // Mede o tipo de busca e quantos achou, nunca o texto digitado.
    clearTimeout(timerMedida);
    var termo = busca.value.trim();
    if (termo) {
      timerMedida = setTimeout(function () {
        medir("busca", {
          tipo: /^\D*\d+$/.test(termo) ? "numero" : "texto",
          resultados: cartoes.filter(function (c) { return !c.li.hidden; }).length,
        });
      }, 1200);
    }
  }

  // ---------- carregar ----------

  function carregar() {
    estado.textContent = "Carregando os achados…";
    definirAcao();
    // no-cache: confere com o servidor, mas reaproveita o arquivo quando ele não mudou.
    fetch("achados.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (dados) {
        var itens = Array.isArray(dados.itens) ? dados.itens : [];
        dataMaisRecente = itens.reduce(function (m, i) { return i.data > m ? i.data : m; }, "");
        cartoes = itens
          .filter(function (item) {
            return /^https:\/\//.test(item.link || "") && /^https:\/\//.test(item.imagem || "");
          })
          .map(criarCartao);
        cartoes.forEach(function (c) { pintarFavorito(c); pintarVisto(c); });
        maiorNumero = itens.reduce(function (m, i) { return Math.max(m, i.numero || 0); }, 0);
        convite = cartoes.length > CONVITE_DEPOIS_DE ? criarConvite() : null;
        lista.replaceChildren();
        contarFaixas();
        montarCategorias();
        montarColecoes();
        lerFiltrosDoEndereco();
        ordenar();
        lerEndereco();
        mostrar();
      })
      .catch(function () {
        lista.replaceChildren();
        estado.textContent = "Não foi possível carregar os achados. Confira sua conexão.";
        definirAcao("Tentar de novo", carregar);
      });
  }

  // ---------- eventos ----------

  busca.addEventListener("input", aoDigitar);
  busca.form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    aoDigitar();
    busca.blur(); // no celular, fecha o teclado e mostra o resultado
  });
  limpar.addEventListener("click", function () {
    busca.value = "";
    mostrar();
    busca.focus();
  });
  faixas.addEventListener("click", function (evento) {
    var botao = evento.target.closest("button");
    if (!botao) return;
    definirLimite(Number(botao.dataset.ate));
    medir("filtro", { ate: limitePreco });
    aoDigitar();
  });
  categorias.addEventListener("click", function (evento) {
    var botao = evento.target.closest("button");
    if (!botao) return;
    definirCategoria(botao.dataset.cat);
    medir("categoria", { cat: categoriaAtiva });
    aoDigitar();
  });
  ordem.addEventListener("change", function () {
    ordenar();
    medir("ordem", { ordem: ordem.value });
    aoDigitar();
  });
  acao.addEventListener("click", function () {
    if (aoAgir) aoAgir();
  });
  detalhe.querySelector(".fechar").addEventListener("click", fecharDetalhe);
  // Toque fora do painel fecha (o fundo é o próprio <dialog>).
  detalhe.addEventListener("click", function (evento) {
    if (evento.target === detalhe) fecharDetalhe();
  });
  window.addEventListener("hashchange", function () {
    lerEndereco();
    mostrar();
  });

  // Voltar ao topo: aparece depois de duas telas de rolagem (conta leve: roda a cada rolagem).
  window.addEventListener("scroll", function () {
    topo.hidden = window.scrollY < window.innerHeight * 2;
  }, { passive: true });
  topo.addEventListener("click", function () {
    var suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: suave ? "smooth" : "auto" });
  });

  carregar();
})();
