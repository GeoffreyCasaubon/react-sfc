# RSFC Plugin — Claude Code Instructions

## Architecture
Monorepo pnpm avec packages/ : core, vite-plugin, webpack-loader, playground-next, playground-vite

## Règles absolues
- core/ = zéro dépendance runtime externe
- Tout en TypeScript strict
- Source maps générées sur chaque transform
- Tests unitaires dans core/ avant d'implémenter dans les plugins

## Conventions de nommage
- Parser → produit `RsfcDescriptor`
- Generator → produit `GeneratedOutput { code, map, virtualModules }`
- Blocs : script | clientScript | template | styles[]

## Stack
- pnpm workspaces
- tsup pour le build des packages
- vitest pour les tests
- tsup pour les déclarations de types

## Packages

| Package | Rôle |
|---|---|
| `@rsfc/core` | Parser + générateur, zéro dep runtime |
| `@rsfc/vite-plugin` | Plugin Vite consommant core |
| `@rsfc/webpack-loader` | Loader Webpack consommant core |
| `playground-vite` | Playground Vite + React 19 |
| `playground-next` | Playground Next.js 15 + React 19 |

## Ordre de développement
1. Types dans `core/src/types.ts`
2. Tests dans `core/src/parser.test.ts`
3. Implémentation dans `core/src/parser.ts` et `core/src/generator.ts`
4. Plugins (`vite-plugin`, `webpack-loader`) qui consomment core
5. Playgrounds pour intégration manuelle

## Agents spécialisés
Voir `.claude/agents/` pour les agents dédiés au parser, generator, vite et webpack.
