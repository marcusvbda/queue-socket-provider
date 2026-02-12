# Queue Socket Provider

Aplicação Fastify com sistema de filas/postback assíncrono e serviço de sockets em tempo real.

## 🚀 Features

### 1. Sistema de Queues/Postback
- Registro assíncrono de postbacks via API
- Resposta imediata ao cliente
- Execução em background com retry automático
- Monitoramento de status das requisições

### 2. Socket Service
- Conexão via WebSocket com autenticação
- Suporte a canais e usuários
- Dispatch de eventos via HTTP API
- Comunicação bidirecional em tempo real

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório
2. Instale as dependências:

```bash
npm install
```

3. Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

4. Edite o `.env` e configure:
   - `API_TOKEN`: Token de autenticação (gere um token seguro)
   - `PORT`: Porta do servidor (padrão: 3000)
   - `ALLOWED_ORIGINS`: Origens permitidas para CORS

5. Gere um token seguro:

```bash
openssl rand -hex 32
```

## 🏃 Executando

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

O servidor estará rodando em `http://localhost:3000`

## 📚 Documentação da API

### Autenticação

Todas as rotas da API requerem autenticação via header:

```
Authorization: Bearer <API_TOKEN>
```

Ou:

```
Authorization: <API_TOKEN>
```

---

## 🔄 Feature 1: Sistema de Queues/Postback

### Registrar um Postback

Registra uma requisição de postback que será executada assincronamente após a resposta.

**Endpoint:** `POST /api/queue/postback`

**Headers:**
```
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "postbackUrl": "https://example.com/webhook",
  "payload": {
    "event": "user.created",
    "userId": "123",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  },
  "method": "POST",
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

**Parâmetros:**
- `postbackUrl` (obrigatório): URL que receberá o postback
- `payload` (obrigatório): Dados a serem enviados no postback
- `method` (opcional): Método HTTP (GET, POST, PUT, PATCH). Padrão: POST
- `headers` (opcional): Headers customizados para o postback

**Resposta (200 OK):**
```json
{
  "success": true,
  "message": "Postback queued successfully",
  "queueId": "1705123456789-abc123def"
}
```

**Exemplo com cURL:**
```bash
curl -X POST http://localhost:3000/api/queue/postback \
  -H "Authorization: Bearer seu-token-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "postbackUrl": "https://example.com/webhook",
    "payload": {
      "event": "test",
      "message": "Hello World"
    }
  }'
```

### Verificar Status de um Postback

**Endpoint:** `GET /api/queue/postback/:id`

**Resposta (200 OK):**
```json
{
  "id": "1705123456789-abc123def",
  "postbackUrl": "https://example.com/webhook",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "retries": 0
}
```

**Status possíveis:**
- `pending`: Aguardando processamento
- `processing`: Sendo processado
- `completed`: Concluído com sucesso
- `failed`: Falhou após todas as tentativas

**Exemplo:**
```bash
curl -X GET http://localhost:3000/api/queue/postback/1705123456789-abc123def \
  -H "Authorization: Bearer seu-token-aqui"
```

### Listar Todos os Postbacks

**Endpoint:** `GET /api/queue/postback`

Retorna todos os postbacks registrados (útil para monitoramento).

**Exemplo:**
```bash
curl -X GET http://localhost:3000/api/queue/postback \
  -H "Authorization: Bearer seu-token-aqui"
```

### Como Funciona

1. **Cliente faz requisição** → API recebe o postback request
2. **Sistema registra** → Adiciona à fila em memória
3. **Resposta imediata** → Retorna `ok` com `queueId`
4. **Processamento assíncrono** → Sistema executa o postback em background
5. **Retry automático** → Em caso de falha, tenta novamente até 3 vezes

**Características:**
- ✅ Resposta imediata (não bloqueia o cliente)
- ✅ Processamento assíncrono
- ✅ Retry automático (até 3 tentativas)
- ✅ Timeout de 30 segundos por requisição
- ✅ Limite de 10 requisições concorrentes
- ✅ Limpeza automática de itens antigos (1 hora)

---

## 🔌 Feature 2: Socket Service

### Conectar ao Socket

O cliente pode conectar ao socket.io server passando `channel` e `userId` como query parameters, ou deixar o sistema gerar automaticamente.

**URL de Conexão:**
```
ws://localhost:3000/socket.io/?channel=my-channel&userId=user-123&token=<API_TOKEN>
```

**Parâmetros de Query:**
- `channel` (opcional): Nome do canal. Se não fornecido, será gerado automaticamente
- `userId` (opcional): ID do usuário. Se não fornecido, será gerado automaticamente
- `token` (obrigatório): Token de autenticação (mesmo `API_TOKEN`)

**Autenticação via Handshake:**
```javascript
const socket = io('http://localhost:3000', {
  path: '/socket.io',
  auth: {
    token: 'seu-token-aqui'
  },
  query: {
    channel: 'my-channel',
    userId: 'user-123'
  }
});
```

### Eventos do Socket

#### Evento: `connected`
Emitido quando a conexão é estabelecida com sucesso.

```javascript
socket.on('connected', (data) => {
  console.log('Conectado:', data);
  // {
  //   socketId: 'abc123',
  //   channel: 'my-channel',
  //   userId: 'user-123',
  //   connectedAt: '2024-01-15T10:30:00.000Z'
  // }
});
```

#### Evento: `message`
Recebe mensagens enviadas para este socket.

```javascript
socket.on('message', (data) => {
  console.log('Mensagem recebida:', data);
  // {
  //   event: 'custom-event',
  //   data: { ... },
  //   timestamp: '2024-01-15T10:30:00.000Z'
  // }
});
```

#### Evento: `message-received`
Confirmação de que uma mensagem foi recebida pelo servidor.

```javascript
socket.on('message-received', (data) => {
  console.log('Mensagem confirmada:', data);
});
```

#### Evento: `pong`
Resposta ao ping para keepalive.

```javascript
socket.on('pong', (data) => {
  console.log('Pong recebido:', data.timestamp);
});
```

### Enviar Mensagens via Socket

**Emitir mensagem:**
```javascript
socket.emit('message', {
  event: 'custom-event',
  data: {
    message: 'Hello from client',
    timestamp: new Date().toISOString()
  }
});
```

**Enviar ping:**
```javascript
socket.emit('ping');
```

### Exemplo Completo de Cliente

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/socket.io',
  auth: {
    token: 'seu-token-aqui'
  },
  query: {
    channel: 'my-channel',
    userId: 'user-123'
  }
});

// Conexão estabelecida
socket.on('connected', (data) => {
  console.log('Conectado:', data);
});

// Receber mensagens
socket.on('message', (message) => {
  console.log('Nova mensagem:', message);
});

// Enviar mensagem
socket.emit('message', {
  event: 'chat-message',
  data: {
    text: 'Hello World!'
  }
});

// Desconectar
socket.on('disconnect', () => {
  console.log('Desconectado');
});
```

---

## 📡 Dispatch de Eventos via HTTP API

### Dispatch para um Canal

Envia um evento para todos os usuários conectados em um canal específico.

**Endpoint:** `POST /api/socket/dispatch`

**Body:**
```json
{
  "channel": "my-channel",
  "event": "notification",
  "data": {
    "title": "Nova mensagem",
    "body": "Você tem uma nova mensagem"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Event dispatched successfully",
  "dispatchedCount": 5
}
```

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/socket/dispatch \
  -H "Authorization: Bearer seu-token-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "my-channel",
    "event": "notification",
    "data": {
      "message": "Hello Channel!"
    }
  }'
```

### Dispatch para um Usuário

Envia um evento para um usuário específico (em todos os canais que ele está conectado).

**Body:**
```json
{
  "userId": "user-123",
  "event": "private-message",
  "data": {
    "from": "admin",
    "message": "Esta é uma mensagem privada"
  }
}
```

### Dispatch para Usuário em Canal Específico

Envia um evento para um usuário específico em um canal específico.

**Body:**
```json
{
  "channel": "my-channel",
  "userId": "user-123",
  "event": "targeted-message",
  "data": {
    "message": "Mensagem direcionada"
  }
}
```

**Regras:**
- Se apenas `channel` for fornecido → envia para todos no canal
- Se apenas `userId` for fornecido → envia para o usuário em todos os canais
- Se ambos forem fornecidos → envia para o usuário específico no canal específico
- Pelo menos um (`channel` ou `userId`) deve ser fornecido

---

## 📊 Monitoramento

### Estatísticas de Conexões

**Endpoint:** `GET /api/socket/sockets/stats`

Retorna todas as conexões ativas.

**Resposta:**
```json
{
  "totalConnections": 10,
  "connections": [
    {
      "socketId": "abc123",
      "channel": "my-channel",
      "userId": "user-123",
      "connectedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Estatísticas de Canal

**Endpoint:** `GET /api/socket/sockets/channel/:channel/stats`

**Resposta:**
```json
{
  "channel": "my-channel",
  "userCount": 5,
  "socketCount": 8
}
```

### Health Check

**Endpoint:** `GET /health`

```bash
curl http://localhost:3000/health
```

---

## 🔒 Segurança

- ✅ Autenticação obrigatória via token em todas as rotas
- ✅ Token configurado via variável de ambiente
- ✅ CORS configurável
- ✅ Headers de segurança (Helmet)
- ✅ Validação de entrada com TypeBox
- ✅ Timeout em requisições HTTP (30s)

## ⚡ Performance e Escalabilidade

### Otimizações Implementadas

1. **Processamento Assíncrono**
   - Postbacks executados em background
   - Não bloqueia requisições HTTP

2. **Gerenciamento de Memória**
   - Limpeza automática de itens antigos
   - Estruturas de dados eficientes (Map, Set)

3. **Concorrência Controlada**
   - Limite de 10 postbacks simultâneos
   - Evita sobrecarga do sistema

4. **Retry Inteligente**
   - Backoff exponencial
   - Máximo de 3 tentativas

5. **Socket.io Otimizado**
   - Rooms para agrupamento eficiente
   - Transports otimizados (websocket + polling)

### Limitações Atuais

⚠️ **Importante:** Esta implementação usa armazenamento em memória. Para produção com múltiplas instâncias, considere:

- Redis para compartilhar estado entre instâncias
- Banco de dados para persistência de filas
- Message broker (RabbitMQ, Kafka) para filas distribuídas

---

## 🧪 Testando

### Testar Postback

1. Use um serviço como [webhook.site](https://webhook.site) para receber postbacks
2. Registre um postback:

```bash
curl -X POST http://localhost:3000/api/queue/postback \
  -H "Authorization: Bearer seu-token-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "postbackUrl": "https://webhook.site/unique-id",
    "payload": {
      "test": "data"
    }
  }'
```

3. Verifique o status:

```bash
curl -X GET http://localhost:3000/api/queue/postback/QUEUE_ID \
  -H "Authorization: Bearer seu-token-aqui"
```

### Testar Socket

Use o exemplo de cliente JavaScript acima ou ferramentas como [Socket.io Client](https://amritb.github.io/socketio-client-tool/).

---

## 📝 Estrutura do Projeto

```
queue-socket-provider/
├── src/
│   ├── config/
│   │   └── env.ts              # Configuração de ambiente
│   ├── middleware/
│   │   └── auth.ts              # Middleware de autenticação
│   ├── routes/
│   │   ├── queue.routes.ts      # Rotas de queue/postback
│   │   └── socket.routes.ts     # Rotas de socket/dispatch
│   ├── services/
│   │   ├── queue.service.ts     # Serviço de filas
│   │   └── socket.service.ts    # Serviço de sockets
│   ├── utils/
│   │   └── logger.ts            # Logger utilitário
│   └── index.ts                 # Entry point
├── .cursor/
│   └── rules/                   # Regras do Cursor
├── .env.example                 # Exemplo de variáveis de ambiente
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🐛 Troubleshooting

### Erro: "API_TOKEN is required"
- Verifique se o `.env` existe e contém `API_TOKEN`
- Certifique-se de que o token tem pelo menos 1 caractere

### Socket não conecta
- Verifique se o token está correto no handshake
- Confirme que a URL está correta (incluindo `/socket.io`)
- Verifique os logs do servidor

### Postback não executa
- Verifique os logs do servidor
- Confirme que a URL do postback é acessível
- Verifique o status via API

---

## 📄 Licença

MIT
