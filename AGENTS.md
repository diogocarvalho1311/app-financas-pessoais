# Instruções do projeto

## Cloudflare pessoal

- Este projeto usa o perfil salvo `pessoal` do CLI Cloudflare.
- Use `npx cf <comando> --profile pessoal` para operações remotas.
- Confira a identidade com `npx cf auth whoami --profile pessoal` antes da
  primeira operação remota da sessão.
- Para publicar, execute `npm run deploy -- --profile pessoal` nesta pasta.
- Reutilize o login existente; não troque a conexão Cloudflare do chat nem
  refaça a autenticação enquanto o perfil salvo estiver válido.
- Preserve o banco, os segredos e o Cron existentes. Os identificadores de
  infraestrutura ficam em `deployment.local.json`, ignorado pelo Git.
- Nunca publique dados financeiros reais, senhas, sessões ou backups. A
  demonstração pública deve usar exclusivamente os exemplos de `src/demo.ts`.
