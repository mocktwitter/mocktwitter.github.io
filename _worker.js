export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/")) {
      const room = url.pathname.slice(4) || "lobby";
      const id = env.CHAT_ROOM.idFromName(room);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.sessions.add(server);
    const close = () => this.sessions.delete(server);
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    // Send last 50 messages on connect
    this.#sendRecent(server, 50).catch(() => {});

    server.addEventListener("message", async (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }
      if (data.type === "send") {
        const ts = Date.now();
        const text = (data.text || "").toString();
        const author = (data.author || "").toString();
        const room = "lobby";
        const { meta } = await this.env.DB.prepare(
          "INSERT INTO messages (room, ts, author, text) VALUES (?1, ?2, ?3, ?4)"
        ).bind(room, ts, author, text).run();
        const id = meta.last_row_id;
        const msg = JSON.stringify({ type:"msg", id, ts, author, text });
        for (const ws of this.sessions) try { ws.send(msg); } catch {}
      }
      if (data.type === "history") {
        const { results } = await this.env.DB.prepare(
          "SELECT id, ts, author, text FROM messages WHERE room=?1 ORDER BY id DESC LIMIT ?2"
        ).bind("lobby", 100).all();
        results.sort((a,b)=>a.id-b.id);
        server.send(JSON.stringify({ type:"history", messages: results }));
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async #sendRecent(ws, n) {
    const { results } = await this.env.DB.prepare(
      "SELECT id, ts, author, text FROM messages WHERE room=?1 ORDER BY id DESC LIMIT ?2"
    ).bind("lobby", n).all();
    results.sort((a,b)=>a.id-b.id);
    ws.send(JSON.stringify({ type:"history", messages: results }));
  }
}
