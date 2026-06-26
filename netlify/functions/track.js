const { supabase } = require('./utils/db');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };
  }

  try {
    const txId = event.queryStringParameters.id || event.path.split('/').pop();

    if (!txId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, message: 'ID da transação ausente.' })
      };
    }

    // Retrieve keys from settings
    const { data: pubKeyData } = await supabase.from('settings').select('value').eq('key', 'payshark_public_key');
    const { data: secKeyData } = await supabase.from('settings').select('value').eq('key', 'payshark_secret_key');
    const { data: hostData } = await supabase.from('settings').select('value').eq('key', 'payshark_api_host');

    const publicKey = pubKeyData && pubKeyData.length > 0 ? pubKeyData[0].value : '';
    const secretKey = secKeyData && secKeyData.length > 0 ? secKeyData[0].value : '';
    const apiHost = (hostData && hostData.length > 0 && hostData[0].value) || 'api.shieldtecnologia.com';

    const numericId = Number(txId);
    const isMockId = !isNaN(numericId) && numericId > 1500000000 && numericId < 2500000000;

    let finalStatus = 'pending';

    // Mock Mode
    if (!publicKey || !secretKey || publicKey.trim() === '' || secretKey.trim() === '' || isMockId) {
      if (isMockId) {
        const elapsedSeconds = (Date.now() / 1000) - numericId;
        if (elapsedSeconds >= 12) {
          finalStatus = 'paid';
        }
      }
    } else {
      // Call Payshark API
      const auth = 'Basic ' + Buffer.from(publicKey + ':' + secretKey).toString('base64');
      
      const response = await fetch(`https://${apiHost}/v1/transactions/${txId}`, {
        method: 'GET',
        headers: {
          'Authorization': auth,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        finalStatus = data.status; // pending, paid, etc.
      } else {
        console.error('Payshark Track API Error:', data);
      }
    }

    // If order was paid, update status in Supabase database
    if (finalStatus === 'paid' || finalStatus === 'confirmed') {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('tx_id', txId);

      if (updateError) {
        console.error('Error updating order status in Supabase:', updateError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: finalStatus })
    };

  } catch (error) {
    console.error('Track Function Exception:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, message: 'Erro interno do servidor.' })
    };
  }
};
