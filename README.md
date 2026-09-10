# La Casa Fest — Painel administrativo

Painel web para acompanhar e operar os orçamentos enviados pelo site público da La Casa Fest. A interface é estática e consome a API protegida pelo cabeçalho `X-Admin-Token`.

## Funções

- Dashboard com totais, pendências, confirmações, faturamento e próximo evento.
- Lista de orçamentos com busca, ordenação e filtros.
- Confirmação e cancelamento de solicitações.
- Calendário de eventos e datas ocupadas.
- Visão financeira e relatórios.
- Tema claro/escuro, notificações e preferências salvas no navegador.
- URL da API configurável na tela de configurações.

## Estrutura

O código publicado está em `lacasafest-admin-v3/`.

- `index.html`: interface e marcação do painel.
- `app.js`: estado, autenticação, chamadas à API e regras da interface.
- `styles.css`: layout, responsividade e temas.
- `start-painel.sh`: servidor local com Python.
- `start-painel.bat`: inicialização local no Windows.

## Executar localmente

Linux/macOS:

```bash
cd lacasafest-admin-v3
./start-painel.sh
```

Ou, em qualquer sistema com Python 3:

```bash
cd lacasafest-admin-v3
python3 -m http.server 4173
```

Acesse `http://localhost:4173` e informe o token administrativo. O painel não deve ser aberto diretamente via `file://`.

## Publicação

O painel é um site estático: publique a pasta `lacasafest-admin-v3/` como raiz de um host protegido. Antes de disponibilizar publicamente:

1. Garanta que a API tenha CORS restrito ao domínio do painel.
2. Use HTTPS.
3. Configure o token apenas no navegador do administrador; nunca salve token no repositório.
4. Confirme que a API exige `X-Admin-Token` em todas as rotas administrativas.
5. Valide login, consulta, confirmação e cancelamento em ambiente de homologação.

A URL padrão atualmente configurada é `https://backend-olfs.onrender.com/api/orcamentos`. A API precisa estar online e responder ao contrato esperado pelo `app.js`.

## Segurança

O token fica no `localStorage` do navegador para manter a sessão. Use este painel somente em domínio HTTPS e em dispositivos confiáveis. Não compartilhe tokens em issues, commits, screenshots ou arquivos `.env` versionados.

## Relação com o site público

O site público envia solicitações sem token para `POST /api/orcamentos`. O painel consulta e administra os registros usando o mesmo recurso com autenticação por `X-Admin-Token`. O backend é obrigatório para que o formulário e o painel funcionem.
