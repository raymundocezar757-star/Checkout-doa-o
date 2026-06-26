(function() {
  'use strict';

  const API_URL = '/api/admin-api';
  
  const DOM = {
    authScreen: document.getElementById('auth-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    adminPass: document.getElementById('admin-pass'),
    loginError: document.getElementById('login-error'),
    
    // Tabs and Nav
    tabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Orders list
    ordersList: document.getElementById('orders-list'),
    
    // Settings form
    settingsForm: document.getElementById('settings-form'),
    saveAlert: document.getElementById('save-alert')
  };

  let globalSettings = {};

  // Form Helper: format BRL currency
  function formatBRL(cents) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Auth helper
  function getToken() {
    return sessionStorage.getItem('admin_token');
  }

  function setToken(token) {
    sessionStorage.setItem('admin_token', token);
  }

  function clearToken() {
    sessionStorage.removeItem('admin_token');
  }

  // Show Auth Screen
  function showLogin() {
    DOM.authScreen.style.display = 'flex';
    DOM.dashboardScreen.style.display = 'none';
  }

  // Show Dashboard
  function showDashboard() {
    DOM.authScreen.style.display = 'none';
    DOM.dashboardScreen.style.display = 'flex';
  }

  // Fetch Data from Serverless Function
  async function loadDashboardData() {
    const token = getToken();
    if (!token) {
      showLogin();
      return;
    }

    try {
      const resp = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (resp.status === 401) {
        clearToken();
        showLogin();
        DOM.loginError.style.display = 'block';
        DOM.loginError.textContent = 'Sessão expirada. Faça login novamente.';
        return;
      }

      if (!resp.ok) {
        throw new Error(`Erro HTTP ${resp.status}`);
      }

      const result = await resp.json();
      if (result.ok) {
        globalSettings = result.settings || {};
        renderOrders(result.orders || []);
        fillSettingsForm(result.settings || {});
        showDashboard();
      } else {
        throw new Error(result.message || 'Falha ao carregar dados.');
      }

    } catch (e) {
      console.error(e);
      alert(`Erro: ${e.message}`);
    }
  }

  // Render Orders Table
  function renderOrders(orders) {
    if (!DOM.ordersList) return;
    DOM.ordersList.innerHTML = '';

    if (orders.length === 0) {
      DOM.ordersList.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum pedido ou lead registrado ainda.</td>
        </tr>
      `;
      return;
    }

    orders.forEach(order => {
      const tr = document.createElement('tr');
      
      const dateStr = new Date(order.created_at).toLocaleString('pt-BR');
      const amountStr = formatBRL(order.amount_cents);
      const statusClass = order.status === 'paid' ? 'paid' : 'pending';
      const statusText = order.status === 'paid' ? 'Pago' : 'Pendente';
      
      // Formatting UTM parameters display
      const utms = [];
      if (order.utm_source) utms.push(`Origem: ${order.utm_source}`);
      if (order.utm_campaign) utms.push(`Campanha: ${order.utm_campaign}`);
      if (order.utm_medium) utms.push(`Meio: ${order.utm_medium}`);
      const utmStr = utms.length > 0 ? utms.join('<br>') : '-';

      // WhatsApp recovery actions (only for pending orders)
      let waActionsHtml = '-';
      if (order.status !== 'paid') {
        waActionsHtml = `
          <div class="action-btn-group">
            <button class="recovery-btn cobranca-btn" data-phone="${order.phone}" data-name="${order.name}" data-val="${amountStr}">
              💬 Cobrança
            </button>
            <button class="recovery-btn pix-recover pix-btn" data-phone="${order.phone}" data-name="${order.name}" data-val="${amountStr}" data-pix="${order.pix_code || ''}">
              📋 Enviar Pix
            </button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td style="font-weight: 500;">${order.name}</td>
        <td>${formatPhoneDisplay(order.phone)}</td>
        <td>${formatCPFDisplay(order.cpf)}</td>
        <td style="font-weight: 600;">${amountStr}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td style="font-size: 11px; color: var(--text-muted);">${utmStr}</td>
        <td>${waActionsHtml}</td>
      `;

      DOM.ordersList.appendChild(tr);
    });

    attachWhatsAppActions();
  }

  // Format Display Helpers
  function formatPhoneDisplay(phone) {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.substring(2, 4)}) ${clean.substring(4, 9)}-${clean.substring(9)}`;
    }
    if (clean.length === 10) {
      return `(${clean.substring(2, 4)}) ${clean.substring(4, 8)}-${clean.substring(8)}`;
    }
    return phone;
  }

  function formatCPFDisplay(cpf) {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length === 11) {
      return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9)}`;
    }
    return cpf;
  }

  // Pre-fill settings form
  function fillSettingsForm(settings) {
    const fields = [
      'payshark_public_key',
      'payshark_secret_key',
      'payshark_api_host',
      'fb_pixel_id',
      'fb_pixel_token',
      'wa_template_cobrança',
      'wa_template_copia_cola'
    ];

    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) {
        el.value = settings[f] || '';
      }
    });

    // Handle card_enabled toggle
    const cardToggle = document.getElementById('card_enabled');
    const cardStatus = document.getElementById('card-toggle-status');
    const isEnabled = settings['card_enabled'] === 'true' || settings['card_enabled'] === true;
    if (cardToggle) cardToggle.checked = isEnabled;
    if (cardStatus) {
      cardStatus.textContent = isEnabled ? 'Ativado' : 'Desativado';
      cardStatus.className = 'toggle-status ' + (isEnabled ? 'on' : 'off');
    }
  }

  // Attach recovery events
  function attachWhatsAppActions() {
    // Cobrança (WhatsApp 1)
    document.querySelectorAll('.cobranca-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = formatPhoneForWA(btn.dataset.phone);
        const name = btn.dataset.name;
        const val = btn.dataset.val;

        const template = globalSettings['wa_template_cobrança'] || 
          'Olá {nome}, vi que você tentou ajudar a Laura com uma doação de R$ {valor}, mas o PIX ainda não foi confirmado. O seu apoio é muito importante! Podemos contar com você?';
        
        const message = template
          .replace(/{nome}/g, name)
          .replace(/{valor}/g, val.replace('R$', '').trim());

        const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
      });
    });

    // Enviar Pix (WhatsApp 2)
    document.querySelectorAll('.pix-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = formatPhoneForWA(btn.dataset.phone);
        const name = btn.dataset.name;
        const val = btn.dataset.val;
        const pixCode = btn.dataset.pix;

        if (!pixCode) {
          alert('Código Pix Copia e Cola indisponível para este pedido.');
          return;
        }

        const template = globalSettings['wa_template_copia_cola'] || 
          'Olá {nome}, aqui está a sua chave Pix Copia e Cola para a doação de R$ {valor}: {pix_code}';
        
        const message = template
          .replace(/{nome}/g, name)
          .replace(/{valor}/g, val.replace('R$', '').trim())
          .replace(/{pix_code}/g, pixCode);

        const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
      });
    });
  }

  function formatPhoneForWA(phone) {
    let clean = phone.replace(/\D/g, '');
    if (!clean.startsWith('55')) {
      clean = '55' + clean;
    }
    return clean;
  }

  // Save Settings Submit Handler
  if (DOM.settingsForm) {
    DOM.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = getToken();
      if (!token) return;

      const fields = [
        'payshark_public_key',
        'payshark_secret_key',
        'payshark_api_host',
        'fb_pixel_id',
        'fb_pixel_token',
        'wa_template_cobrança',
        'wa_template_copia_cola'
      ];

      const settingsData = {};
      fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
          settingsData[f] = el.value.trim();
        }
      });

      // Save card toggle
      const cardToggle = document.getElementById('card_enabled');
      settingsData['card_enabled'] = cardToggle ? String(cardToggle.checked) : 'false';

      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ settings: settingsData })
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.message || `Erro HTTP ${resp.status}`);
        }

        const result = await resp.json();
        if (result.ok) {
          globalSettings = settingsData;
          if (DOM.saveAlert) {
            DOM.saveAlert.style.display = 'block';
            setTimeout(() => {
              DOM.saveAlert.style.display = 'none';
            }, 3000);
          }
        } else {
          throw new Error(result.message || 'Falha ao salvar configurações.');
        }

      } catch (err) {
        console.error(err);
        alert(`Erro: ${err.message}`);
      }
    });
  }

  // Login handler
  if (DOM.loginBtn && DOM.adminPass) {
    DOM.loginBtn.addEventListener('click', async () => {
      const pass = DOM.adminPass.value;
      if (!pass) {
        DOM.loginError.style.display = 'block';
        DOM.loginError.textContent = 'Por favor, insira uma senha.';
        return;
      }

      DOM.loginBtn.disabled = true;
      DOM.loginBtn.textContent = 'VERIFICANDO...';

      try {
        const resp = await fetch(API_URL, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${pass}`
          }
        });

        if (resp.status === 401) {
          DOM.loginError.style.display = 'block';
          DOM.loginError.textContent = 'Senha incorreta.';
          return;
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const result = await resp.json();
        if (result.ok) {
          setToken(pass);
          globalSettings = result.settings || {};
          renderOrders(result.orders || []);
          fillSettingsForm(result.settings || {});
          showDashboard();
          DOM.adminPass.value = '';
          DOM.loginError.style.display = 'none';
        } else {
          throw new Error(result.message || 'Falha na resposta do servidor.');
        }

      } catch (err) {
        console.error(err);
        DOM.loginError.style.display = 'block';
        DOM.loginError.textContent = `Erro: ${err.message}`;
      } finally {
        DOM.loginBtn.disabled = false;
        DOM.loginBtn.textContent = 'ACESSAR PAINEL';
      }
    });

    // Login with Enter key
    DOM.adminPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        DOM.loginBtn.click();
      }
    });
  }

  // Logout handler
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', () => {
      clearToken();
      showLogin();
    });
  }

  // Tabs navigation click handlers
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.tabs.forEach(t => t.classList.remove('active'));
      DOM.tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // Initialization check
  async function init() {
    const token = getToken();
    if (token) {
      await loadDashboardData();
    } else {
      showLogin();
    }
  }

  // Toggle switch live feedback
  const cardToggleEl = document.getElementById('card_enabled');
  const cardStatusEl = document.getElementById('card-toggle-status');
  if (cardToggleEl && cardStatusEl) {
    cardToggleEl.addEventListener('change', () => {
      const on = cardToggleEl.checked;
      cardStatusEl.textContent = on ? 'Ativado' : 'Desativado';
      cardStatusEl.className = 'toggle-status ' + (on ? 'on' : 'off');
    });
  }

  init();

})();
