// Vitrine de achados: lê achados.json (gerado pelo motor) e monta a lista numerada.
// Tudo com textContent (nunca innerHTML): o conteúdo vem de anúncios de terceiros.
// Os cartões são criados uma vez só; a busca apenas mostra e esconde (resposta instantânea,
// sem baixar imagem de novo).
"use strict";

(function () {
  var lista = document.getElementById("lista");
  var estado = document.getElementById("estado");
  var busca = document.getElementById("busca");
  var limpar = document.getElementById("limpar");
  var acao = document.getElementById("acao");
  var secao = document.getElementById("achados");
  var filtros = document.getElementById("filtros");
  var ordem = document.getElementById("ordem");
  var FAIXAS = [20, 30, 50];
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
  var limitePreco = 0;
  var DIAS_DE_NOVO = 1; // hoje e ontem
  var dataMaisRecente = "";
  var ESPERA_FOTO_MS = 450; // quem digita "12" passa pelo "1": só baixa a foto grande ao parar
  var cartoes = [];
  var maiorNumero = 0;
  var aoAgir = null;
  var timerFoto = null;

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
  var MESES = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  function dataCurta(data) {
    var partes = /^\d{4}-(\d{2})-(\d{2})/.exec(data || "");
    var mes = partes && MESES[Number(partes[1]) - 1];
    return mes ? Number(partes[2]) + " de " + mes : "";
  }

  // Só o lote mais recente, e só enquanto for de hoje ou ontem: selo em tudo não diz nada.
  function ehNovo(data) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || "");
    if (!partes || data !== dataMaisRecente) return false;
    var dia = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    return (Date.now() - dia.getTime()) / 86400000 < DIAS_DE_NOVO + 1;
  }

  // Abre o compartilhamento do celular; sem ele, copia o link do achado.
  function compartilhar(item, botao) {
    var url = location.origin + location.pathname + "#" + item.numero;
    var titulo = "Achado nº " + item.numero + ": " + item.nome;
    if (navigator.share) {
      navigator.share({ title: titulo, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        botao.textContent = "Link copiado";
      });
    }
  }

  function semAcento(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Miniatura da Shopee: ~20 KB em vez de ~400 KB da foto cheia.
  function miniatura(url) {
    return /^https:\/\/cf\.shopee\.com\.br\/file\/[^_/]+$/.test(url) ? url + "_tn" : url;
  }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  // Sem o campo (arquivo antigo), o achado é da Shopee.
  var LOJAS = { shopee: "Shopee", amazon: "Amazon" };
  function loja(item) {
    return LOJAS[item.plataforma] || "Shopee";
  }

  function criarCartao(item, posicao) {
    var li = elemento("li", "achado");
    li.id = "achado-" + item.numero;

    var link = elemento("a");
    link.href = item.link;
    link.rel = "sponsored nofollow noopener";
    link.target = "_blank";

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
    if (ehNovo(item.data)) moldura.append(elemento("span", "novo", "Novo"));

    var dados = elemento("p", "dados");
    if (item.nota) {
      dados.append(elemento("span", "estrelas", "★ " + String(item.nota).replace(".", ",")));
    }
    if (item.vendas) dados.append(elemento("span", "", vendidos(item.vendas)));
    // Sem preço (ex.: Amazon, por regra do programa), não há data de preço a mostrar.
    if (temPreco(item) && dataCurta(item.data)) {
      dados.append(elemento("span", "quando", "Preço visto em " + dataCurta(item.data)));
    }

    link.append(
      moldura,
      elemento("h3", "", item.nome),
      temPreco(item)
        ? elemento("p", "preco", preco(item.preco))
        : elemento("p", "sem-preco", "Veja o preço na " + loja(item)),
      dados,
      elemento("span", "ir", "Ver oferta")
    );
    li.append(link);
    if (navigator.share || navigator.clipboard) {
      var botao = elemento("button", "compartilhar", "Compartilhar");
      botao.type = "button";
      botao.addEventListener("click", function () {
        compartilhar(item, botao);
      });
      li.append(botao);
    }
    return { item: item, li: li, foto: foto, ir: link.lastChild, chave: semAcento(item.nome) };
  }

  function definirAcao(texto, funcao) {
    aoAgir = funcao || null;
    acao.textContent = texto || "";
    acao.hidden = !texto;
  }

  function verTodos() {
    busca.value = "";
    definirLimite(0);
    ordem.value = "novos";
    ordenar();
    mostrar();
  }

  function ordenar() {
    var comparar = ORDENS[ordem.value] || ORDENS.novos;
    var ordenados = cartoes.slice().sort(function (a, b) {
      return comparar(a, b) || b.item.numero - a.item.numero;
    });
    lista.append.apply(lista, ordenados.map(function (c) { return c.li; }));
  }

  // Quantos achados há em cada faixa; faixa vazia some.
  function contarFaixas() {
    filtros.querySelectorAll("[data-ate]").forEach(function (b) {
      var ate = Number(b.dataset.ate);
      var n = cartoes.filter(function (c) {
        return !ate || (temPreco(c.item) && c.item.preco <= ate);
      }).length;
      var rotulo = b.firstChild.textContent;
      b.querySelector(".conta").textContent = String(n);
      b.setAttribute("aria-label", rotulo + ", " + n + (n === 1 ? " achado" : " achados"));
      b.hidden = Boolean(ate) && n === 0;
    });
  }

  function definirLimite(valor) {
    limitePreco = valor;
    filtros.querySelectorAll("[data-ate]").forEach(function (b) {
      var ativo = Number(b.dataset.ate) === valor;
      b.setAttribute("aria-pressed", String(ativo));
      if (ativo) mostrarFaixa(b);
    });
  }

  // No celular as faixas rolam de lado: a escolhida não pode ficar fora da tela.
  function mostrarFaixa(botao) {
    var faixas = botao.parentNode;
    var inicio = botao.offsetLeft;
    var fim = inicio + botao.offsetWidth;
    if (inicio < faixas.scrollLeft || fim > faixas.scrollLeft + faixas.clientWidth) {
      faixas.scrollLeft = Math.max(0, fim - faixas.clientWidth + 16);
    }
  }

  function destacar(cartao) {
    clearTimeout(timerFoto);
    cartoes.forEach(function (c) {
      c.li.classList.toggle("destaque", c === cartao);
      c.ir.textContent = c === cartao ? "Ver oferta na " + loja(c.item) : "Ver oferta";
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

  // Faixa e ordem ficam no endereço: o link compartilhado abre do mesmo jeito.
  function atualizarEndereco(numero) {
    var p = new URLSearchParams();
    if (limitePreco) p.set("ate", String(limitePreco));
    if (ordem.value !== "novos") p.set("ordem", ordem.value);
    var consulta = p.toString() ? "?" + p.toString() : "";
    history.replaceState(null, "", location.pathname + consulta + (numero ? "#" + numero : ""));
  }

  function lerFiltrosDoEndereco() {
    var p = new URLSearchParams(location.search);
    var ate = Number(p.get("ate"));
    definirLimite(FAIXAS.indexOf(ate) !== -1 ? ate : 0);
    ordem.value = ORDENS.hasOwnProperty(p.get("ordem")) ? p.get("ordem") : "novos";
  }

  function mostrar() {
    var texto = busca.value.trim();
    var termo = semAcento(texto).replace(/^n[ºo°]?\s*(?=\d)/, "").trim();
    var numerico = /^\d+$/.test(termo);
    var visiveis = 0;
    var exato = null;

    cartoes.forEach(function (c) {
      var ver = !termo || (numerico ? c.item.numero === Number(termo) : c.chave.indexOf(termo) !== -1);
      if (!numerico && limitePreco && !(temPreco(c.item) && c.item.preco <= limitePreco)) ver = false;
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
        ? "Nenhum achado com “" + texto + "”" + (limitePreco ? " até R$ " + limitePreco : "") + ". Tente o número mostrado no vídeo."
        : "Nenhum achado até R$ " + limitePreco + " por enquanto.";
      definirAcao("Ver todos", verTodos);
    } else if (termo || limitePreco) {
      estado.textContent = visiveis + (visiveis === 1 ? " achado" : " achados") +
        (limitePreco ? " até R$ " + limitePreco : visiveis === 1 ? " encontrado" : " encontrados");
      definirAcao("Ver todos", verTodos);
    } else {
      estado.textContent = cartoes.length === 1
        ? "1 achado"
        : cartoes.length + " achados, " + LEGENDA_ORDEM[ordem.value];
    }
  }

  function aoDigitar() {
    mostrar();
    // Rolou a lista e digitou: volta ao começo do resultado, sob a etiqueta fixa.
    var topo = secao.getBoundingClientRect().top;
    if (topo < 0) window.scrollBy(0, topo - busca.form.offsetHeight - 16);
  }

  function lerEndereco() {
    var alvo = location.hash.replace("#", "");
    if (/^\d+$/.test(alvo)) busca.value = alvo;
  }

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
        maiorNumero = itens.reduce(function (m, i) { return Math.max(m, i.numero || 0); }, 0);
        lista.replaceChildren.apply(lista, cartoes.map(function (c) { return c.li; }));
        contarFaixas();
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
  filtros.addEventListener("click", function (evento) {
    var botao = evento.target.closest("button");
    if (!botao) return;
    definirLimite(Number(botao.dataset.ate));
    aoDigitar();
  });
  ordem.addEventListener("change", function () {
    ordenar();
    aoDigitar();
  });
  acao.addEventListener("click", function () {
    if (aoAgir) aoAgir();
  });
  window.addEventListener("hashchange", function () {
    lerEndereco();
    mostrar();
  });

  carregar();
})();
