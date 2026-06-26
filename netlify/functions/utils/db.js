const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl !== 'sua_url_supabase' && supabaseKey !== 'sua_service_role_key_supabase') {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.log("Running with persistent MOCK JSON database.");
  
  const dbPath = path.join(__dirname, '..', '..', '..', 'mock_db.json');
  
  const readDb = () => {
    if (!fs.existsSync(dbPath)) {
      const initial = {
        orders: [],
        settings: {
          'payshark_public_key': '',
          'payshark_secret_key': '',
          'payshark_api_host': 'api.shieldtecnologia.com',
          'fb_pixel_id': '',
          'fb_pixel_token': '',
          'wa_template_cobrança': 'Olá {nome}, vi que você tentou ajudar a Laura com uma doação de R$ {valor}, mas o PIX ainda não foi confirmado. O seu apoio é muito importante! Podemos contar com você?',
          'wa_template_copia_cola': 'Olá {nome}, aqui está a sua chave Pix Copia e Cola para a doação de R$ {valor}: {pix_code}'
        }
      };
      fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    try {
      return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      return { orders: [], settings: {} };
    }
  };

  const writeDb = (data) => {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  };

  supabase = {
    from: (table) => {
      return {
        select: (fields) => {
          return {
            eq: (field, value) => {
              const db = readDb();
              if (table === 'settings') {
                const val = db.settings[value] || '';
                return Promise.resolve({ data: [{ key: value, value: val }], error: null });
              }
              if (table === 'orders') {
                const results = db.orders.filter(o => o[field] === value);
                return Promise.resolve({ data: results, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
            single: () => {
              return Promise.resolve({ data: null, error: null });
            },
            order: (field, opts) => {
              const db = readDb();
              if (table === 'orders') {
                const sorted = [...db.orders].sort((a, b) => b[field] > a[field] ? 1 : -1);
                return Promise.resolve({ data: sorted, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            }
          };
        },
        insert: (data) => {
          const db = readDb();
          const arr = Array.isArray(data) ? data : [data];
          arr.forEach(item => {
            const order = {
              id: item.id || Math.floor(Math.random() * 1000000).toString(),
              tx_id: item.tx_id,
              name: item.name,
              cpf: item.cpf,
              phone: item.phone,
              amount_cents: item.amount_cents,
              status: item.status || 'pending',
              pix_code: item.pix_code,
              utm_source: item.utm_source || null,
              utm_campaign: item.utm_campaign || null,
              utm_medium: item.utm_medium || null,
              created_at: new Date().toISOString(),
              paid_at: null
            };
            db.orders.push(order);
          });
          writeDb(db);
          return Promise.resolve({ data: arr, error: null });
        },
        update: (updates) => {
          return {
            eq: (field, value) => {
              const db = readDb();
              db.orders.forEach(o => {
                if (o[field] === value) {
                  Object.assign(o, updates);
                  if (updates.status === 'paid') {
                    o.paid_at = new Date().toISOString();
                  }
                }
              });
              writeDb(db);
              return Promise.resolve({ data: null, error: null });
            }
          };
        },
        upsert: (data) => {
          const db = readDb();
          const arr = Array.isArray(data) ? data : [data];
          arr.forEach(item => {
            db.settings[item.key] = item.value;
          });
          writeDb(db);
          return Promise.resolve({ data: arr, error: null });
        }
      };
    }
  };
}

module.exports = { supabase };
