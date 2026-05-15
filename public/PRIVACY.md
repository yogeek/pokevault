# Politique de confidentialité — PokeVault

Dernière mise à jour : mai 2026

## Résumé

PokeVault ne collecte **aucune donnée personnelle**. Toutes vos données restent sur votre appareil.

## Ce qui reste sur votre appareil

| Donnée | Où | Durée |
|--------|-----|-------|
| Inventaire de cartes | IndexedDB (navigateur) | Jusqu'à désinstallation ou effacement |
| Wishlist | IndexedDB | Idem |
| Prix, notes, tags | IndexedDB | Idem |
| Clés API IA (si configurées) | IndexedDB | Idem |
| Snapshots partagés reçus | IndexedDB | Jusqu'à désépinglage |

## Ce qui quitte votre appareil

| Cas | Données transmises | Destinataire | Quand |
|-----|-------------------|--------------|-------|
| Chargement de l'app | Assets statiques (JS, CSS, images) | CDN hébergeur | Au lancement / mise à jour |
| Catalogue Pokémon | Requête HTTP GET vers le fichier JSON statique | CDN hébergeur | Au premier lancement |
| Images des cartes | Requête HTTP vers images.pokemontcg.io | Pokémon TCG API | À la première vue d'une carte |
| Partage par lien | Données du snapshot dans le **fragment URL** (`#...`) — jamais envoyé au serveur | Uniquement les destinataires du lien | Quand vous générez un lien |
| Partage par fichier | Fichier JSON via l'application de partage choisie | Application tierce choisie par vous | Quand vous partagez |
| Reconnaissance IA **si activée** | Image de la carte + prompt | Fournisseur IA choisi par vous | À chaque scan IA |

## Ce que nous ne faisons pas

- Pas de cookies.
- Pas de tracking, pas d'analytics, pas de Sentry, pas de logs.
- Pas de compte utilisateur.
- Pas de publicité.
- Pas de revente de données.

## Partage de collection

Les liens de partage sont des snapshots point-in-time. Ils sont lisibles par quiconque possède le lien. Nous vous en informons avant chaque génération. Vous pouvez en créer un nouveau à tout moment pour « invalider » l'ancien (il n'y a pas de mécanisme de révocation côté serveur puisqu'il n'y a pas de serveur).

## Reconnaissance IA (optionnelle)

Cette fonctionnalité est **désactivée par défaut**. Si vous l'activez, vous devez fournir votre propre clé API. La clé est stockée dans IndexedDB sur votre appareil. Elle est utilisée uniquement pour les appels au fournisseur que vous choisissez. PokeVault n'a pas accès à votre clé.

## Vos droits (RGPD)

Toutes vos données sont sous votre contrôle total. Pour les exporter ou les supprimer : **Paramètres → Exporter** ou désinstallez l'application et videz les données du navigateur.

## Contact

Ce projet est open-source. Signalez tout problème sur GitHub.
