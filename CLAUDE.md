# visamundi-mcp — Instructions locales

## Périmètre de travail (règle absolue)

- **Reste strictement dans ce répertoire (`visamundi-mcp/`).** Ne lis, ne cherche, ne modifie et n'exécute jamais rien dans les autres dossiers du workspace `VISAMUNDI/` (repos frères comme `visamundi-widget-requirements`, `api-directus-extension`, `bo-production`, etc.), même pour "juste vérifier".
- Toute commande shell doit s'exécuter depuis ce répertoire ; pas de `cd ..`, pas de chemins vers `../`.
- Si une information semble n'exister que dans un autre projet, **demande à l'utilisateur** au lieu d'aller la chercher.

## Ce projet

Cloudflare Worker exposant le MCP Visamundi (`https://mcp.visamundi.io/`) :
- Route publique `/` : `list_visas`, `get_visa`, `get_visa_requirements`, `get_vaccines`, `get_customs`.
- Route partenaire `/partners` (bearer) : `list_countries`, `get_company`, `list_travel_groups`, … (voir `README.md`).
- Données amont : `https://connect.visamundi.io/v3` (clé `CONNECT_API_MCP_KEY` dans `.dev.vars`, jamais commitée).

## Conventions

- TypeScript, tests unitaires colocalisés (`*.test.ts`), `npm run dev:worker` pour le dev local.
- Ne jamais exposer `token` / `secret` / `internal_*` sur la route publique (voir `PUBLIC_REDACTED_KEY_PATTERNS` dans `src/api.ts`).
