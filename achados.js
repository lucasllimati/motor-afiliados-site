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
  var ESPERA_FOTO_MS = 450; // quem digita "12" passa pelo "1": só baixa a foto grande ao parar
  var cartoes = [];
  var maiorNumero = 0;
  var aoAgir = null;
  var timerFoto = null;

  function preco(valor) {
    if (valor === null || valor === undefined) return "";
    return "R$ " + Number(valor).toFixed(2).replace(".", ",");
  }

  function vendidos(n) {
    if (n < 1000) return n + " vendidos";
    var mil = (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(".", ",").replace(/,0$/, "");
    return mil + " mil vendidos";
  }

  // "2026-11-04" vira "4/11": o preço é o do dia do vídeo.
  function dataCurta(data) {
    var partes = /^\d{4}-(\d{2})-(\d{2})/.exec(data || "");
    return partes ? Number(partes[2]) + "/" + Number(partes[1]) : "";
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

    var dados = elemento("p", "dados");
    if (item.nota) {
      dados.append(elemento("span", "estrelas", "★ " + String(item.nota).replace(".", ",")));
    }
    if (item.vendas) dados.append(elemento("span", "", vendidos(item.vendas)));
    if (dataCurta(item.data)) dados.append(elemento("span", "", "preço de " + dataCurta(item.data)));

    link.append(
      moldura,
      elemento("h3", "", item.nome),
      elemento("p", "preco", preco(item.preco)),
      dados,
      elemento("span", "ir", "Ver oferta")
    );
    li.append(link);
    return { item: item, li: li, foto: foto, ir: link.lastChild, chave: semAcento(item.nome) };
  }

  function definirAcao(texto, funcao) {
    aoAgir = funcao || null;
    acao.textContent = texto || "";
    acao.hidden = !texto;
  }

  function verTodos() {
    busca.value = "";
    mostrar();
    busca.focus();
  }

  function destacar(cartao) {
    clearTimeout(timerFoto);
    cartoes.forEach(function (c) {
      c.li.classList.toggle("destaque", c === cartao);
      c.ir.textContent = c === cartao ? "Ver oferta na Shopee" : "Ver oferta";
    });
    if (cartao) {
      timerFoto = setTimeout(function () {
        cartao.foto.src = cartao.item.imagem;
      }, ESPERA_FOTO_MS);
    }
  }

  function atualizarEndereco(numero) {
    history.replaceState(null, "", location.pathname + location.search + (numero ? "#" + numero : ""));
  }

  function mostrar() {
    var texto = busca.value.trim();
    var termo = semAcento(texto).replace(/^n[ºo°]?\s*(?=\d)/, "").trim();
    var numerico = /^\d+$/.test(termo);
    var visiveis = 0;
    var exato = null;

    cartoes.forEach(function (c) {
      var ver = !termo || (numerico ? c.item.numero === Number(termo) : c.chave.indexOf(termo) !== -1);
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

    if (!cartoes.length) {
      estado.textContent = "Os primeiros achados aparecem aqui em breve.";
    } else if (exato) {
      estado.textContent = "Achado nº " + exato.item.numero;
      definirAcao("Ver todos", verTodos);
    } else if (numerico) {
      estado.textContent = "Ainda não existe o achado nº " + Number(termo) + ". O mais recente é o nº " + maiorNumero + ".";
      definirAcao("Ver todos", verTodos);
    } else if (!visiveis) {
      estado.textContent = "Nenhum achado com “" + texto + "”. Tente o número mostrado no vídeo.";
      definirAcao("Ver todos", verTodos);
    } else if (termo) {
      estado.textContent = visiveis + (visiveis === 1 ? " achado encontrado" : " achados encontrados");
      definirAcao("Ver todos", verTodos);
    } else {
      estado.textContent = cartoes.length === 1
        ? "1 achado com nota alta e muitas vendas"
        : cartoes.length + " achados com nota alta e muitas vendas";
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
        cartoes = itens
          .filter(function (item) {
            return /^https:\/\//.test(item.link || "") && /^https:\/\//.test(item.imagem || "");
          })
          .map(criarCartao);
        maiorNumero = itens.reduce(function (m, i) { return Math.max(m, i.numero || 0); }, 0);
        lista.replaceChildren.apply(lista, cartoes.map(function (c) { return c.li; }));
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
  limpar.addEventListener("click", verTodos);
  acao.addEventListener("click", function () {
    if (aoAgir) aoAgir();
  });
  window.addEventListener("hashchange", function () {
    lerEndereco();
    mostrar();
  });

  carregar();
})();
