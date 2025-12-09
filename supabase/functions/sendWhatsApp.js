const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  const { message } = JSON.parse(event.body);

  const payload = {
    messaging_product: "whatsapp",
    to: "91XXXXXXXXXX",  // <-- your number with country code
    type: "text",
    text: { body: message }
  };

  const response = await fetch(
    "https://graph.facebook.com/v19.0/<YOUR_WHATSAPP_PHONE_ID>/messages",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer <YOUR_ACCESS_TOKEN>",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
};