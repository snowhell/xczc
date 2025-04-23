javascript: (function() {
  // Configurações globais
  const config = {
    API_KEY: "AIzaSyAHt-8oOSmZPB_BFr4CtxR5w82yEgGr_Oo",
    MODEL: "gemini-1.5-flash",
    MOBILE_BREAKPOINT: 768,
    MAX_RETRIES: 3
  };

  // Verifica se é dispositivo móvel
  function isMobile() {
    return window.innerWidth <= config.MOBILE_BREAKPOINT || 
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Versão universal para manipular textareas
  async function hackUniversalTextarea(container, texto) {
    const textarea = container.querySelector('textarea:not([aria-hidden="true"])');
    if (!textarea) {
      console.error("[ERROR] Textarea não encontrado");
      return false;
    }

    // Métodos de inserção em ordem de prioridade
    const methods = [
      tryReactMethod,
      tryInputEventsMethod,
      tryExecCommandMethod,
      tryFocusSelectionMethod,
      tryNativeInputMethod
    ];

    for (let i = 0; i < methods.length; i++) {
      if (await methods[i](textarea, texto)) {
        console.log(`[SUCCESS] Método ${methods[i].name} funcionou`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.error("[ERROR] Todas as tentativas falharam");
    return false;

    // Métodos internos
    async function tryReactMethod(textarea, text) {
      try {
        const reactKeys = Object.keys(textarea).filter(key =>
          key.startsWith("__reactProps$") || key.startsWith("__reactEventHandlers$") || key.startsWith("__reactFiber$")
        );

        for (const key of reactKeys) {
          const reactData = textarea[key];
          if (reactData?.onChange) {
            const event = {
              target: { value: text },
              currentTarget: { value: text },
              preventDefault: () => {},
              stopPropagation: () => {},
            };
            reactData.onChange(event);
            return true;
          }
        }
      } catch (e) {
        console.log("[DEBUG] React method failed:", e);
      }
      return false;
    }

    async function tryInputEventsMethod(textarea, text) {
      try {
        textarea.value = "";
        dispatchUniversalEvent(textarea, "input");
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        textarea.value = text;
        dispatchUniversalEvent(textarea, "input");
        dispatchUniversalEvent(textarea, "change");
        dispatchUniversalEvent(textarea, "blur");
        
        return textarea.value === text;
      } catch (e) {
        console.log("[DEBUG] Input events method failed:", e);
        return false;
      }
    }

    async function tryExecCommandMethod(textarea, text) {
      try {
        textarea.focus();
        textarea.select();
        document.execCommand("delete", false);
        document.execCommand("insertText", false, text);
        return textarea.value === text;
      } catch (e) {
        console.log("[DEBUG] execCommand method failed:", e);
        return false;
      }
    }

    async function tryFocusSelectionMethod(textarea, text) {
      try {
        textarea.focus();
        textarea.select();
        textarea.value = "";
        const inputEvt = new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        });
        textarea.value = text;
        textarea.dispatchEvent(inputEvt);
        return textarea.value === text;
      } catch (e) {
        console.log("[DEBUG] Focus selection method failed:", e);
        return false;
      }
    }

    async function tryNativeInputMethod(textarea, text) {
      try {
        textarea.focus();
        textarea.value = text;
        
        // Dispara eventos nativos
        const events = ['input', 'change', 'blur'];
        events.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true });
          textarea.dispatchEvent(event);
        });
        
        return textarea.value === text;
      } catch (e) {
        console.log("[DEBUG] Native input method failed:", e);
        return false;
      }
    }

    function dispatchUniversalEvent(element, type) {
      const event = new Event(type, { bubbles: true });
      element.dispatchEvent(event);
      
      if (isMobile()) {
        const touchEvent = new Event(`touch${type}`, { bubbles: true });
        element.dispatchEvent(touchEvent);
      }
    }
  }

  // Obter resposta da IA com tratamento de erros
  async function getAIResponse(prompt, retries = config.MAX_RETRIES) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.MODEL}:generateContent?key=${config.API_KEY}`;
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 1,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 8192,
            },
          }),
        }, 15000);

        const data = await response.json();

        if (!data.candidates?.[0]?.content?.parts) {
          throw new Error("Resposta inválida da API");
        }

        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        console.error(`[ERROR] Tentativa ${i + 1} falhou:`, err);
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }

  // Fetch com timeout
  function fetchWithTimeout(url, options, timeout) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  // Verificação robusta de página de redação
  function isEssayPage() {
    // Verifica por classes comuns do MUI
    const muiTitle = document.querySelector('p.MuiTypography-root.MuiTypography-body1');
    if (muiTitle && /reda[cçã]o/i.test(muiTitle.textContent)) {
      return true;
    }
    
    // Verifica por elementos específicos de redação
    const essayElements = [
      '.ql-editor', // Editor de texto
      '[class*="redacao"]', // Classes com "redacao"
      '[class*="Redacao"]', // Classes com "Redacao"
      '[class*="essay"]', // Classes com "essay"
      'textarea', // Campos de texto
      '[class*="enunciado"]', // Enunciados
      '[class*="criterios"]' // Critérios de avaliação
    ];
    
    for (const selector of essayElements) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    
    // Verifica por texto na página
    const textMatches = [
      /reda[cçã]o/i,
      /disserta[cçã]o/i,
      /texto dissertativo/i,
      /produ[cçã]o de texto/i
    ];
    
    const pageText = document.body.innerText;
    for (const regex of textMatches) {
      if (regex.test(pageText)) {
        return true;
      }
    }
    
    return false;
  }

  // Processamento completo da redação
  async function processarRedacao() {
    try {
      // Verificação mais abrangente da página
      if (!isEssayPage()) {
        showAlert("Local incorreto", "⚠️ Você precisa estar em uma página de redação ou produção de texto para usar este script.");
        return;
      }

      // Coleta de informações com múltiplos fallbacks
      const elements = {
        coletanea: ['.ql-editor', '[class*="texto-base"]', '[class*="coletanea"]'],
        enunciado: ['.ql-align-justify', '[class*="enunciado"]', 'p:not([class])'],
        generoTextual: ['[class*="genero"]', '[class*="tipo"]', '[class*="gênero"]'],
        criterios: ['[class*="criterios"]', '[class*="avaliacao"]', '[class*="rubrica"]']
      };

      const getContent = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) return el.innerHTML?.trim() || el.innerText?.trim() || "";
        }
        return "";
      };

      const data = {
        coletanea: getContent(elements.coletanea),
        enunciado: getContent(elements.enunciado),
        generoTextual: getContent(elements.generoTextual),
        criterios: getContent(elements.criterios)
      };

      // Geração do prompt com fallback
      const prompt = data.coletanea || data.enunciado 
        ? `Com base nestas informações, gere uma redação completa:
TITULO: [Título criativo relacionado ao tema]
TEXTO: [Redação em 3 parágrafos com introdução, desenvolvimento e conclusão]

Dados: ${JSON.stringify(data)}`
        : `Gere uma redação dissertativa-argumentativa sobre um tema atual, com:
TITULO: [Título criativo]
TEXTO: [Redação completa em 3 parágrafos]`;

      showLoading("Gerando redação", "Estamos criando sua redação com IA...");
      
      const respostaIA = await getAIResponse(prompt);
      
      // Processamento da resposta com validação
      const [titulo, texto] = extractFromResponse(respostaIA);
      const textoHumanizado = await humanizarTexto(texto);

      // Inserção dos textos com feedback
      await inserirTextos(titulo, textoHumanizado);
      
      showSuccessPopup();
    } catch (error) {
      console.error("[ERROR] Falha no processamento:", error);
      showAlert("Erro", "❌ Ocorreu um erro ao processar a redação. Tente recarregar a página e executar novamente.");
    }
  }

  function extractFromResponse(response) {
    // Padrões flexíveis para extração
    const patterns = [
      /TITULO[:\s]*([^\n]+)\s*TEXTO[:\s]*([\s\S]+)/i,
      /Título[:\s]*([^\n]+)\s*Texto[:\s]*([\s\S]+)/i,
      /Title[:\s]*([^\n]+)\s*Text[:\s]*([\s\S]+)/i,
      /([^\n]+)\n\n([\s\S]+)/
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        return [match[1].trim(), match[2].trim()];
      }
    }

    // Fallback: divide pelo primeiro \n\n
    const parts = response.split('\n\n');
    if (parts.length >= 2) {
      return [parts[0].trim(), parts.slice(1).join('\n\n').trim()];
    }

    // Último fallback: retorna tudo como texto
    return ["Redação Gerada", response.trim()];
  }

  async function humanizarTexto(texto) {
    try {
      const prompt = `Reescreva este texto para parecer humano:\n${texto}\n\nRegras:
- Mantenha o conteúdo original
- Adicione pequenas imperfeições
- Varie o vocabulário
- Use conectivos naturais
- Limite de 30 linhas`;
      
      return await getAIResponse(prompt);
    } catch (e) {
      console.error("Falha ao humanizar texto, usando original:", e);
      return texto;
    }
  }

  async function inserirTextos(titulo, texto) {
    showLoading("Inserindo texto", "Aguarde enquanto preenchemos os campos...");
    
    // Encontra todos os textareas visíveis
    const textareas = Array.from(document.querySelectorAll('textarea:not([aria-hidden="true"])'));
    
    if (textareas.length === 0) {
      throw new Error("Nenhum campo de texto encontrado");
    }

    // Preenche título se houver mais de um campo
    if (textareas.length >= 2) {
      await hackUniversalTextarea(textareas[0].parentElement, titulo);
      await new Promise(resolve => setTimeout(resolve, 800));
      await hackUniversalTextarea(textareas[1].parentElement, texto);
    } else {
      // Se só houver um campo, insere tudo
      await hackUniversalTextarea(textareas[0].parentElement, `${titulo}\n\n${texto}`);
    }
  }

  // UI Universal Melhorada
  function createUniversalPopup(title, content, buttons, imageUrl = "", isLoader = false) {
    // Remove popups existentes
    document.querySelectorAll('.universal-popup').forEach(el => el.remove());
    
    const popup = document.createElement('div');
    popup.className = 'universal-popup';
    popup.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,${isLoader ? '0.95' : '0.85'});
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      backdrop-filter: blur(3px);
    `;

    const popupContent = document.createElement('div');
    popupContent.style.cssText = `
      background-color: #1e1e1e;
      border-radius: ${isMobile() ? '12px' : '8px'};
      padding: ${isMobile() ? '20px' : '24px'};
      width: ${isMobile() ? '90%' : '450px'};
      max-width: 95%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(253, 121, 12, 0.3);
      border: 1px solid #fd790c;
      color: #f0f0f0;
      text-align: center;
    `;

    const popupTitle = document.createElement('h2');
    popupTitle.textContent = title;
    popupTitle.style.cssText = `
      color: #fd790c;
      margin: 0 0 15px 0;
      font-size: ${isMobile() ? '1.3rem' : '1.5rem'};
    `;

    const popupText = document.createElement('div');
    popupText.innerHTML = content;
    popupText.style.cssText = `
      margin: 0 0 20px 0;
      line-height: 1.5;
      font-size: ${isMobile() ? '0.95rem' : '1rem'};
    `;

    // Adiciona imagem se fornecida
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.cssText = `
        width: 100%;
        border-radius: 4px;
        margin-bottom: 15px;
        max-height: 150px;
        object-fit: cover;
      `;
      popupContent.appendChild(img);
    }

    // Adiciona loader se necessário
    if (isLoader) {
      const loader = document.createElement('div');
      loader.style.cssText = `
        border: 3px solid #f3f3f3;
        border-top: 3px solid #fd790c;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
      `;
      
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      
      document.head.appendChild(style);
      popupContent.appendChild(loader);
    }

    // Cria container de botões
    if (buttons && buttons.length > 0) {
      const buttonsContainer = document.createElement('div');
      buttonsContainer.style.cssText = `
        display: flex;
        flex-direction: ${isMobile() && buttons.length > 2 ? 'column' : 'row'};
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      `;

      buttons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.textContent = btnConfig.text;
        btn.style.cssText = `
          background-color: ${btnConfig.color};
          color: ${btnConfig.textColor || '#000'};
          border: none;
          padding: ${isMobile() ? '10px 12px' : '8px 16px'};
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          flex: ${isMobile() && buttons.length > 2 ? '1 1 100%' : '0 1 auto'};
          font-size: ${isMobile() ? '0.9rem' : '0.95rem'};
          min-width: ${isMobile() ? '100%' : '120px'};
          transition: all 0.2s;
        `;
        
        btn.onmouseenter = () => {
          btn.style.transform = 'scale(1.02)';
          btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        };
        
        btn.onmouseleave = () => {
          btn.style.transform = 'scale(1)';
          btn.style.boxShadow = 'none';
        };
        
        btn.onclick = (e) => {
          e.stopPropagation();
          btnConfig.action();
          if (!btnConfig.keepOpen) {
            document.body.removeChild(popup);
          }
        };
        
        buttonsContainer.appendChild(btn);
      });

      popupContent.appendChild(buttonsContainer);
    }

    popupContent.appendChild(popupTitle);
    popupContent.appendChild(popupText);
    popup.appendChild(popupContent);
    
    // Fechar ao clicar fora
    popup.onclick = (e) => {
      if (e.target === popup) {
        document.body.removeChild(popup);
      }
    };
    
    document.body.appendChild(popup);
    return popup;
  }

  function showAlert(title, message) {
    createUniversalPopup(title, message, [
      { text: "OK", color: "#fd790c", action: () => {} }
    ]);
  }

  function showLoading(title, message) {
    return createUniversalPopup(title, message, null, "", true);
  }

  function showSuccessPopup() {
    createUniversalPopup(
      "✅ Sucesso!", 
      "Redação gerada e inserida com sucesso!<br><br>Revise o texto antes de enviar.",
      [
        { text: "Fechar", color: "#fd790c", action: () => {} }
      ],
      "https://i.imgur.com/CAqIV2G.png"
    );
  }

  function showInitialPopup() {
    createUniversalPopup(
      "📝 Gerador de Redação IA",
      "Este script irá gerar uma redação completa automaticamente com base no conteúdo da página.<br><br>Deseja continuar?",
      [
        { 
          text: "🛠️ Gerar Redação", 
          color: "#fd790c", 
          action: processarRedacao 
        },
        { 
          text: "❌ Cancelar", 
          color: "#444", 
          textColor: "#fff",
          action: () => {} 
        }
      ],
      "https://i.pinimg.com/736x/01/cf/63/01cf63cb4ef2c6b2bd76e282007601ff.jpg"
    );
  }

  // Inicialização
  function init() {
    // Verificação robusta da página
    if (isEssayPage()) {
      showInitialPopup();
    } else {
      showAlert(
        "⚠️ Página Incorreta", 
        "Parece que você não está em uma página de redação.<br><br>" +
        "Este script funciona em páginas que contêm:<br>" +
        "- Campos para escrever redação<br>" +
        "- Enunciados de produção textual<br>" +
        "- Atividades de dissertação"
      );
    }
  }

  // Inicia o script
  init();
})();
