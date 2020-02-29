#!/usr/bin/env node
// 2020 Daniel Varga (vargad88@gmail.com)


"use strict";

const fs = require("fs");
const WebSocket = require("ws");

const port = 14001;

console.log(`server listening on ${port}`);
const wss = new WebSocket.Server({ port: port });

class ClientConn {
    constructor(ws, remote_address) {
        this.ws = ws;
        this.remote_address = remote_address;
    }

    as_json() {
        return { obj_type: "player",
            obj_id: this.obj_id,
            dead: this.dead,
            character: this.character,
            x: this.x, y: this.y
        }
    }
};

let last_object_id = [];
let clients = [];
let characters = [];
let ammo = [];

function new_object_id() { return ++last_object_id; }

fs.readdir("last-guardian-sprites", (err, files) => {
    const unique = new Set();
    for (const file of files) {
        if (file.indexOf("_") < 0) continue;
        unique.add(file.split("_")[0]);
    }
    characters = Array.from(unique);
    console.log(`available characters: ${characters.join(", ")}`);
});

function send_all(msg) {
    for (const c of clients) c.ws.send(JSON.stringify(msg));
}

function send_player_update(client) {
    send_all({ type: "player_update", player: client.as_json() });
}

function send_object_remove(obj_id) {
    send_all({ type: "remove", obj_id: obj_id });
}

function distance(o1, o2) {
    const dx = o1.x-o2.x;
    const dy = o1.y-o2.y;
    return Math.sqrt(dx*dx+dy*dy);
}

const map = { width: 24, height: 24 };

setInterval(() => {
        for (const a of ammo) {
            a.x += 0.3*a.sx;
            a.y += 0.3*a.sy;
            if (a.x < 0 || a.y < 0 || a.x > map.width || a.y > map.height) {
                a.remove = true;
                send_object_remove(a.obj_id);
            }
            for (const c of clients) {
                if (c.obj_id != a.client_id && distance(a,c) < 0.8) {
                    c.dead = true;
                    send_player_update(c);
                    a.remove = true;
                    send_object_remove(a.obj_id);
                }
            }
        }
        ammo = ammo.filter(e => !(e.remove));
        send_all({ type: "ammo", ammo: ammo });
    }, 30);

wss.on('connection', function connection(ws, req) {
    const remote_address = req.connection.remoteAddress;
    const client = new ClientConn(ws, remote_address);
    client.character = characters[Math.floor(Math.random()*characters.length)];
    client.obj_id = new_object_id();
    client.dead = false;
    client.x = Math.random()*(map.width-1)+0.5;
    client.y = Math.random()*(map.height-1)+0.5;
    clients.push(client);
    console.log(`[${remote_address}] connected as ${client.character}`);

    client.ws.send(JSON.stringify({ type: "map",
            width: map.width, height: map.height,
            player_id: client.obj_id
        }));

    send_player_update(client);
    for (const c of clients)
        client.ws.send(JSON.stringify({ type: "player_update", player: c.as_json() }));

    ws.on("message", (data) => {
            const msg = JSON.parse(data);
            switch (msg.type) {
                case "move":
                    const nx = client.x + msg.x*0.1;
                    const ny = client.y + msg.y*0.1;
                    if (nx >= 0.5 && nx < map.width-0.5) client.x = nx;
                    if (ny >= 0.5 && ny < map.height-0.5) client.y = ny;
                    send_player_update(client);
                break;
                case "fire":
                    const dx = msg.target.x - client.x;
                    const dy = msg.target.y - client.y;
                    const length = Math.sqrt(dx*dx+dy*dy);
                    ammo.push({ obj_id: new_object_id(),
                            obj_type: "ammo", sprite: "plasma",
                            x: client.x, y: client.y,
                            sx: dx/length, sy: dy/length,
                            client_id: client.obj_id
                        });
                break;
                default:
                    console.log("unknown message:", msg);
            }
        });

    ws.on("close", () => {
            console.log(`[${remote_address}] disconnected`);
            clients = clients.filter(e => e !== client);
            send_object_remove(client.obj_id);
        });
});
