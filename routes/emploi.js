const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];

// ==================================================
// ➕ AJOUTER / MODIFIER UNE SÉANCE — Admin seul
// ==================================================
router.post('/ajouter', protegerAdmin, async (req, res) => {
  try {
    const { id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle } = req.body;
    if (!id_classe || !id_matiere || !id_prof || !jour || !heure_debut || !heure_fin)
      return res.json({ ok: false, erreur: "⚠️ Classe, Matière, Professeur, Jour, Heure début et fin obligatoires" });

    // Vérifications références
    const [classeExiste, matiereExiste, profExiste] = await Promise.all([
      pool.query('SELECT 1 FROM classes WHERE id_classe = $1', [id_classe]),
      pool.query('SELECT 1 FROM matieres WHERE id_matiere = $1', [id_matiere]),
      pool.query('SELECT 1 FROM utilisateurs WHERE id = $1 AND role = $2', [id_prof, 'professeur'])
    ]);
    if (classeExiste.rows.length === 0) return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });
    if (matiereExiste.rows.length === 0) return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });
    if (profExiste.rows.length === 0) return res.json({ ok: false, erreur: "⚠️ Professeur introuvable" });

    await pool.query(`
      INSERT INTO emploi_temps(id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id_classe, jour, heure_debut) DO UPDATE
        SET id_matiere = $2, id_prof = $3, heure_fin = $6, salle = $7
    `, [id_classe, id_matiere, id_prof, jour, heure_debut, heure_fin, salle || null]);

    console.log(`✅ Séance enregistrée — ${jour} ${heure_debut}, Classe ${id_classe}`);
    res.json({ ok: true, message: "✅ Séance enregistrée avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR AJOUT SÉANCE :", e.code, e.message);
    if (e.code === '23505')
      return res.json({ ok: false, erreur : "⚠️ Une séance existe déjà à cet horaire pour cette classe" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 EMPLOI DU TEMPS COMPLET — Format adapté au HTML
// ==================================================
router.get('/tout', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.id_emploi, e.jour, e.heure_debut, e.heure_fin, e.salle,
             c.libelle_classe AS classe,
             m.libelle_matiere AS matiere,
             CONCAT(u.nom, ' ', u.prenom) AS prof
      FROM emploi_temps e
      JOIN classes c ON e.id_classe = c.id_classe
      JOIN matieres m ON e.id_matiere = m.id_matiere
      JOIN utilisateurs u ON e.id_prof = u.id
      ORDER BY
        CASE e.jour
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6
        END, e.heure_debut
    `);
    console.log(`✅ EDT complet chargé — ${rows.length} séance(s)`);
    res.json({ ok: true, lignes: rows }); // ✅ Renvoie "lignes" comme attendu par le HTML
  } catch (e) {
    console.error("❌ ERREUR EDT COMPLET :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🧑‍🏫 EMPLOI DU TEMPS DU PROFESSEUR
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const { rows } = await pool.query(`
      SELECT e.id_emploi, e.jour, e.heure_debut, e.heure_fin, e.salle,
             c.libelle_classe AS classe, m.libelle_matiere AS matiere
      FROM emploi_temps e
      LEFT JOIN classes c ON e.id_classe = c.id_classe
      LEFT JOIN matieres m ON e.id_matiere = m.id_matiere
      WHERE e.id_prof = $1
      ORDER BY
        CASE e.jour
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 ELSE 7
        END, e.heure_debut
    `, [id_prof]);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR EDT PROF :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📅 EMPLOI DU TEMPS PAR CLASSE
// ==================================================
router.get('/classe/:id_classe', async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });
    const { rows } = await pool.query(`
      SELECT e.id_emploi, e.jour, e.heure_debut, e.heure_fin, e.salle,
             c.libelle_classe AS classe, m.libelle_matiere AS matiere,
             CONCAT(u.nom, ' ', u.prenom) AS prof
      FROM emploi_temps e
      JOIN classes c ON e.id_classe = c.id_classe
      JOIN matieres m ON e.id_matiere = m.id_matiere
      JOIN utilisateurs u ON e.id_prof = u.id
      WHERE e.id_classe = $1
      ORDER BY
        CASE e.jour
          WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2
          WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4
          WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 ELSE 7
        END, e.heure_debut
    `, [id_classe]);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR EDT PAR CLASSE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ❌ SUPPRIMER UNE SÉANCE — Admin seul
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_emploi = parseInt(req.params.id);
    if (isNaN(id_emploi))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rowCount } = await pool.query(
      'DELETE FROM emploi_temps WHERE id_emploi = $1',
      [id_emploi]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Séance introuvable" });
    console.log(`🗑️ Séance supprimée — ID: ${id_emploi}`);
    res.json({ ok: true, message: "✅ Séance supprimée avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION SÉANCE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;