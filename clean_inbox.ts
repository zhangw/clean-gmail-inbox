import * as fs from 'fs';
import * as readline from 'readline';
import { google } from 'googleapis';
google.options({
  // All requests made with this object will use these settings unless overridden.
  timeout: 30000,
  retry: true,
  retryConfig: {
    retry: 20,
    retryDelay: 1000,
  }
});
const invokeApiDelay = 50;
const batchSize = 500;

// If modifying these scopes, delete token.json.
const SCOPES = ['https://mail.google.com/',
'https://www.googleapis.com/auth/gmail.metadata',
'https://www.googleapis.com/auth/gmail.modify',
'https://www.googleapis.com/auth/gmail.readonly',];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content.toString()), listAndDeleteMails);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token.toString()));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listLabels(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  gmail.users.labels.list({
    userId: 'me',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const labels = res.data.labels;
    if (labels.length) {
      console.log('Labels:');
      labels.forEach((label) => {
        console.log(`- ${label.name}`);
      });
    } else {
      console.log('No labels found.');
    }
  });
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

async function listAndDeleteMails(auth) {
  let counter = 0;
  while (true) {
    const gmail = google.gmail({version: 'v1', auth});
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: batchSize });
    const _messages = res.data.messages;
    if (!_messages || _messages.length == 0) {
      console.log("no more mails, exited");
      break;
    }
    const ids = new Array();
    _messages.forEach((m) => {
      ids.push(m.id);
    });
    await deleteMails(gmail, ids);
    counter += ids.length;
    await delay(invokeApiDelay);
    console.log("total deleted:" + counter); 
  } 
}

async function deleteMails(gmail, mailIds) {
  const res = await gmail.users.messages.batchDelete({
    userId: 'me',
    requestBody: {
      "ids": mailIds
    },
  });
  // console.debug("mails deleted:" + JSON.stringify(mailIds) + "##" + res.status); 
  if (res.status != 204) {
    throw new Error("unexpected return code:" + res.status);
  }
}