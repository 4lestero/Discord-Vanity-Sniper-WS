const fetch = require('node-fetch');
const WebSocket = require('ws');

const USER_TOKEN = '';
const URL_SNIPER_SELF_TOKEN = '';
const SNIPER_GUILD_ID = '';
const INFO_WEBHOOK_URL = '';

let socket = null;
let heartbeatInterval = null;

const guilds = {};

const claimVanityURL = async (vanityURL, guildId, event) => {
    const baseUrls = [
        'https://canary.discord.com/api/v10',
        'https://canary.discord.com/api/v8',
        'https://discord.com/api/v10'
    ];

    for (const baseUrl of baseUrls) {
        for (let i = 0; i < 3; i++) {
            await fetch(`${baseUrl}/guilds/${SNIPER_GUILD_ID}/vanity-url`, {
                method: 'PATCH',
                headers: {
                    Authorization: `${URL_SNIPER_SELF_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code: vanityURL })
            });
        }
    }
};

const updateGuildListAndSendInfo = (guildData, action) => {
    if (guildData.id) {
        guilds[guildData.id] = { vanity_url_code: guildData.vanity_url_code };
    }
    const vanities = Object.values(guilds).map(g => g.vanity_url_code).filter(v => v);
    sendInfoWebhook(vanities);
};

const sendInfoWebhook = async (vanities) => {
    const embed = {
        title: 'Vanity URLs',
        description: vanities.join('\n'),
        color: 3447003,
        timestamp: new Date()
    };

    await fetch(INFO_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
    });
};

const onMessage = async (message) => {
    const data = JSON.parse(message);

    if (data.op === 10) {
        heartbeatInterval = setInterval(() => {
            socket.send(JSON.stringify({ op: 1, d: null }));
        }, data.d.heartbeat_interval);

        socket.send(JSON.stringify({
            op: 2,
            d: {
                token: USER_TOKEN,
                properties: {
                    $os: 'linux',
                    $browser: 'my_bot',
                    $device: 'my_bot'
                },
                intents: 513
            }
        }));
    } else if (data.op === 0) { // DISPATCH
        if (data.t === "GUILD_UPDATE" || data.t === "GUILD_DELETE") {
            const oldVanity = guilds[data.d.id] ? guilds[data.d.id].vanity_url_code : null;
            guilds[data.d.id] = { vanity_url_code: data.d.vanity_url_code };

            if (oldVanity && oldVanity !== data.d.vanity_url_code) {
                claimVanityURL(oldVanity, data.d.id, 'GUILD_UPDATE');
            }
        } else if (data.t === "GUILD_CREATE" || data.t === "GUILD_DELETE") {
            updateGuildListAndSendInfo(data.d, data.t);
        } else if (data.t === "READY") {
            data.d.guilds.forEach(guild => {
                if (guild.vanity_url_code) {
                    guilds[guild.id] = { vanity_url_code: guild.vanity_url_code };
                }
            });
            const vanities = Object.values(guilds).map(g => g.vanity_url_code).filter(v => v);
            sendInfoWebhook(vanities);
        }
    }
};

const connectToWebSocket = () => {
    socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    socket.on('open', () => {
        console.log('Connected to Discord WebSocket Gateway.');
    });

    socket.on('message', onMessage);

    socket.on('close', () => {
        console.log('WebSocket connection closed. Reconnecting...');
        clearInterval(heartbeatInterval);
        setTimeout(connectToWebSocket, 1000);
    });

    socket.on('error', (error) => {
        console.error('WebSocket encountered an error:', error);
        clearInterval(heartbeatInterval);
    });
};

connectToWebSocket();
