(function () { 
  'use strict' 

  const express = require('express');
  const bodyParser = require('body-parser');
  const config = require('./config/config');
  const apiai = require('apiai');
  const uuid = require('uuid');
  const axios = require('axios');
  const app = express();
  const PORT = process.env.PORT || 5000; 

  app.listen( PORT , () => {
    console.log('funcionando na porta: ', PORT);
  });
  
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static('public'));
 
  const sendTypingOn = (recipientId) => {
    let messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: 'typing_on'
    };
    enviarFacebook(messageData);
  }

  const sendTypingOff = (recipientId) => {
    let messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: 'typing_off'
    };
    enviarFacebook(messageData);
  }

  const sessionIds = new Map();

  const isDefined = (obj) => {
    if (typeof obj == 'undefined') {
      return false;
    }
    if (!obj) {
      return false;
    }
    return obj != null;
  }

  const DialogflowService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
    language: 'pt-BR',
    requestSource: 'fb'
  })
  
  app.get('/', (req, res) => {
    res.send('Funcionando!');
  });

  app.get('/webhook', (req, res) => {

    console.log('request');

    if (
      req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN
    ) {
      res.status(200).send(req.query['hub.challenge']);
    } else {
      console.error('Failed validation. Make sure the validation tokens match.');
      res.sendStatus(403);
    }

  });

  app.post('/webhook', async (req, res) => {
    let data = req.body;
    const senderId = data.entry[0].messaging[0].sender.id;
    const texto = data.entry[0].messaging[0].message.text;
    await enviarDialogflow(senderId, texto);
    res.sendStatus(200);
  })


  function enviarDialogflow (senderId, texto) {
    sendTypingOn(senderId);
    if (!sessionIds.has(senderId)) {
      sessionIds.set(senderId, uuid.v1());
    }
   
    let requestDialogflow = DialogflowService.textRequest(texto, { 
      sessionId: sessionIds.get(senderId)
    });
   
    requestDialogflow.on('response', async response => {
      if (isDefined(response.result)) {
        await decodeDialogflowResponse (senderId, response);
      }
    });
    
    requestDialogflow.on('error', error => console.log(error));
    requestDialogflow.end();
  }
  
  async function decodeDialogflowResponse (senderId, response) {
    sendTypingOff(senderId);
    const userText = response.result.resolvedQuery;
    const action = response.result.action
    const responseText = response.result.fulfillment.speech
    await gerarDadosDaMensagem(senderId, responseText);
  }

  async function gerarDadosDaMensagem(senderId, texto) {
    let DadosDaMensagem = {
      recipient: {
        id: senderId
      },
      message: {
        text: texto
      }
    };
    await enviarFacebook(DadosDaMensagem);
  }

  async function enviarFacebook(DadosDaMensagem) {
    const url = 'https://graph.facebook.com/v3.0/me/messages?access_token=' + config.FB_PAGE_TOKEN;
    await axios.post(url, DadosDaMensagem);
  }

})();