const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifparent = require('../middleware/verifprof'); // ✅ Parent utilise le même système de token

// ==================================================
// 👶 MES ENFANTS — Liste des enfants liés au parent
// ==================================================
router.get('/mes-enfants', verifparent, async (req, res) => {
  try {
    const id_parent = req.user.id_utilisateur;

    const r = await pool.query(`
      SELECT DISTINCT u.id_utilisateur, u.nom, u.prenoms, u.photo_profil,
             c.libelle_classe, c.id_classe
      FROM utilisateurs u
      LEFT JOIN inscriptions i ON u.id_utilisateur = i.id_eleve
      LEFT JOIN classes c ON i.id_classe = c.id_classe
      WHERE u.id_parent = $1
      ORDER BY u.prenoms, u.nom
    `, [id_parent]);

    res.json({ ok: true, enfants: r.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📝 NOTES D'UN ENFANT
// ==================================================
router.get('/notes/:id_eleve', verifparent, async (req, res) => {
  try {
    const id_eleve = req.params.id_eleve;
    const trimestre = req.query.trimestre || '1';

    // ✅ Vérifie que l'enfant appartient bien au parent
    const verif = await pool.query(`
      SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 AND id_parent = $2
    `, [id_eleve, req.user.id_utilisateur]);
    if (!verif.rows.length) return res.json({ ok: false, erreur: "Accès refusé — Ce n'est pas votre enfant" });

    const notes = await pool.query(`
      SELECT n.*, m.libelle_matiere, m.coefficient
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.trimestre = $2
      ORDER BY m.libelle_matiere
    `, [id_eleve, trimestre]);

    // Calcul moyenne générale
    const moyennes = notes.rows.filter(n => n.moyenne).map(n => parseFloat(n.moyenne));
    const moyenne_generale = moyennes.length ? (moyennes.reduce((a,b)=>a+b,0)/moyennes.length).toFixed(2) : null;
    let mention = '';
    if(moyenne_generale >=18) mention='🏆 EXCELLENT';
    else if(moyenne_generale>=16) mention='⭐ TRÈS BIEN';
    else if(moyenne_generale>=14) mention='✅ BIEN';
    else if(moyenne_generale>=12) mention='📝 ASSEZ BIEN';
    else if(moyenne_generale>=10) mention='🟡 PASSABLE';
    else if(moyenne_generale) mention='🔴 INSUFFISANT';

    res.json({ ok: true, notes: notes.rows, moyenne_generale, mention });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 📅 EMPLOI DU TEMPS D'UN ENFANT
// ==================================================
router.get('/edt/:id_eleve', verifparent, async (req, res) => {
  try {
    const id_eleve = req.params.id_eleve;

    // Vérifie appartenance
    const verif = await pool.query(`
      SELECT i.id_classe FROM inscriptions i
      WHERE i.id_eleve = $1 AND EXISTS(SELECT 1 FROM utilisateurs WHERE id_utilisateur=$1 AND id_parent=$2)
    `, [id_eleve, req.user.id_utilisateur]);
    if (!verif.rows.length) return res.json({ ok: false, erreur: "Accès refusé" });
    const id_classe = verif.rows[0].id_classe;

    const seances = await pool.query(`
      SELECT e.*, j.libelle_matiere, j.jour, j.heure_debut, j.heure_fin, j.salle
      FROM emploi j
      JOIN classes c ON j.id_classe = c.id_classe
      WHERE j.id_classe = $1
      ORDER BY 
        CASE j.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END,
        j.heure_debut
    `, [id_classe]);

    res.json({ ok: true, seances: seances.rows });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

// ==================================================
// 💰 PAIEMENTS / FRAIS D'UN ENFANT
// ==================================================
router.get('/paiements/:id_eleve', verifparent, async (req, res) => {
  try {
    const id_eleve = req.params.id_eleve;

    // Vérifie appartenance
    const verif = await pool.query(`
      SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 AND id_parent = $2
    `, [id_eleve, req.user.id_utilisateur]);
    if (!verif.rows.length) return res.json({ ok: false, erreur: "Accès refusé" });

    const paiements = await pool.query(`
      SELECT 
        COALESCE(SUM(montant_total),0) AS totale,
        COALESCE(SUM(montant_paye),0) AS paye,
        COALESCE(SUM(montant_total - montant_paye),0) AS restant
      FROM paiements 
      WHERE reference_externe LIKE CONCAT('%', (SELECT nom FROM utilisateurs WHERE id_utilisateur=$1), '%')
         OR id_utilisateur = $1
    `, [id_eleve]);

    res.json({ ok: true, ...paiements.rows[0] });
  } catch (e) { res.json({ ok: false, erreur: e.message }); }
});

module.exports = router;