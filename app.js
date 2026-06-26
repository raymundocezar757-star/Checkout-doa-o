(function() {
  'use strict';

  const SETUP = {
    sessionKey: '_p4n8q2w',
    createUrl: '/api/order',
    watchUrl: '/api/track',
    configUrl: '/api/config',
    dismissDelay: 5000,
    msgs: {
      badVal: 'Valor inválido.',
      procErr: 'Erro ao processar. Tente novamente.',
      cpyErr: 'Falha ao copiar. Selecione manualmente.',
      noCode: 'Código não disponível.'
    }
  };

  const DOM = {
    modal: document.getElementById('h0'),
    backdrop: null,
    xBtn: document.getElementById('h1'),
    amtLabel: document.getElementById('hA'),
    msgEl: document.getElementById('hS'),
    codeFrame: document.getElementById('h3'),
    codeBox: document.getElementById('h4'),
    cpyTrigger: document.getElementById('h5'),
    successPane: document.getElementById('h7'),
    payPane: document.getElementById('h2'),
    pickBtns: document.querySelectorAll('.vK[data-val]'),
    alertBar: document.querySelector('.nP'),
    
    // Lead Form DOM Elements
    leadForm: document.getElementById('hForm'),
    donorName: document.getElementById('donor-name'),
    donorCpf: document.getElementById('donor-cpf'),
    donorPhone: document.getElementById('donor-phone'),
    leadError: document.getElementById('lead-error-msg'),
    btnGeneratePix: document.getElementById('btn-generate-pix')
  };

  DOM.backdrop = DOM.modal ? DOM.modal.querySelector('.bg-shade') : null;

  const SYS = {
    stream: null, // Holds the setTimeout ID for long polling
    txRef: null,
    pending: false,
    timer: null,
    remaining: 1800,
    currentAmount: 0,
    pixelId: null,
    
    // Wrapper for Facebook Pixel event tracking
    trackEvent(name, data) {
      if (window.fbq) {
        try {
          if (data) {
            fbq('track', name, data);
          } else {
            fbq('track', name);
          }
          console.log(`FBPixel Event: ${name}`, data);
        } catch (e) {
          console.warn('FBPixel tracking error:', e);
        }
      }
    }
  };

  const Mask = {
    cpf(val) {
      return val
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        .substring(0, 14);
    },
    phone(val) {
      const clean = val.replace(/\D/g, '');
      if (clean.length <= 10) {
        return clean
          .replace(/(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
          .substring(0, 14);
      } else {
        return clean
          .replace(/(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
          .substring(0, 15);
      }
    }
  };

  function loadFBPixel(pixelId) {
    if (!pixelId) return;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', pixelId);
    fbq('track', 'PageView');
    console.log(`FBPixel Initialized: ${pixelId}`);
  }

  const UTM = {
    extract() {
      const qs = new URLSearchParams(window.location.search);
      const data = {
        src_ref: qs.get('src') || null,
        trk_sck: qs.get('sck') || null,
        src_utm: qs.get('utm_source'),
        camp_utm: qs.get('utm_campaign'),
        med_utm: qs.get('utm_medium'),
        cnt_utm: qs.get('utm_content'),
        trm_utm: qs.get('utm_term')
      };
      this.persist(data);
      return data;
    },

    persist(data) {
      try {
        localStorage.setItem(SETUP.sessionKey, JSON.stringify(data));
      } catch (e) {
        console.warn('u0', e);
      }
    },

    fetch() {
      const legacyKeys = [SETUP.sessionKey, '_k7m2p9q', 'trk_session'];
      try {
        for (let i = 0; i < legacyKeys.length; i++) {
          const k = legacyKeys[i];
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (i > 0) {
            try {
              localStorage.setItem(SETUP.sessionKey, raw);
            } catch (e) { /* ignore */ }
          }
          return data;
        }
        return {};
      } catch (e) {
        console.warn('u1', e);
        return {};
      }
    }
  };

  const Timer = {
    begin() {
      this.halt();
      SYS.remaining = 1800;
      this.refresh();

      SYS.timer = setInterval(() => {
        SYS.remaining--;
        this.refresh();

        if (SYS.remaining <= 0) {
          this.halt();
          alert('Tempo expirado! Por favor, gere um novo código PIX.');
          Overlay.dismiss();
        }
      }, 1000);
    },

    halt() {
      if (SYS.timer) {
        clearInterval(SYS.timer);
        SYS.timer = null;
      }
    },

    refresh() {
      const timerEl = document.getElementById('h6');
      if (!timerEl) return;

      const m = Math.floor(SYS.remaining / 60);
      const s = SYS.remaining % 60;
      timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

      if (SYS.remaining < 300) {
        timerEl.style.color = '#F44336';
      }
    }
  };

  const Overlay = {
    show() {
      if (!DOM.modal) return;
      DOM.modal.style.display = 'flex';
      DOM.modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      DOM.modal.classList.add('active');
      if (DOM.alertBar) {
        DOM.alertBar.style.display = 'block';
        DOM.alertBar.style.visibility = 'visible';
      }
      
      // Initially show lead form and hide payment panel
      if (DOM.leadForm) DOM.leadForm.style.display = 'block';
      if (DOM.payPane) DOM.payPane.style.display = 'none';
      if (DOM.leadError) DOM.leadError.style.display = 'none';
      
      // Trigger pixel InitiateCheckout
      SYS.trackEvent('InitiateCheckout');
    },

    dismiss() {
      if (!DOM.modal) return;
      DOM.modal.setAttribute('aria-hidden', 'true');
      DOM.modal.classList.remove('active');
      document.body.style.overflow = '';

      Timer.halt();
      Tracker.end(); // Stop status polling loop

      setTimeout(() => {
        DOM.modal.style.display = 'none';
        this.wipe();
      }, 300);

      DOM.pickBtns.forEach(b => b.disabled = false);
      const customSubmit = document.getElementById('custom-val-submit');
      const customAmount = document.getElementById('custom-amount-input');
      if (customSubmit) customSubmit.disabled = false;
      if (customAmount) customAmount.disabled = false;
    },

    wipe() {
      if (DOM.msgEl) {
        DOM.msgEl.textContent = '';
        DOM.msgEl.style.display = 'none';
        DOM.msgEl.style.color = '';
        DOM.msgEl.style.fontSize = '';
      }
      if (DOM.codeFrame) DOM.codeFrame.innerHTML = '';
      if (DOM.codeBox) DOM.codeBox.value = '';
      if (DOM.payPane) DOM.payPane.style.display = 'none';
      if (DOM.successPane) DOM.successPane.style.display = 'none';
      if (DOM.leadForm) DOM.leadForm.style.display = 'block';
      if (DOM.alertBar) {
        DOM.alertBar.style.display = 'block';
        DOM.alertBar.style.visibility = 'visible';
      }
      SYS.txRef = null;
      SYS.pending = false;
      SYS.remaining = 1800;
      SYS.currentAmount = 0;
    }
  };

  const Checkout = {
    launch(amt) {
      SYS.currentAmount = amt;
      if (DOM.amtLabel) {
        DOM.amtLabel.textContent = `R$ ${amt},00`;
      }
      Overlay.show();
    },

    async processOrder() {
      const name = DOM.donorName ? DOM.donorName.value.trim() : '';
      const cpf = DOM.donorCpf ? DOM.donorCpf.value.trim() : '';
      const phone = DOM.donorPhone ? DOM.donorPhone.value.trim() : '';

      // Validation
      if (name.split(' ').filter(x => x.length > 0).length < 2) {
        this.showError('Por favor, informe seu nome completo.');
        return;
      }

      if (cpf.replace(/\D/g, '').length !== 11) {
        this.showError('Por favor, informe um CPF válido.');
        return;
      }

      if (phone.replace(/\D/g, '').length < 10) {
        this.showError('Por favor, informe um telefone/WhatsApp válido.');
        return;
      }

      this.showError(''); // Clear error

      // Disable form inputs
      if (DOM.btnGeneratePix) DOM.btnGeneratePix.disabled = true;
      if (DOM.donorName) DOM.donorName.disabled = true;
      if (DOM.donorCpf) DOM.donorCpf.disabled = true;
      if (DOM.donorPhone) DOM.donorPhone.disabled = true;

      SYS.pending = true;

      // Track Lead in Pixel
      SYS.trackEvent('Lead', { content_name: 'Lead Doador' });

      try {
        const utmData = UTM.fetch();
        const resp = await fetch(SETUP.createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_cents: SYS.currentAmount * 100,
            name: name,
            cpf: cpf,
            phone: phone,
            utm_params: utmData,
            metadata: 'campanha-doacao'
          })
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.message || `Erro HTTP ${resp.status}`);
        }

        const result = await resp.json();

        if (!result.ok || !result.data) {
          throw new Error('Resposta de servidor inválida.');
        }

        // Successfully generated PIX!
        // Hide lead form, show payment panels
        if (DOM.leadForm) DOM.leadForm.style.display = 'none';
        if (DOM.payPane) DOM.payPane.style.display = 'block';

        this.onReady(result.data);

      } catch (e) {
        console.error('Process Order Error:', e);
        this.showError(`❌ Erro: ${e.message}`);
      } finally {
        // Re-enable form inputs
        if (DOM.btnGeneratePix) DOM.btnGeneratePix.disabled = false;
        if (DOM.donorName) DOM.donorName.disabled = false;
        if (DOM.donorCpf) DOM.donorCpf.disabled = false;
        if (DOM.donorPhone) DOM.donorPhone.disabled = false;
        SYS.pending = false;
      }
    },

    showError(msg) {
      if (!DOM.leadError) return;
      if (msg) {
        DOM.leadError.textContent = msg;
        DOM.leadError.style.display = 'block';
      } else {
        DOM.leadError.style.display = 'none';
      }
    },

    onReady(info) {
      const { id, pixCode, pixSvg } = info;

      if (!id || !pixCode) {
        throw new Error('Dados de transação incompletos');
      }

      SYS.txRef = id;

      if (pixSvg && DOM.codeFrame) {
        DOM.codeFrame.innerHTML = pixSvg;
      } else if (pixCode && DOM.codeFrame && typeof QRCode !== 'undefined') {
        DOM.codeFrame.innerHTML = '';
        QRCode.toCanvas(pixCode, { width: 200 }, (e, canvas) => {
          if (e) {
            console.error('q0', e);
            DOM.codeFrame.innerHTML = '<p style="color:#d32f2f;padding:1rem;font-size:0.8rem">Erro ao gerar QR Code</p>';
          } else {
            DOM.codeFrame.appendChild(canvas);
          }
        });
      }

      if (DOM.codeBox) {
        DOM.codeBox.value = pixCode;
      }

      if (DOM.alertBar) {
        DOM.alertBar.style.display = 'block';
        DOM.alertBar.style.visibility = 'visible';
      }

      Timer.begin(); // Start the countdown timer now
      Tracker.begin(id);
    }
  };

  const Tracker = {
    begin(txId) {
      this.end();

      const checkStatus = async () => {
        try {
          const resp = await fetch(`${SETUP.watchUrl}?id=${txId}`);
          if (!resp.ok) {
            if (SYS.stream) {
              SYS.stream = setTimeout(checkStatus, 3000);
            }
            return;
          }
          
          const msg = await resp.json();

          if (msg.status === 'paid') {
            this.onConfirmed();
          } else if (SYS.stream) {
            // Keep polling every 3 seconds if still tracking
            SYS.stream = setTimeout(checkStatus, 3000);
          }
        } catch (e) {
          console.error('e0', e);
          if (SYS.stream) {
            SYS.stream = setTimeout(checkStatus, 3000);
          }
        }
      };

      // Set stream timer reference
      SYS.stream = setTimeout(checkStatus, 1000);
    },

    end() {
      if (SYS.stream) {
        clearTimeout(SYS.stream);
        SYS.stream = null;
      }
    },

    onConfirmed() {
      // Fire Facebook Purchase event
      SYS.trackEvent('Purchase', {
        value: SYS.currentAmount,
        currency: 'BRL'
      });
      
      this.fireConversion();
      Timer.halt();

      if (DOM.payPane) DOM.payPane.style.display = 'none';
      if (DOM.successPane) DOM.successPane.style.display = 'block';

      this.end();

      setTimeout(() => {
        Overlay.dismiss();
      }, SETUP.dismissDelay);
    },

    fireConversion() {
      try {
        if (typeof utmify !== 'function' || !DOM.amtLabel) return;

        const val = parseInt(DOM.amtLabel.textContent.replace(/[^\d]/g, '')) || 0;

        utmify('event', 'Purchase', {
          currency: 'BRL',
          value: val
        });
      } catch (e) {
        // silent
      }
    }
  };

  const Clipboard = {
    async paste(txt) {
      if (!txt) {
        alert(SETUP.msgs.noCode);
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(txt);
          this.flash();
          return;
        } catch (e) {
          console.warn('c0', e);
        }
      }

      try {
        const tmpEl = document.createElement('textarea');
        tmpEl.value = txt;
        tmpEl.style.position = 'fixed';
        tmpEl.style.left = '-9999px';
        tmpEl.style.top = '-9999px';
        tmpEl.style.opacity = '0';
        document.body.appendChild(tmpEl);
        tmpEl.select();
        tmpEl.setSelectionRange(0, txt.length);

        const ok = document.execCommand('copy');
        document.body.removeChild(tmpEl);

        if (ok) {
          this.flash();
          return;
        } else {
          throw new Error('execCommand failed');
        }
      } catch (e) {
        console.error('c1', e);
        if (DOM.codeBox) {
          DOM.codeBox.select();
          DOM.codeBox.setSelectionRange(0, txt.length);
          alert('Por favor, pressione Ctrl+C (ou Cmd+C no Mac) para copiar o código selecionado.');
        } else {
          alert(SETUP.msgs.cpyErr);
        }
      }
    },

    flash() {
      if (!DOM.cpyTrigger) return;

      const prev = DOM.cpyTrigger.innerHTML;
      DOM.cpyTrigger.innerHTML = 'COPIADO!';
      DOM.cpyTrigger.style.background = '#4CAF50';

      setTimeout(() => {
        DOM.cpyTrigger.innerHTML = prev;
        DOM.cpyTrigger.style.background = '';
      }, 2500);
    }
  };

  const Scroll = {
    init() {
      document.querySelectorAll('a[href^="#"]').forEach(lnk => {
        lnk.addEventListener('click', (e) => {
          e.preventDefault();
          const target = lnk.getAttribute('href');
          const el = document.querySelector(target);

          if (el) {
            el.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        });
      });
    }
  };

  const Events = {
    setup() {
      this.attachOverlay();
      this.attachCards();
      this.attachCustomValue();
      this.attachLeadFormSubmit();
      this.attachInputMasks();
      this.attachCopy();
      this.attachKeys();
      Scroll.init();
    },

    attachOverlay() {
      if (DOM.xBtn) {
        DOM.xBtn.addEventListener('click', () => Overlay.dismiss());
      }
      if (DOM.backdrop) {
        DOM.backdrop.addEventListener('click', () => Overlay.dismiss());
      }
    },

    attachCards() {
      DOM.pickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const chosen = parseInt(btn.dataset.val);

          if (!chosen || isNaN(chosen)) {
            alert(SETUP.msgs.badVal);
            return;
          }

          if (chosen > 2000) {
            alert(SETUP.msgs.badVal);
            return;
          }

          Checkout.launch(chosen);
        });
      });
    },

    attachCustomValue() {
      const customBtn = document.getElementById('custom-val-btn');
      const inputBlock = document.getElementById('custom-val-input-block');
      const submitBtn = document.getElementById('custom-val-submit');
      const amountInput = document.getElementById('custom-amount-input');
      const errorMsg = document.getElementById('custom-val-error');

      if (customBtn && inputBlock) {
        customBtn.addEventListener('click', () => {
          const isHidden = inputBlock.style.display === 'none';
          inputBlock.style.display = isHidden ? 'block' : 'none';
          
          if (isHidden) {
            inputBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            amountInput.focus();
          }
        });
      }

      if (submitBtn && amountInput) {
        submitBtn.addEventListener('click', () => {
          const val = parseInt(amountInput.value);

          if (isNaN(val) || val < 10) {
            if (errorMsg) {
              errorMsg.style.display = 'block';
            }
            return;
          }

          if (errorMsg) {
            errorMsg.style.display = 'none';
          }

          Checkout.launch(val);
        });
      }
    },

    attachLeadFormSubmit() {
      if (DOM.btnGeneratePix) {
        DOM.btnGeneratePix.addEventListener('click', () => {
          Checkout.processOrder();
        });
      }
    },

    attachInputMasks() {
      if (DOM.donorCpf) {
        DOM.donorCpf.addEventListener('input', (e) => {
          e.target.value = Mask.cpf(e.target.value);
        });
      }
      if (DOM.donorPhone) {
        DOM.donorPhone.addEventListener('input', (e) => {
          e.target.value = Mask.phone(e.target.value);
        });
      }
    },

    attachCopy() {
      if (DOM.cpyTrigger) {
        DOM.cpyTrigger.addEventListener('click', () => {
          Clipboard.paste(DOM.codeBox ? DOM.codeBox.value : '');
        });
      }
    },

    attachKeys() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && DOM.modal && DOM.modal.getAttribute('aria-hidden') === 'false') {
          Overlay.dismiss();
        }
      });
    }
  };

  async function init() {
    UTM.extract();
    Events.setup();
    
    // Dynamic settings loading (e.g. Facebook Pixel)
    try {
      const resp = await fetch(SETUP.configUrl);
      if (resp.ok) {
        const config = await resp.json();
        if (config.fb_pixel_id) {
          SYS.pixelId = config.fb_pixel_id;
          loadFBPixel(config.fb_pixel_id);
        }
      }
    } catch (e) {
      console.warn('Failed to load dynamic config:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
