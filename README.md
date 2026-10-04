# 🏆 Game Tournoi

Suivi de tournoi pour les soirées jeux entre amis (2 à 8 joueurs).

Site statique sans installation : ouvrir `index.html`, ou l'héberger avec GitHub Pages
(*Settings → Pages → Deploy from a branch → `main` / root*).

## Fonctionnement

1. Ajouter les joueurs, cocher ceux présents ce soir.
2. Choisir les jeux de la soirée et leur format.
3. Saisir les résultats au fil de la soirée : le classement général se met à jour tout seul.

| Jeu | Type | Format |
| --- | --- | --- |
| Mortal Kombat 1 / Mortal Kombat (1992) | 1 contre 1, premier à 2 rounds | Poule, poule + finale, ou élimination directe |
| Party Animals | 1 contre 1, premier à 3 points | idem |
| Boomerang Fu | Chacun pour soi (2 à 6) | Plusieurs parties, on saisit les scores |
| SpeedRunners / SpeedRunners 2 | Jusqu'à 4, premier à 3 points | À 5 joueurs ou plus : rotation, chacun se repose à tour de rôle |
| Ultimate Chicken Horse | Jusqu'à 6 | Plusieurs parties, on saisit l'ordre d'arrivée |
| Gang Beasts | Dernier en vie gagne le round | Nombre de rounds au choix, on saisit les rounds gagnés |

**Points d'une partie chacun-pour-soi** à *k* joueurs : *k-1*, *k-2*, … 0, avec +1 pour le vainqueur.

**Points de soirée** : chaque jeu terminé rapporte 10 / 7 / 5 / 3 / 2 / 1 points selon la place finale
(les ex æquo se partagent les points).

Les données sont enregistrées dans le navigateur (localStorage) de l'appareil utilisé.

## En plus

- **Avatars** : un emoji ou une photo par joueur (touche l'avatar dans la liste des joueurs).
- **Ordre des jeux** : réglable à la main ou tiré au sort ; pendant la soirée, une roulette choisit le prochain jeu.
- **Prochain match** : un bandeau indique qui joue maintenant et qui joue ensuite.
- **Podium** : écran de fin avec confettis et image récap à partager.
- **Stats** : soirées gagnées, podiums, meilleur jeu, bête noire et victime préférée de chaque joueur.
