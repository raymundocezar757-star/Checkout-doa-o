const { supabase } = require('./utils/db');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const amountCents = body.amount_cents;
    const { name, cpf, phone, utm_params } = body;

    // Validation
    if (!amountCents || isNaN(amountCents) || amountCents < 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, message: 'Doação mínima de R$ 10.' })
      };
    }

    if (!name || name.trim().length < 3) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, message: 'Nome inválido.' })
      };
    }

    if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, message: 'CPF inválido.' })
      };
    }

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, message: 'Telefone inválido.' })
      };
    }

    // Retrieve Payshark keys from DB
    const { data: pubKeyData } = await supabase.from('settings').select('value').eq('key', 'payshark_public_key');
    const { data: secKeyData } = await supabase.from('settings').select('value').eq('key', 'payshark_secret_key');
    const { data: hostData } = await supabase.from('settings').select('value').eq('key', 'payshark_api_host');

    const publicKey = pubKeyData && pubKeyData.length > 0 ? pubKeyData[0].value : '';
    const secretKey = secKeyData && secKeyData.length > 0 ? secKeyData[0].value : '';
    const apiHost = (hostData && hostData.length > 0 && hostData[0].value) || 'api.shieldtecnologia.com';

    let txId = '';
    let pixCode = '';
    let isMock = false;

    // Check if we should run in Mock Mode
    if (!publicKey || !secretKey || publicKey.trim() === '' || secretKey.trim() === '') {
      console.log('Running in MOCK mode (No Payshark API keys configured in settings).');
      isMock = true;
      txId = Math.floor(Date.now() / 1000).toString(); // Timestamp mock ID
      const amountReais = (amountCents / 100).toFixed(2);
      pixCode = `00020101021226830014br.gov.bcb.pix25610034a5d8f07d-3c40-4cb8-b90c-29dbfc88398c5204000053039865405${amountReais}5802BR5915Doador Anonimo6009SAO PAULO62070503***6304abcd`;
    } else {
      // Call Payshark API
      const auth = 'Basic ' + Buffer.from(publicKey + ':' + secretKey).toString('base64');
      
      const payload = {
        amount: amountCents,
        paymentMethod: 'pix',
        customer: {
          name: name,
          email: `doador.${phone.replace(/\D/g, '')}@campanha.com`, // safe email generation
          document: {
            number: cpf.replace(/\D/g, ''),
            type: 'cpf'
          },
          phone: phone.replace(/\D/g, '')
        },
        items: [
          {
            title: 'Contribuicao Campanha',
            unitPrice: amountCents,
            quantity: 1,
            tangible: false
          }
        ],
        metadata: body.metadata || 'campanha-doacao'
      };

      console.log(`Sending payload to Payshark: https://${apiHost}/v1/transactions`);

      const response = await fetch(`https://${apiHost}/v1/transactions`, {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Payshark Error Response:', data);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({
            ok: false,
            message: data.message || 'Erro ao processar transação com a Payshark.'
          })
        };
      }

      txId = data.id.toString();
      pixCode = data.pix ? data.pix.qrcode : '';
    }

    // Save lead/order to Supabase
    const orderData = {
      tx_id: txId,
      name: name,
      cpf: cpf.replace(/\D/g, ''),
      phone: phone.replace(/\D/g, ''),
      amount_cents: amountCents,
      status: 'pending',
      pix_code: pixCode,
      utm_source: (utm_params && utm_params.src_utm) || null,
      utm_campaign: (utm_params && utm_params.camp_utm) || null,
      utm_medium: (utm_params && utm_params.med_utm) || null
    };

    const { error: dbError } = await supabase.from('orders').insert(orderData);

    if (dbError) {
      console.error('Error saving order to Supabase:', dbError);
      // We continue since the PIX was generated, but log the error
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        data: {
          id: txId,
          pixCode: pixCode,
          isMock: isMock
        }
      })
    };

  } catch (error) {
    console.error('Order Function Exception:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, message: 'Erro interno do servidor.' })
    };
  }
};
