const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté
const verifprof = require('../middleware/verifprof');    // ✅ Après le token

// ✅ Protection groupée : Token + Rôle Professeur
const protegerProf = [veriftoken, verifprof];


// ==================================================
// ✅ MES CLASSES AFFECTÉES AU PROFESSEUR
// ==================================================
router.get('/mes-classes', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    console.log("🔍 Chargement classes pour ID Prof =", id_prof);

    const r = await pool.query(`
      SELECT DISTINCT c.id_classe, c.libelle_classe, c.cycle, c.capacite_max, c.statut
      FROM classes c
      INNER JOIN affectations_ens a ON c.id_classe = a.id_classe
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe
    `, [id_prof]);

    console.log(`✅ Classes trouvées : ${r.rows.length}`);
    res.json({ ok: true, classes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR CHARGEMENT CLASSES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 👥 ÉLÈVES D'UNE CLASSE
// ==================================================
router.get('/eleves-classe/:id_classe', protegerProf, async (req, res) => {
  try {
    const { id_classe } = req.params;
    const r = await pool.query(`
      SELECT 
        u.id AS id_eleve,
        u.nom,
        u.prenom,
        u.matricule,
        u.photo_profil AS photo_eleve,
        c.libelle_classe,
        c.cycle
      FROM utilisateurs u
      JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' 
        AND u.id_classe = $1
      ORDER BY u.nom, u.prenom
    `, [id_classe]);

    console.log(`✅ Élèves trouvés : ${r.rows.length}`);
    res.json({ ok: true, eleves: r.rows });
  } catch (e) {
    console.log("❌ ERREUR CHARGEMENT ÉLÈVES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 💾 ENREGISTRER / MODIFIER LES PRÉSENCES
// ==================================================
router.post('/marquer', protegerProf, async (req, res) => {
  try {
    const { id_classe, date_jour, presences, signature_prof, annee_scolaire, trimestre } = req.body;
    const id_prof = req.user.id;

    // ✅ Validation des champs obligatoires
    if (!id_classe || !date_jour || !presences || presences.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Classe, Date et liste des élèves sont obligatoires" });
    }

    // ✅ Enregistre chaque présence (INSERT ou UPDATE si déjà existante)
    for (const p of presences) {
      await pool.query(`
        INSERT INTO presences(
          id_eleve, id_classe, date_jour, statut, justification, 
          id_prof, signature_prof, annee_scolaire, trimestre
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id_eleve, id_classe, date_jour) DO UPDATE SET
          statut = EXCLUDED.statut,
          justification = EXCLUDED.justification,
          signature_prof = EXCLUDED.signature_prof
      `, [
        p.id_eleve, id_classe, date_jour, p.statut, p.justification || null,
        id_prof, signature_prof || null, annee_scolaire || null, trimestre || null
      ]);
    }

    console.log(`✅ ${presences.length} présence(s) enregistrée(s) — Classe ${id_classe}, Date ${date_jour}`);
    res.json({ 
      ok: true, 
      message: `✅ ${presences.length} présence(s) enregistrée(s) !`,
      details: { id_classe, date_jour, nombre_eleves: presences.length }
    });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT PRÉSENCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📖 CHARGER LES PRÉSENCES EXISTANTES POUR UNE CLASSE & UNE DATE
// ==================================================
router.post('/liste', protegerProf, async (req, res) => {
  try {
    const { id_classe, date_jour } = req.body;

    if (!id_classe || !date_jour) {
      return res.json({ ok: false, erreur: "Classe et Date sont obligatoires" });
    }

    const r = await pool.query(`
      SELECT 
        p.id_eleve, p.statut, p.justification, p.signature_prof,
        p.annee_scolaire, p.trimestre,
        u.nom, u.prenom, u.matricule, u.photo_profil
      FROM presences p
      JOIN utilisateurs u ON p.id_eleve = u.id
      WHERE p.id_classe = $1 AND p.date_jour = $2
      ORDER BY u.nom, u.prenom
    `, [id_classe, date_jour]);

    console.log(`✅ Présences chargées : ${r.rows.length} — Classe ${id_classe}, Date ${date_jour}`);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR CHARGEMENT PRÉSENCES :", e.message);
    res.json({ ok: true, lignes: [] });
  }
});


module.exports = router;