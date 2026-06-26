const { supabase } = require('./utils/db');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Authentication check
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!token || token !== adminPassword) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ ok: false, message: 'Senha incorreta ou acesso não autorizado.' })
    };
  }

  try {
    // GET: List all orders and settings
    if (event.httpMethod === 'GET') {
      // 1. Fetch orders sorted by created_at DESC
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: ordersError.message }) };
      }

      // 2. Fetch all settings
      const settings = {};
      const settingKeys = [
        'payshark_public_key',
        'payshark_secret_key',
        'payshark_api_host',
        'fb_pixel_id',
        'wa_template_cobrança',
        'wa_template_copia_cola'
      ];

      for (const key of settingKeys) {
        const { data } = await supabase.from('settings').select('value').eq('key', key);
        settings[key] = data && data.length > 0 ? data[0].value : '';
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          orders: orders || [],
          settings: settings
        })
      };
    }

    // POST: Save settings
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { settings } = body;

      if (!settings || typeof settings !== 'object') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, message: 'Configurações inválidas.' })
        };
      }

      // Upsert each setting
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from('settings')
          .upsert({ key, value });

        if (error) {
          console.error(`Error saving setting ${key}:`, error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ ok: false, message: `Erro ao salvar configuração ${key}.` })
          };
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'Configurações salvas com sucesso!'
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };

  } catch (error) {
    console.error('Admin API Exception:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, message: 'Erro interno do servidor.' })
    };
  }
};
