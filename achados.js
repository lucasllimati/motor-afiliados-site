// Vitrine de achados: lê achados.json (gerado pelo motor) e monta a lista numerada.
// Tudo com textContent (nunca innerHTML): o conteúdo vem de anúncios de terceiros.
"use strict";

(function () {
  var lista = document.getElementById("lista");
  var estado = document.getElementById("estado");
  var busca = document.getElementById("busca");
  var itens = [];

  function preco(valor) {
    if (valor === null || valor === undefined) return "";
    return "R$ " + Number(valor).toFixed(2).replace(".", ",");
  }

  function milhar(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function semAcento(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function cartao(item) {
    var li = document.createElement("li");
    li.className = "achado";
    li.id = "achado-" + item.numero;

    var numero = document.createElement("span");
    numero.className = "numero";
    numero.textContent = "nº " + item.numero;

    var foto = document.createElement("img");
    foto.src = item.imagem;
    foto.alt = item.nome;
    foto.loading = "lazy";
    foto.decoding = "async";
    foto.width = 400;
    foto.height = 400;

    var nome = document.createElement("h3");
    nome.textContent = item.nome;

    var dados = document.createElement("p");
    dados.className = "dados";
    var partes = [preco(item.preco)];
    if (item.nota) partes.push("⭐ " + String(item.nota).replace(".", ","));
    if (item.vendas) partes.push(milhar(item.vendas) + " vendidos");
    dados.textContent = partes.join(" · ");

    var botao = document.createElement("a");
    botao.className = "botao";
    botao.href = item.link;
    botao.rel = "sponsored nofollow noopener";
    botao.target = "_blank";
    botao.textContent = "Ver na Shopee";

    li.append(numero, foto, nome, dados, botao);
    return li;
  }

  function mostrar(filtro) {
    var termo = semAcento(filtro || "").replace(/^n[ºo°]?\s*/, "").trim();
    var visiveis = itens.filter(function (item) {
      if (!termo) return true;
      if (/^\d+$/.test(termo)) return String(item.numero) === termo;
      return semAcento(item.nome).indexOf(termo) !== -1;
    });
    lista.replaceChildren.apply(lista, visiveis.map(cartao));
    if (!itens.length) {
      estado.textContent = "Os primeiros achados aparecem aqui em breve.";
    } else if (!visiveis.length) {
      estado.textContent = "Nenhum achado com “" + filtro + "”. Confira o número no vídeo.";
    } else {
      estado.textContent = termo
        ? visiveis.length + " achado(s) encontrado(s)."
        : itens.length + (itens.length === 1 ? " achado." : " achados, do mais novo para o mais antigo.");
    }
  }

  busca.addEventListener("input", function () {
    mostrar(busca.value);
  });
  busca.form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    mostrar(busca.value);
  });

  fetch("achados.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (dados) {
      itens = Array.isArray(dados.itens) ? dados.itens : [];
      // Link direto para um achado: .../#12 abre já filtrado.
      var alvo = location.hash.replace("#", "");
      if (/^\d+$/.test(alvo)) busca.value = alvo;
      mostrar(busca.value);
    })
    .catch(function () {
      estado.textContent = "Não deu para carregar os achados agora. Tente de novo em instantes.";
    });
})();
