# Cursor Rules

Este diretório contém regras do Cursor para garantir melhores práticas de desenvolvimento.

## Regras Disponíveis

### 1. `typescript-standards.mdc`
Padrões e melhores práticas de TypeScript:
- Type safety
- Tratamento de erros
- Async/await
- Organização de código
- Null safety

### 2. `fastify-patterns.mdc`
Padrões e melhores práticas para Fastify:
- Registro de rotas
- Tratamento de erros
- Plugins e decorators
- Tipagem de requests/responses
- Performance

### 3. `socket-servers.mdc`
Padrões para servidores Socket.io:
- Configuração de sockets
- Manipulação de eventos
- Tratamento de erros
- Gerenciamento de recursos
- Segurança

### 4. `security-env.mdc`
Práticas de segurança e gerenciamento de variáveis de ambiente:
- Variáveis de ambiente (NUNCA commitar credenciais)
- Gerenciamento de secrets
- Validação de entrada
- Autenticação e autorização
- Prevenção de SQL injection
- Configuração de CORS
- Headers de segurança

### 5. `clean-code.mdc`
Princípios de código limpo e manutenibilidade:
- Organização de código
- Convenções de nomenclatura
- Comentários e documentação
- DRY (Don't Repeat Yourself)
- Tratamento de erros
- Testes
- Formatação de código
- Refatoração
- Logging

## Como Usar

As regras são aplicadas automaticamente pelo Cursor quando você trabalha no projeto. Elas fornecem orientação contextual ao AI assistant baseado nos arquivos que você está editando.

## Configuração de Ambiente

1. Copie `.env.example` para `.env`
2. Preencha as variáveis de ambiente com valores reais
3. **NUNCA** commite o arquivo `.env` (já está no `.gitignore`)

```bash
cp .env.example .env
```

## Segurança

⚠️ **IMPORTANTE**: 
- Nunca commite credenciais, API keys ou secrets no código
- Use sempre variáveis de ambiente para valores sensíveis
- Mantenha o `.env.example` atualizado com placeholders
- Use diferentes secrets para diferentes ambientes
