const express = require('express');
const router = express.Router();
const pool = require('../db');

// ✅ Import des middlewares — Vérifie que les noms correspondent EXACTEMENT aux fichiers
const veriftoken = require('../middleware/veriftoken');
const verifEleve = require('../middleware/verifEleve');

// ✅ Protection groupée : token valide + rôle élève
const protegerEleve = [veriftoken, verifEleve];


// ==================================================
// 👤 PROFIL DE L'ÉLÈVE
// 🔒 Réservé : Élève authentifié
// ==================================================
router.get('/profil', protegerEleve, async (req, res) => {
  try {
    const id_eleve = req.user.id;

    const utilisateur = await pool.query(`
      SELECT u.*, c.libelle_classe, i.date_inscription,
             p.prenoms||' '||p.nom AS parent
      FROM utilisateurs u
      LEFT JOIN inscriptions i ON u.id = i.id_eleve
      LEFT JOIN classes c ON i.id_classe = c.id_classe
      LEFT JOIN utilisateurs p ON u.id_parent = p.id_utilisateur
      WHERE u.id = $1
      ORDER BY i.date_inscription DESC LIMIT 1
    `, [id_eleve]);

    if (!utilisateur.rows.length) {
      return res.json({ ok: false, erreur: "⚠️ Profil introuvable" });
    }

    console.log(`✅ Profil consulté — Élève ID: ${id_eleve}`);
    res.json({
      ok: true,
      utilisateur: utilisateur.rows[0],
      classe: { libelle_classe: utilisateur.rows[0].libelle_classe },
      date_inscription: utilisateur.rows[0].date_inscription,
      parent: utilisateur.rows[0].parent,
      annee_scolaire: '2025-2026'
    });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT PROFIL :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📝 MES NOTES
// 🔒 Réservé : Élève authentifié
// ==================================================
router.get('/notes', protegerEleve, async (req, res) => {
  try {
    const id_eleve = req.user.id;
    const trimestre = req.query.trimestre || '1';

    const notes = await pool.query(`
      SELECT n.*, m.libelle_matiere, m.coefficient
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.trimestre = $2
      ORDER BY m.libelle_matiere
    `, [id_eleve, trimestre]);

    // Calcul moyenne pondérée
    let sommePoints = 0, sommeCoef = 0;
    notes.rows.forEach(n => {
      if (n.moyenne && n.coefficient) {
        sommePoints += parseFloat(n.moyenne) * parseFloat(n.coefficient);
        sommeCoef += parseFloat(n.coefficient);
      }
    });
    const moyenne_generale = sommeCoef > 0 ? (sommePoints / sommeCoef).toFixed(2) : null;

    // Attribution de la mention
    let mention = '';
    if (moyenne_generale >= 18) mention = '🏆 EXCELLENT';
    else if (moyenne_generale >= 16) mention = '⭐ TRÈS BIEN';
    else if (moyenne_generale >= 14) mention = '✅ BIEN';
    else if (moyenne_generale >= 12) mention = '📝 ASSEZ BIEN';
    else if (moyenne_generale >= 10) mention = '🟡 PASSABLE';
    else if (moyenne_generale) mention = '🔴 INSUFFISANT';

    console.log(`✅ Notes consultées — Élève ID: ${id_eleve}, Trimestre: ${trimestre}`);
    res.json({ ok: true, notes: notes.rows, moyenne_generale, mention });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT NOTES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📅 MON EMPLOI DU TEMPS
// 🔒 Réservé : Élève authentifié
// ==================================================
router.get('/edt', protegerEleve, async (req, res) => {
  try {
    const id_eleve = req.user.id;

    // Récupérer la classe de l'élève depuis sa dernière inscription
    const classe = await pool.query(`
      SELECT i.id_classe FROM inscriptions i
      WHERE i.id_eleve = $1 ORDER BY i.date_inscription DESC LIMIT 1
    `, [id_eleve]);

    if (!classe.rows.length) {
      return res.json({ ok: false, erreur: "⚠️ Classe non trouvée" });
    }
    const id_classe = classe.rows[0].id_classe;

    // Récupérer les séances de la classe
    const seances = await pool.query(`
      SELECT j.*, m.libelle_matiere, s.libelle_salle
      FROM emploi j
      JOIN matieres m ON j.id_matiere = m.id_matiere
      LEFT JOIN salles s ON j.id_salle = s.id_salle
      WHERE j.id_classe = $1
      ORDER BY 
        CASE j.jour 
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
        END,
        j.heure_debut
    `, [id_classe]);

    // Construction du tableau HTML préformaté
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const heures = ['07:30', '08:20', '09:10', '10:00', '10:50', '11:40', '12:30', '13:20', '14:10', '15:00', '15:50'];

    let html = `<table class="table table-dark table-bordered table-sm">
      <thead><tr><th>Heure</th>${jours.map(j => `<th>${j}</th>`).join('')}</tr></thead><tbody>`;
    heures.forEach(h => {
      html += `<tr><td><strong>${h}</strong></td>`;
      jours.forEach(j => {
        const c = seances.rows.find(s => s.jour === j && s.heure_debut.startsWith(h.substring(0, 5)));
        html += c
          ? `<td class="table-primary small">${c.libelle_matiere}<br>${c.heure_debut.substring(0, 5)}-${c.heure_fin.substring(0, 5)}<br>${c.libelle_salle || ''}</td>`
          : `<td class="table-secondary bg-opacity-10"></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;

    console.log(`✅ EDT consulté — Élève ID: ${id_eleve}, Classe: ${id_classe}`);
    res.json({ ok: true, seances: seances.rows, html });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT EDT ÉLÈVE :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📢 ANNONCES CIBLÉES POUR L'ÉLÈVE
// 🔒 Réservé : Élève authentifié
// ==================================================
router.get('/annonces', protegerEleve, async (req, res) => {
  try {
    const id_eleve = req.user.id;

    // Récupérer la classe de l'élève pour le filtrage
    const infos = await pool.query(`
      SELECT i.id_classe FROM inscriptions i WHERE i.id_eleve = $1 ORDER BY i.date_inscription DESC LIMIT 1
    `, [id_eleve]);
    const id_classe = infos.rows[0]?.id_classe || null;

    // Sélectionner les annonces selon la cible : tous / élèves / cette classe
    const annonces = await pool.query(`
      SELECT * FROM annonces 
      WHERE public_cible = 'tous' 
         OR public_cible = 'eleve'
         OR (public_cible = 'classe' AND id_classe = $1)
      ORDER BY date_publication DESC LIMIT 15
    `, [id_classe]);

    console.log(`✅ Annonces consultées — Élève ID: ${id_eleve}, ${annonces.rows.length} annonce(s)`);
    res.json({ ok: true, annonces: annonces.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT ANNONCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;